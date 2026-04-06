/** Conversations route logic */
import { Hono } from "hono";
import { db } from "@apnu/db";
import {
  conversation,
  conversationParticipant,
  message,
} from "@apnu/db/schema/chat";
import { user } from "@apnu/db/schema/auth";
import { eq, and, desc, lt, sql } from "drizzle-orm";
import { authMiddleware } from "../middleware/auth";
import { z } from "zod";

const conversationsRoute = new Hono<{
  Variables: {
    user: typeof user.$inferSelect;
  };
}>();

const createConversationSchema = z.object({
  participantUserId: z.string().min(1),
});

const getMessagesSchema = z.object({
  cursor: z.string().optional(),
  limit: z
    .string()
    .optional()
    .transform((v) => parseInt(v || "30"))
    .pipe(z.number().min(1).max(100)),
});

// GET /api/conversations
conversationsRoute.get("/", authMiddleware, async (c) => {
  const currentUser = c.get("user");
  if (!currentUser) return c.json({ error: "Unauthorized" }, 401);

  console.info(`[Conversations] Fetching all for user="${currentUser.id}"`);

  try {
    const results = await db.query.conversationParticipant.findMany({
      where: eq(conversationParticipant.userId, currentUser.id),
      with: {
        conversation: {
          with: {
            participants: {
              with: {
                user: {
                  columns: { id: true, name: true, image: true },
                },
              },
            },
            messages: {
              orderBy: [desc(message.createdAt)],
              limit: 1,
              with: {
                sender: { columns: { name: true } },
              },
            },
          },
        },
      },
    });

    const sortedConversations = results
      .map((r) => {
        const conv = r.conversation;
        const otherParticipant = conv.participants.find(
          (p) => p.userId !== currentUser.id,
        );
        const lastMessage = conv.messages[0];

        return {
          id: conv.id,
          name: conv.isGroup ? conv.name : otherParticipant?.user.name,
          image: conv.isGroup ? null : otherParticipant?.user.image,
          isGroup: conv.isGroup,
          lastMessageAt: conv.lastMessageAt,
          lastMessagePreview: lastMessage ? lastMessage.content : null,
          unreadCount: r.unreadCount,
          otherParticipant: otherParticipant?.user,
        };
      })
      .sort(
        (a, b) =>
          (b.lastMessageAt?.getTime() || 0) - (a.lastMessageAt?.getTime() || 0),
      );

    console.info(`[Conversations] Success: ${sortedConversations.length} found`);
    return c.json(sortedConversations);
  } catch (error) {
    console.error("[Conversations] Fetch Error:", error);
    return c.json({ error: "Failed to fetch conversations" }, 500);
  }
});

// POST /api/conversations
conversationsRoute.post("/", authMiddleware, async (c) => {
  const currentUser = c.get("user");
  if (!currentUser) return c.json({ error: "Unauthorized" }, 401);

  const body = await c.req.json();
  const validation = createConversationSchema.safeParse(body);
  if (!validation.success) {
    console.error(`[Conversations] Create validation failed by user="${currentUser.id}"`);
    return c.json(
      { error: "Invalid input", details: validation.error.format() },
      400,
    );
  }

  const { participantUserId } = validation.data;
  console.info(`[Conversations] Create/Get initiated: actor="${currentUser.id}" target="${participantUserId}"`);

  try {
    return await db.transaction(async (tx) => {
      // 1. Check for existing direct conversation
      const existingConversation = await tx
        .select({
          id: conversation.id,
          name: conversation.name,
          isGroup: conversation.isGroup,
          lastMessageAt: conversation.lastMessageAt,
        })
        .from(conversation)
        .innerJoin(
          conversationParticipant,
          eq(conversation.id, conversationParticipant.conversationId),
        )
        .where(
          and(
            eq(conversation.isGroup, false),
            eq(conversationParticipant.userId, currentUser.id),
            sql`EXISTS (
              SELECT 1 FROM ${conversationParticipant} p2 
              WHERE p2.conversation_id = ${conversation}.id 
              AND p2.user_id = ${participantUserId}
            )`,
          ),
        )
        .limit(1);

      const match = existingConversation[0];
      if (match) {
        console.info(`[Conversations] Existing conversation found: ${match.id}`);
        return c.json(match);
      }

      // 2. Create new conversation if not found
      const newConversationId = crypto.randomUUID();
      console.info(`[Conversations] Creating new direct chat: ${newConversationId}`);
      await tx.insert(conversation).values({
        id: newConversationId,
        isGroup: false,
      });

      await tx.insert(conversationParticipant).values([
        {
          id: crypto.randomUUID(),
          conversationId: newConversationId,
          userId: currentUser.id,
        },
        {
          id: crypto.randomUUID(),
          conversationId: newConversationId,
          userId: participantUserId,
        },
      ]);

      const result = await tx.query.conversation.findFirst({
        where: eq(conversation.id, newConversationId),
        with: {
          participants: {
            with: {
              user: { columns: { id: true, name: true, image: true } },
            },
          },
        },
      });

      console.info(`[Conversations] Created successfully: ${newConversationId}`);
      return c.json(result, 201);
    });
  } catch (error) {
    console.error("[Conversations] Create Error:", error);
    return c.json({ error: "Failed to create conversation" }, 500);
  }
});

