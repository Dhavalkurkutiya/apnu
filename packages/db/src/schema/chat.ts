import { relations } from "drizzle-orm";
import {
  pgTable,
  text,
  timestamp,
  boolean,
  integer,
  index,
  uniqueIndex,
  pgEnum,
} from "drizzle-orm/pg-core";
import { user } from "./auth";

export const messageStatusEnum = pgEnum("message_status", [
  "sent",
  "delivered",
  "seen",
]);

export const conversation = pgTable("conversation", {
  id: text("id").primaryKey(),
  name: text("name"),
  isGroup: boolean("is_group").default(false).notNull(),
  lastMessageAt: timestamp("last_message_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at")
    .defaultNow()
    .$onUpdate(() => /* @__PURE__ */ new Date())
    .notNull(),
});

export const conversationParticipant = pgTable(
  "conversation_participant",
  {
    id: text("id").primaryKey(),
    conversationId: text("conversation_id")
      .notNull()
      .references(() => conversation.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    unreadCount: integer("unread_count").default(0).notNull(),
    isMuted: boolean("is_muted").default(false).notNull(),
    lastSeenMessageId: text("last_seen_message_id"),
    joinedAt: timestamp("joined_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("conversation_participant_conversation_id_user_id_idx").on(
      table.conversationId,
      table.userId,
    ),
  ],
);

export const message = pgTable(
  "message",
  {
    id: text("id").primaryKey(),
    conversationId: text("conversation_id")
      .notNull()
      .references(() => conversation.id, { onDelete: "cascade" }),
    senderId: text("sender_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    content: text("content").notNull(),
    status: messageStatusEnum("status").default("sent").notNull(),
    replyToId: text("reply_to_id"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [
    index("message_conversation_id_created_at_idx").on(
      table.conversationId,
      table.createdAt,
    ),
  ],
);

export const conversationRelations = relations(conversation, ({ many }) => ({
  participants: many(conversationParticipant),
  messages: many(message),
}));

export const conversationParticipantRelations = relations(
  conversationParticipant,
  ({ one }) => ({
    conversation: one(conversation, {
      fields: [conversationParticipant.conversationId],
      references: [conversation.id],
    }),
    user: one(user, {
      fields: [conversationParticipant.userId],
      references: [user.id],
    }),
  }),
);

export const messageRelations = relations(message, ({ one, many }) => ({
  conversation: one(conversation, {
    fields: [message.conversationId],
    references: [conversation.id],
  }),
  sender: one(user, {
    fields: [message.senderId],
    references: [user.id],
  }),
  replyTo: one(message, {
    fields: [message.replyToId],
    references: [message.id],
    relationName: "replies",
  }),
  replies: many(message, {
    relationName: "replies",
  }),
}));

export const userChatRelations = relations(user, ({ many }) => ({
  conversations: many(conversationParticipant),
  messages: many(message),
}));
