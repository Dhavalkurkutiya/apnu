import { db } from "@apnu/db";
import { message as messageSchema, conversation as conversationSchema } from "@apnu/db/schema/chat";
import { eq } from "drizzle-orm";
import { Redis } from "ioredis";
import { env } from "@apnu/env/server";

const queueRedis = new Redis(env.REDIS_URL);
const QUEUE_KEY = "chat:message_write_queue";

export type QueuedMessage = {
  id: string;
  conversationId: string;
  senderId: string;
  content: string;
  status: "sent";
  createdAt: string;
}

/**
 * Push a message to the persistence queue
 */
export async function queueMessageForPersistence(msg: QueuedMessage) {
  await queueRedis.rpush(QUEUE_KEY, JSON.stringify(msg));
}

/**
 * Start a background worker to process messages in batches
 * This drastically reduces DB load and improves WS responsiveness
 */
export function startMessagePersistenceWorker() {
  console.log("🚀 Message Persistence Worker Started");
  
  const processBatch = async () => {
    try {
      // 1. Get a batch of messages from the queue
      const batchSize = 50;
      const rawMessages = await queueRedis.lrange(QUEUE_KEY, 0, batchSize - 1);
      
      if (rawMessages.length === 0) {
        setTimeout(processBatch, 1000); // Wait 1s if empty
        return;
      }

      const messages: QueuedMessage[] = rawMessages.map(m => JSON.parse(m));
      
      // 2. Bulk Insert into DB
      console.log(`[Worker] Persisting batch of ${messages.length} messages...`);
      
      await db.insert(messageSchema).values(messages.map(m => ({
        ...m,
        createdAt: new Date(m.createdAt),
      }))).onConflictDoNothing(); // Prevent duplicates in case of retries

      // 3. Update Conversation LastMessageAt for each unique conversation in batch
      const uniqueConversations = [...new Set(messages.map(m => m.conversationId))];
      for (const convId of uniqueConversations) {
        await db.update(conversationSchema)
          .set({ lastMessageAt: new Date() })
          .where(eq(conversationSchema.id, convId));
      }

      // 4. Remove processed messages from queue
      await queueRedis.ltrim(QUEUE_KEY, messages.length, -1);
      
      // Immediately try to process next batch if any
      processBatch();
    } catch (err) {
      console.error("[Worker Error]:", err);
      setTimeout(processBatch, 5000); // Retry after 5s on error
    }
  };

  processBatch();
}