// GET /api/conversations/:id/messages
conversationsRoute.get("/:id/messages", authMiddleware, async (c) => {
  const conversationId = c.req.param("id");
  const query = c.req.query();
  const validation = getMessagesSchema.safeParse(query);

  if (!validation.success) {
    return c.json(
      { error: "Invalid query parameters", details: validation.error.format() },
      400,
    );
  }

  const { cursor, limit } = validation.data;
  const currentUser = c.get("user");
  if (!currentUser) return c.json({ error: "Unauthorized" }, 401);

  console.info(`[Messages] Fetching: conv="${conversationId}" user="${currentUser.id}" limit=${limit}`);

  try {
    // SECURITY: Ensure current user is a participant
    const participation = await db.query.conversationParticipant.findFirst({
      where: and(
        eq(conversationParticipant.conversationId, conversationId),
        eq(conversationParticipant.userId, currentUser.id),
      ),
    });

    if (!participation) {
      console.warn(`[Messages] Forbidden access attempt: actor="${currentUser.id}" conv="${conversationId}"`);
      return c.json(
        {
          error: "Forbidden",
          message: "You are not a participant in this conversation",
        },
        403,
      );
    }

    const cursorDate = cursor ? new Date(cursor) : null;
    const isInvalidDate = cursorDate && isNaN(cursorDate.getTime());

    const messages = await db.query.message.findMany({
      where: and(
        eq(message.conversationId, conversationId),
        cursorDate && !isInvalidDate
          ? lt(message.createdAt, cursorDate)
          : undefined,
      ),
      with: {
        sender: { columns: { id: true, name: true, image: true } },
      },
      orderBy: [desc(message.createdAt)],
      limit,
    });

    console.info(`[Messages] Success: ${messages.length} returned for conv="${conversationId}"`);

    const oldestInBatch = messages[messages.length - 1];
    const nextCursor =
      messages.length === limit && oldestInBatch
        ? oldestInBatch.createdAt.toISOString()
        : null;

    return c.json({
      items: [...messages].reverse(),
      nextCursor,
    });
  } catch (error) {
    console.error("[Messages] Fetch Error:", error);
    return c.json({ error: "Failed to fetch messages" }, 500);
  }
});

// POST /api/conversations/:id/read
conversationsRoute.post("/:id/read", authMiddleware, async (c) => {
  const conversationId = c.req.param("id");
  const currentUser = c.get("user");
  if (!currentUser) return c.json({ error: "Unauthorized" }, 401);

  console.info(`[Conversations] Marking read: conv="${conversationId}" user="${currentUser.id}"`);

  try {
    const result = await db
      .update(conversationParticipant)
      .set({ unreadCount: 0 })
      .where(
        and(
          eq(conversationParticipant.conversationId, conversationId),
          eq(conversationParticipant.userId, currentUser.id),
        ),
      )
      .returning();

    if (result.length === 0) {
      console.warn(`[Conversations] Read mark failed: Conversation not found for actor="${currentUser.id}"`);
      return c.json(
        {
          error: "Not Found",
          message: "Conversation not found or not a participant",
        },
        404,
      );
    }

    return c.json({ success: true });
  } catch (error) {
    console.error("[Conversations] Mark Read Error:", error);
    return c.json({ error: "Failed to mark as read" }, 500);
  }
});

export default conversationsRoute;
