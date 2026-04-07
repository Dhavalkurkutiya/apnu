import { db } from "@apnu/db";
import {
  message as messageSchema,
  conversation as conversationSchema,
} from "@apnu/db/schema/chat";
import { eq, inArray } from "drizzle-orm";
import { Redis } from "ioredis";
import { env } from "@apnu/env/server";

// Separate connection for queue operations
let queueRedis: Redis | null = null;

function getQueueRedis(): Redis | null {
  if (queueRedis) return queueRedis;
  try {
    queueRedis = new Redis(env.REDIS_URL, {
      maxRetriesPerRequest: 3,
      retryStrategy: (times) => Math.min(times * 100, 3000),
    });
    queueRedis.on("error", (err) => {
      console.error("[Queue Redis] Error:", err.message);
    });
    return queueRedis;
  } catch (err) {
    console.error("[Queue Redis] Failed to initialize:", err);
    return null;
  }
}

const QUEUE_KEY = "chat:message_write_queue";
const DLQ_KEY = "chat:message_write_dlq"; // Dead letter queue for failed messages

export type QueuedMessage = {
  id: string;
  conversationId: string;
  senderId: string;
  content: string;
  status: "sent";
  createdAt: string;
};

/**
 * Push a message to the persistence queue
 */
export async function queueMessageForPersistence(msg: QueuedMessage) {
  const redis = getQueueRedis();
  if (!redis) {
    // Fallback: try to persist immediately
    console.warn(
      "[Message Worker] Redis unavailable, attempting direct persistence"
    );
    await persistMessages([msg]).catch((err) => {
      console.error("[Message Worker] Direct persistence failed:", err);
    });
    return;
  }

  // Add retry count to message
  const msgWithMeta = {
    ...msg,
    _retryCount: 0,
    _queuedAt: Date.now(),
  };

  await redis.rpush(QUEUE_KEY, JSON.stringify(msgWithMeta));
}

/**
 * Persist messages to database
 */
async function persistMessages(messages: any[]) {
  if (messages.length === 0) return;

  try {
    // 1. Bulk Insert into DB with conflict handling
    await db
      .insert(messageSchema)
      .values(
        messages.map((m) => ({
          id: m.id,
          conversationId: m.conversationId,
          senderId: m.senderId,
          content: m.content,
          status: m.status || "sent",
          createdAt: new Date(m.createdAt),
        }))
      )
      .onConflictDoNothing({ target: messageSchema.id }); // Prevent duplicates

    // 2. Update Conversation lastMessageAt for each unique conversation
    const uniqueConversations = [
      ...new Set(messages.map((m) => m.conversationId)),
    ];

    // Batch update conversations
    await Promise.all(
      uniqueConversations.map(async (convId) => {
        try {
          await db
            .update(conversationSchema)
            .set({ lastMessageAt: new Date() })
            .where(eq(conversationSchema.id, convId));
        } catch (err) {
          console.error(
            `[Message Worker] Failed to update conversation ${convId}:`,
            err
          );
        }
      })
    );

    // 3. Update unread count for other participants
    for (const convId of uniqueConversations) {
      const messagesForConv = messages.filter((m) => m.conversationId === convId);
      if (messagesForConv.length === 0) continue;

      try {
        // Increment unread count for all participants except sender
        const senderIds = [...new Set(messagesForConv.map((m) => m.senderId))];
        await db.execute(/* sql */ `
          UPDATE conversation_participant
          SET unread_count = unread_count + ${messagesForConv.length}
          WHERE conversation_id = '${convId}'
          AND user_id NOT IN (${senderIds.map((id) => `'${id}'`).join(',')})
        `);
      } catch (err) {
        console.error(
          `[Message Worker] Failed to update unread counts for ${convId}:`,
          err
        );
      }
    }

    console.log(
      `[Message Worker] Persisted ${messages.length} messages across ${uniqueConversations.length} conversations`
    );
  } catch (err) {
    console.error("[Message Worker] Batch persistence error:", err);
    throw err;
  }
}

/**
 * Start a background worker to process messages in batches
 * This drastically reduces DB load and improves WS responsiveness
 */
