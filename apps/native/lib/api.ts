import { hc } from "hono/client";
import type { AppType } from "../../server/src/index";
import { env } from "@apnu/env/native";
import { authClient } from "./auth-client";

/**
 * Custom fetcher that manually attaches the session cookie.
 * This pattern ensures that the auth state is correctly passed to the server
 * in Expo/React Native environments where automatic cookie handling can be flaky.
 */
async function authFetch(
  input: string | URL | Request,
  init?: RequestInit
): Promise<Response> {
  const cookie = authClient.getCookie();
  const headers = new Headers(init?.headers);

  if (cookie) {
    headers.set("Cookie", cookie);
  }

  // Ensure JSON content type for POST/PUT requests if not set
  if (
    (init?.method === "POST" || init?.method === "PUT") &&
    !headers.has("Content-Type")
  ) {
    headers.set("Content-Type", "application/json");
  }

  return fetch(input, {
    ...init,
    credentials: "include",
    headers,
  });
}

/**
 * Type-safe API client for Apnu
 * Uses Hono's RPC feature to provide full end-to-end typing.
 */
export const client = hc<AppType>(env.EXPO_PUBLIC_SERVER_URL, {
  fetch: authFetch,
});

// Export as both api and client for convenience
export const api = client;
