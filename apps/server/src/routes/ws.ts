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
]);

export type IncomingPayload = z.infer<typeof IncomingMessageSchema>;

interface WSContext {
  userId: string;
  userName: string | null;
  userImage: string | null;
  conversationId: string;
}

// --- Redis Setup for Scaling ---
const redisPub = new Redis(env.REDIS_URL);
const redisSub = new Redis(env.REDIS_URL);

// Track local connections
const localRooms = new Map<string, Set<any>>();

// Redis Subscription Handler
redisSub.on("message", (channel: string, payload: string) => {
  if (channel.startsWith("chat:room:")) {
    const conversationId = channel.replace("chat:room:", "");
    const room = localRooms.get(conversationId);
    if (room) {
      room.forEach((ws) => {
        if (ws.readyState === 1) ws.send(payload);
      });
    }
  }
});

redisSub.on("error", (err) => console.error("[Redis Sub] Error:", err));
redisPub.on("error", (err) => console.error("[Redis Pub] Error:", err));

export { websocket };

const wsRoute = new Hono();

wsRoute.get(
  "/",
  upgradeWebSocket(async (c) => {
    const token = c.req.query("token");
    const conversationId = c.req.query("conversationId");

    if (!token || !conversationId) {
      console.warn(
        `[WS] Connection rejected: Missing params (conv="${conversationId}")`,
      );
      return { status: 400, message: "Missing token or conversationId" };
    }

    const session = await auth.api.getSession({
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!session?.user) {
      console.warn(
        `[WS] Connection rejected: Invalid token (conv="${conversationId}")`,
      );
      return { status: 401, message: "Unauthorized" };
    }

    const isParticipant = await db.query.conversationParticipant.findFirst({
      where: and(
        eq(conversationParticipant.conversationId, conversationId),
        eq(conversationParticipant.userId, session.user.id),
      ),
    });

    if (!isParticipant) {
      console.warn(
        `[WS] Connection forbidden: user="${session.user.id}" to conv="${conversationId}"`,
      );
      return { status: 403, message: "Forbidden" };
    }

    console.info(
      `[WS] UPGRADE: user="${session.user.id}" conv="${conversationId}"`,
    );

    return {
      async onOpen(_evt, ws) {
        if (!localRooms.has(conversationId)) {
          localRooms.set(conversationId, new Set());
          await redisSub.subscribe(`chat:room:${conversationId}`);
          console.info(
            `[WS] SUBSCRIBED to Redis channel: chat:room:${conversationId}`,
          );
        }
        localRooms.get(conversationId)?.add(ws);

        const context = ws.raw as unknown as WSContext;
        context.userId = session.user.id;
        context.userName = session.user.name;
        context.userImage = session.user.image || null;
        context.conversationId = conversationId;

        console.info(
          `[WS] OPENED: user="${context.userId}" connections_in_room=${localRooms.get(conversationId)?.size}`,
        );
      },
      async onMessage(evt, ws) {
        try {
          const rawData = evt.data.toString();
          const validation = IncomingMessageSchema.safeParse(
            JSON.parse(rawData),
          );

          if (!validation.success) {
            console.error(
              `[WS] Validation failed for user="${(ws.raw as any).userId}":`,
              validation.error.format(),
            );
            return;
          }

          const data = validation.data;
          const context = ws.raw as unknown as WSContext;

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

            const payload = JSON.stringify({
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
            });

            console.info(
              `[WS] BROADCAST: user="${context.userId}" conv="${context.conversationId}" msgId="${msgId}"`,
            );
            await redisPub.publish(
              `chat:room:${context.conversationId}`,
              payload,
            );

            queueMessageForPersistence(savedMessage).catch((err) => {
              console.error("[WS] Persistence queue error:", err);
            });
          } else if (data.type === "typing") {
            const payload = JSON.stringify({
              type: "typing",
              userId: context.userId,
              isTyping: data.isTyping,
            });
            await redisPub.publish(
              `chat:room:${context.conversationId}`,
              payload,
            );
          }
        } catch (err) {
          console.error("[WS] Critical Message Error:", err);
        }
      },
      async onClose(_evt, ws) {
        const context = ws.raw as unknown as WSContext;
        const room = localRooms.get(context.conversationId);

        if (room) {
          room.delete(ws);
          console.info(
            `[WS] CLOSED: user="${context.userId}" remaining_in_room=${room.size}`,
          );
          if (room.size === 0) {
            localRooms.delete(context.conversationId);
            await redisSub.unsubscribe(`chat:room:${context.conversationId}`);
            console.info(
              `[WS] UNSUBSCRIBED from empty room channel: ${context.conversationId}`,
            );
          }
        }
      },
    };
  }),
);

export default wsRoute;