export function startMessagePersistenceWorker() {
  console.log("🚀 Message Persistence Worker Starting...");

  const redis = getQueueRedis();
  if (!redis) {
    console.error(
      "[Message Worker] Redis not available, persistence worker disabled"
    );
    return;
  }

  let isProcessing = false;
  const BATCH_SIZE = 50;
  const IDLE_DELAY = 1000; // 1 second
  const ERROR_DELAY = 5000; // 5 seconds

  const processBatch = async () => {
    if (isProcessing) return;
    isProcessing = true;

    try {
      // Get a batch of messages from the queue
      const rawMessages = await redis.lrange(QUEUE_KEY, 0, BATCH_SIZE - 1);

      if (rawMessages.length === 0) {
        // No messages to process, wait and try again
        setTimeout(processBatch, IDLE_DELAY);
        return;
      }

      const messages = rawMessages.map((m) => JSON.parse(m));

      try {
        // Attempt to persist
        await persistMessages(messages);

        // Remove successfully processed messages from queue
        await redis.ltrim(QUEUE_KEY, messages.length, -1);

        // Immediately check for more messages
        isProcessing = false;
        processBatch();
      } catch (err) {
        console.error("[Message Worker] Batch processing failed:", err);

        // Check retry counts and move to DLQ if exceeded
        const MAX_RETRIES = 3;
        const messagesToRetry: any[] = [];
        const messagesToDLQ: any[] = [];

        for (const msg of messages) {
          const retryCount = (msg._retryCount || 0) + 1;
          if (retryCount > MAX_RETRIES) {
            messagesToDLQ.push({ ...msg, _finalError: String(err) });
          } else {
            messagesToRetry.push({ ...msg, _retryCount: retryCount });
          }
        }

        // Move failed messages back to queue with incremented retry count
        if (messagesToRetry.length > 0) {
          const pipeline = redis.pipeline();
          // Remove the batch we tried to process
          pipeline.ltrim(QUEUE_KEY, messages.length, -1);
          // Re-add retryable messages
          for (const msg of messagesToRetry) {
            pipeline.rpush(QUEUE_KEY, JSON.stringify(msg));
          }
          await pipeline.exec();
        }

        // Move exceeded retry messages to DLQ
        if (messagesToDLQ.length > 0) {
          await redis.lpush(
            DLQ_KEY,
            ...messagesToDLQ.map((m) => JSON.stringify(m))
          );
          console.error(
            `[Message Worker] Moved ${messagesToDLQ.length} messages to DLQ after ${MAX_RETRIES} retries`
          );
        }

        // Retry after error delay
        isProcessing = false;
        setTimeout(processBatch, ERROR_DELAY);
      }
    } catch (err) {
      console.error("[Message Worker] Critical error:", err);
      isProcessing = false;
      setTimeout(processBatch, ERROR_DELAY);
    }
  };

  // Start processing
  processBatch();

  // Also start a heartbeat to ensure worker is running
  setInterval(() => {
    if (!isProcessing) {
      processBatch();
    }
  }, 10000); // Check every 10 seconds

  console.log("✅ Message Persistence Worker Started");
}

/**
 * Get dead letter queue statistics
 */
export async function getDLQStats(): Promise<{ count: number }> {
  const redis = getQueueRedis();
  if (!redis) return { count: 0 };

  const count = await redis.llen(DLQ_KEY);
  return { count };
}

/**
 * Reprocess dead letter queue
 */
export async function reprocessDLQ(): Promise<{
  processed: number;
  failed: number;
}> {
  const redis = getQueueRedis();
  if (!redis) return { processed: 0, failed: 0 };

  let processed = 0;
  let failed = 0;

  while (true) {
    const msg = await redis.rpop(DLQ_KEY);
    if (!msg) break;

    try {
      const parsed = JSON.parse(msg);
      // Reset retry count and requeue
      delete parsed._retryCount;
      delete parsed._finalError;
      await redis.lpush(QUEUE_KEY, JSON.stringify(parsed));
      processed++;
    } catch (err) {
      console.error("[Message Worker] Failed to reprocess DLQ message:", err);
      failed++;
    }
  }

  return { processed, failed };
}
