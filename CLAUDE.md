# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

This is a Bun monorepo managed with Turborepo. Key commands:

```bash
bun run dev              # Start all apps (native + server)
bun run dev:native       # Start Expo dev server for mobile app
bun run dev:server       # Start Hono server with hot reload
bun run build            # Build all packages
bun run check-types      # Type check all packages

# Database commands
bun run db:push          # Push schema changes to database
bun run db:generate      # Generate Drizzle migrations
bun run db:migrate       # Run database migrations
bun run db:studio        # Open Drizzle Studio
```

## Architecture

**Monorepo structure** with workspaces:

```
apps/
  native/    - Expo React Native app (mobile)
  server/    - Hono API server with WebSocket
packages/
  auth/      - BetterAuth configuration (DRY adapter, Expo plugin)
  db/        - Drizzle ORM schema and migrations
  env/       - Environment validation (t3-env)
  config/    - Shared TypeScript config
```

**Key patterns:**

- **Server**: Hono with Bun runtime, WebSocket support via `@hono/node-ws`, BetterAuth for authentication, Redis pub/sub for real-time messaging
- **Native**: Expo Router with React Navigation, TanStack Query for data fetching with offline persistence, HeroUI Native for components, Uniwind (Tailwind) for styling
- **Database**: PostgreSQL with Drizzle ORM, schema in `packages/db/src/schema/`
- **Auth**: BetterAuth with Expo plugin for cross-platform session handling
- **Environment**: Split config - `@apnu/env/server` for server-side, `@apnu/env/native` for client-side (EXPO_PUBLIC_* prefixed)

**Communication**: Native app communicates with server via REST API (`/api/*`) and WebSocket (`/api/ws`) for real-time chat features.
