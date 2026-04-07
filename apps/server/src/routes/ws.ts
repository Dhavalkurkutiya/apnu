import { Hono } from "hono";
import { upgradeWebSocket, websocket } from "hono/bun";
import { auth } from "@apnu/auth";
import { db } from "@apnu/db";
import { conversationParticipant } from "@apnu/db/schema/chat";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { Redis } from "ioredis";
import { env } from "@apnu/env/server";
import { queueMessageForPersistence } from "../lib/message-worker";

// --- Types & Schemas ---

const IncomingMessageSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("message"),
    content: z.string().min(1).max(5000),
    tempId: z.string().optional(),
  }),
  z.object({
    type: z.literal("typing"),
    isTyping: z.boolean(),
  }),
  z.object({
    type: z.literal("presence"),
    status: z.enum(["online", "offline"]),
  }),
  z.object({
    type: z.literal("ping"),
    timestamp: z.number().optional(),
  }),
  z.object({
    type: z.literal("ack"),
    messageId: z.string(),
  }),
]);

export type IncomingPayload = z.infer<typeof IncomingMessageSchema>;

interface UserSession {
  userId: string;
  userName: string | null;
  userImage: string | null;
  conversationId: string;
}

// --- Connection State Management (Per-instance, request-scoped) ---
// NOTE: We use a connection registry that's passed through the context
// instead of module-level state to avoid race conditions

interface ConnectionInfo {
  ws: any;
  session: UserSession;
  lastPing: number;
  isAlive: boolean;
}

// --- Redis Setup for Scaling ---
// Use lazy initialization to avoid issues during module load
let redisPub: Redis | null = null;
let redisSub: Redis | null = null;

function getRedisPub(): Redis | null {
  if (redisPub) return redisPub;
  try {
    redisPub = new Redis(env.REDIS_URL, {
      maxRetriesPerRequest: 3,
      retryStrategy: (times) => Math.min(times * 100, 3000),
    });
    redisPub.on("error", (err) => {
      console.error("[Redis Pub] Error:", err.message);
    });
    return redisPub;
  } catch (err) {
    console.error("[Redis Pub] Failed to initialize:", err);
    return null;
  }
}

function getRedisSub(): Redis | null {
  if (redisSub) return redisSub;
  try {
    redisSub = new Redis(env.REDIS_URL, {
      maxRetriesPerRequest: 3,
      retryStrategy: (times) => Math.min(times * 100, 3000),
    });
    redisSub.on("error", (err) => {
      console.error("[Redis Sub] Error:", err.message);
    });
    redisSub.on("connect", () => {
      console.log("[Redis Sub] Connected");
    });
    return redisSub;
  } catch (err) {
    console.error("[Redis Sub] Failed to initialize:", err);
    return null;
  }
}

// Global connection registry for this server instance
const SERVER_INSTANCE_ID = crypto.randomUUID();
const connections = new Map<string, ConnectionInfo>();
const rooms = new Map<string, Set<string>>(); // room -> Set<connectionId>

// Rate limiting store: userId -> { count, resetTime }
const rateLimits = new Map<string, { count: number; resetTime: number }>();

// Cleanup function for disconnected sockets
function cleanupConnection(connectionId: string) {
  const conn = connections.get(connectionId);
  if (!conn) return;

  const { session } = conn;

  // Remove from room
  const room = rooms.get(session.conversationId);
  if (room) {
    room.delete(connectionId);
    if (room.size === 0) {
      rooms.delete(session.conversationId);
      // Unsubscribe from Redis channel
      const sub = getRedisSub();
      if (sub) {
        sub.unsubscribe(`chat:room:${session.conversationId}`).catch(() => {});
      }
    }
  }

  // Remove from connections
  connections.delete(connectionId);

  // Broadcast offline status
  const pub = getRedisPub();
  if (pub) {
    const payload = JSON.stringify({
      type: "presence",
      userId: session.userId,
      status: "offline",
      _sourceId: SERVER_INSTANCE_ID,
    });
    pub.publish(`chat:room:${session.conversationId}`, payload).catch(() => {});
  }

  console.info(
    `[WS] CLEANUP: user="${session.userId}" conn="${connectionId}" remaining_in_room=${room?.size || 0}`
  );
}

// Check rate limit for user
function checkRateLimit(userId: string): boolean {
  const now = Date.now();
  const limit = rateLimits.get(userId);

  if (!limit || now > limit.resetTime) {
    // Reset or create new window
    rateLimits.set(userId, {
      count: 1,
      resetTime: now + 60000, // 1 minute window
    });
    return true;
  }

  if (limit.count >= 100) {
    // 100 messages per minute max
    return false;
  }

  limit.count++;
  return true;
}

