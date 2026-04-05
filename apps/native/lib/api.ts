import { hc } from "hono/client";
import type { AppType } from "../../server/src/index";
import { env } from "@apnu/env/native";
import { authClient } from "./auth-client";

/**
 * Type-safe API client for Apnu
 * Uses Hono's RPC feature to provide full end-to-end typing.
 * 
 * IMPORTANT: By passing `authClient.$fetch` to the hc client,
 * we ENSURE the session token is automatically attached to every
 * request in the Authorization: Bearer header.
 */
export const client = hc<AppType>(env.EXPO_PUBLIC_SERVER_URL, {
  // We use authClient.$fetch (Better Auth's internal fetcher) 
  // which handles token insertion and refresh automatically.
  fetch: (url: string | URL | Request, options?: any) => (authClient as any).$fetch(url, options)
}) as any; 
