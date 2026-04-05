import { auth } from "@apnu/auth";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { createFactory } from "hono/factory";
import { user } from "@apnu/db/schema/auth";

import usersRoute from "./routes/users";
import conversationsRoute from "./routes/conversations";
import wsRoute, { websocket } from "./routes/ws";
import { startMessagePersistenceWorker } from "./lib/message-worker";

type Env = {
  Variables: {
    user: typeof user.$inferSelect;
    session: any;
  };
};

const factory = createFactory<Env>();
const app = factory.createApp();

// 1. Logger first
app.use(logger());

// 2. CORS Config - Ensure Authorization is allowed
app.use(
  "/*",
  cors({
    origin: (origin) => origin || "*", // More permissive for native development
    allowMethods: ["GET", "POST", "OPTIONS", "PUT", "DELETE"],
    allowHeaders: ["Content-Type", "Authorization", "x-better-auth-token"],
    credentials: true,
    exposeHeaders: ["Set-Cookie"],
  }),
);

// Global Error Handler
app.onError((err, c) => {
  console.error(`[Fatal Error] ${c.req.method} ${c.req.url}:`, err);
  return c.json(
    {
      error: "Internal Server Error",
      message: process.env.NODE_ENV === "production" ? undefined : err.message,
    },
    500,
  );
});

// 3. Auth Handler - Must be before protected routes
app.on(["POST", "GET"], "/api/auth/*", (c) => {
    console.info(`[Auth] Path: ${c.req.path} | Method: ${c.req.method}`);
    return auth.handler(c.req.raw);
});

// 4. Feature Routes - Chained for RPC support
const routes = app
  .route("/api/users", usersRoute)
  .route("/api/conversations", conversationsRoute)
  .route("/api/ws", wsRoute);

app.get("/", (c) => {
  return c.text("Apnu API is running");
});

// Start Background Persistence Worker
startMessagePersistenceWorker();

// Bun entrypoint
export default {
  fetch: app.fetch,
  websocket,
};

export type AppType = typeof routes;