// Setup Redis subscription handler (only once)
let redisSubscriptionSetup = false;
function setupRedisSubscription() {
  if (redisSubscriptionSetup) return;
  redisSubscriptionSetup = true;

  const sub = getRedisSub();
  if (!sub) return;

  sub.on("message", (channel: string, payload: string) => {
    if (!channel.startsWith("chat:room:")) return;

    try {
      const data = JSON.parse(payload);
      
      // Skip if this message originated from this server instance
      // it was already broadcast locally for performance and reliability
      if (data._sourceId === SERVER_INSTANCE_ID) return;

      const conversationId = channel.replace("chat:room:", "");
      const room = rooms.get(conversationId);
      if (!room) return;

      // Broadcast to all local connections in the room
      const stringifiedPayload = typeof data === 'string' ? payload : JSON.stringify(data);
      for (const connectionId of room) {
        const conn = connections.get(connectionId);
        if (conn && conn.isAlive) {
          try {
            conn.ws.send(stringifiedPayload);
          } catch (err) {
            console.error(`[WS] Send error to ${connectionId}:`, err);
            conn.isAlive = false;
          }
        }
      }
    } catch (err) {
      console.error("[WS] Redis message parse error:", err);
    }
  });
}

function broadcastLocally(conversationId: string, payload: string) {
  const room = rooms.get(conversationId);
  if (!room) return;

  for (const cid of room) {
    const targetConn = connections.get(cid);
    if (targetConn && targetConn.isAlive) {
      try {
        targetConn.ws.send(payload);
      } catch (e) {
        // Ignore send errors
      }
    }
  }
}

// Heartbeat interval - cleanup dead connections
setInterval(() => {
  const now = Date.now();
  const deadConnections: string[] = [];

  for (const [id, conn] of connections) {
    if (!conn.isAlive || now - conn.lastPing > 60000) {
      // 60s timeout
      deadConnections.push(id);
      try {
        conn.ws.close();
      } catch (e) {
        // Ignore close errors
      }
    }
  }

  for (const id of deadConnections) {
    cleanupConnection(id);
  }

  // Cleanup old rate limit entries
  const now2 = Date.now();
  for (const [userId, limit] of rateLimits) {
    if (now2 > limit.resetTime) {
      rateLimits.delete(userId);
    }
  }
}, 30000); // Run every 30 seconds

export { websocket };

const wsRoute = new Hono();

wsRoute.get(
  "/",
  upgradeWebSocket(async (c) => {
    const token = c.req.query("token");
    const conversationId = c.req.query("conversationId");

    if (!token || !conversationId) {
      console.warn(
        `[WS] Connection rejected: Missing params (conv="${conversationId}")`
      );
      return { status: 400, message: "Missing token or conversationId" };
    }

    const session = await auth.api.getSession({
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!session?.user) {
      console.warn(
        `[WS] Connection rejected: Invalid token (conv="${conversationId}")`
      );
      return { status: 401, message: "Unauthorized" };
    }

    const isParticipant = await db.query.conversationParticipant.findFirst({
      where: and(
        eq(conversationParticipant.conversationId, conversationId),
        eq(conversationParticipant.userId, session.user.id)
      ),
    });

    if (!isParticipant) {
      console.warn(
        `[WS] Connection forbidden: user="${session.user.id}" to conv="${conversationId}"`
      );
      return { status: 403, message: "Forbidden" };
    }

    console.info(
      `[WS] UPGRADE: user="${session.user.id}" conv="${conversationId}"`
    );

    // Generate unique connection ID
    const connectionId = `${session.user.id}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    return {
      async onOpen(_evt, ws) {
        setupRedisSubscription();

        // Store connection info
        const userSession: UserSession = {
          userId: session.user.id,
          userName: session.user.name,
          userImage: session.user.image || null,
          conversationId: conversationId,
        };

        connections.set(connectionId, {
          ws,
          session: userSession,
          lastPing: Date.now(),
          isAlive: true,
        });

        // Add to room
        if (!rooms.has(conversationId)) {
          rooms.set(conversationId, new Set());
          // Subscribe to Redis channel
          const sub = getRedisSub();
          if (sub) {
            // NOTE: ioredis will queue the command even if not connected yet
            await sub.subscribe(`chat:room:${conversationId}`).catch((err) => {
              console.warn(`[Redis] Failed to subscribe to room ${conversationId}:`, err.message);
            });
          }
        }
        rooms.get(conversationId)!.add(connectionId);

        console.info(
          `[WS] OPENED: user="${session.user.id}" conn="${connectionId}" connections_in_room=${rooms.get(conversationId)?.size}`
        );

        // Send welcome/connected message
        ws.send(
          JSON.stringify({
            type: "connected",
            connectionId,
            timestamp: Date.now(),
          })
        );

        // Broadcast online status
        const pub = getRedisPub();
        if (pub) {
          const payload = JSON.stringify({
            type: "presence",
            userId: session.user.id,
            status: "online",
            _sourceId: SERVER_INSTANCE_ID,
          });
          await pub
            .publish(`chat:room:${conversationId}`, payload)
            .catch(() => {});
        }
      },
      async onMessage(evt, ws) {
        const conn = connections.get(connectionId);
        if (!conn) return;

        // Update activity timestamp
        conn.lastPing = Date.now();
        conn.isAlive = true;

        try {
          const rawData = evt.data.toString();
          let parsed;
          try {
            parsed = JSON.parse(rawData);
          } catch (e) {
            ws.send(
              JSON.stringify({
                type: "error",
                message: "Invalid JSON",
              })
            );
            return;
          }

          const validation = IncomingMessageSchema.safeParse(parsed);

          if (!validation.success) {
            ws.send(
              JSON.stringify({
                type: "error",
                message: "Invalid message format",
              })
            );
            return;
          }

          const data = validation.data;
          const context = conn.session;

          // Rate limiting check for message type
          if (data.type === "message") {
            if (!checkRateLimit(context.userId)) {
              ws.send(
                JSON.stringify({
                  type: "error",
                  message: "Rate limit exceeded. Please slow down.",
                  code: "RATE_LIMITED",
                })
              );
              return;
            }
          }

          if (data.type === "message") {
            const msgId = crypto.randomUUID();
            const createdAt = new Date().toISOString();

            const savedMessage = {
              id: msgId,
              senderId: context.userId,
              conversationId: context.conversationId,
              content: data.content,
              status: "sent" as const,
              createdAt,
            };

            const outgoingPayload = {
              type: "message",
              message: {
                ...savedMessage,
                sender: {
                  id: context.userId,
                  name: context.userName,
                  image: context.userImage,
                },
              },
              tempId: data.tempId,
              _sourceId: SERVER_INSTANCE_ID, // Mark source for Redis dedup
            };

            const payloadString = JSON.stringify(outgoingPayload);

            console.info(
              `[WS] MESSAGE: user="${context.userId}" conv="${context.conversationId}" msg="${msgId}"`
            );

            // 1. ALWAYS broadcast locally first for maximum reliability and speed
            broadcastLocally(context.conversationId, payloadString);

            // 2. Broadcast via Redis to other instances
            const pub = getRedisPub();
            if (pub) {
              // ioredis will queue the command if not connected
              pub.publish(
                `chat:room:${context.conversationId}`,
                payloadString
              ).catch(err => {
                console.warn("[WS] Redis publish failed:", err.message);
              });
            }

            // Send acknowledgment to sender with the message ID
            ws.send(
              JSON.stringify({
                type: "ack",
                tempId: data.tempId,
                messageId: msgId,
                status: "sent",
              })
            );

            // Persist to DB via worker (async, non-blocking)
            queueMessageForPersistence(savedMessage).catch((err) => {
              console.error("[WS] Persistence queue error:", err);
            });
          } else if (data.type === "typing") {
            const payload = JSON.stringify({
              type: "typing",
              userId: context.userId,
              isTyping: data.isTyping,
              _sourceId: SERVER_INSTANCE_ID,
            });

            broadcastLocally(context.conversationId, payload);

            const pub = getRedisPub();
            if (pub) {
              pub.publish(
                `chat:room:${context.conversationId}`,
                payload
              ).catch(() => {});
            }
          } else if (data.type === "presence") {
            const payload = JSON.stringify({
              type: "presence",
              userId: context.userId,
              status: data.status,
              _sourceId: SERVER_INSTANCE_ID,
            });

            broadcastLocally(context.conversationId, payload);

            const pub = getRedisPub();
            if (pub) {
              pub.publish(
                `chat:room:${context.conversationId}`,
                payload
              ).catch(() => {});
            }
          } else if (data.type === "ping") {
            // Respond with pong
            ws.send(
              JSON.stringify({
                type: "pong",
                timestamp: Date.now(),
                originalTimestamp: data.timestamp,
              })
            );
          } else if (data.type === "ack") {
            // Client acknowledging receipt - could update message status to "delivered"
            console.info(
              `[WS] ACK: user="${context.userId}" msg="${data.messageId}"`
            );
          }
        } catch (err) {
          console.error("[WS] Message Handler Error:", err);
          ws.send(
            JSON.stringify({
              type: "error",
              message: "Internal server error",
            })
          );
        }
      },
      async onClose(_evt, _ws) {
        cleanupConnection(connectionId);
      },
    };
  })
);

export default wsRoute;
