import { auth } from "@apnu/auth";
import { createMiddleware } from "hono/factory";

/**
 * Enhanced Authentication Middleware
 * This middleware supports both cookies (Web) and Authorization headers (Native)
 */
export const authMiddleware = createMiddleware(async (c, next) => {
  // Better Auth's getSession is robust - it reads from Headers (Authorization) or Cookies automatically
  const session = await auth.api.getSession({
    headers: c.req.raw.headers,
  });

  if (!session) {
    const authHeader = c.req.header("Authorization");
    console.warn(`[Auth Middleware] 401 Unauthorized access on: ${c.req.method} ${c.req.path}`);
    console.error(`[Auth Middleware] Debug: Auth Header present: ${!!authHeader} | Snippet: ${authHeader?.substring(0, 15)}...`);
    
    return c.json({ 
        error: "Unauthorized", 
        message: "Session not found. Please log in again." 
    }, 401);
  }

  // Attach session data to context variables
  c.set("user", session.user);
  c.set("session", session.session);
  
  // Also common practice to set a simple userId to avoid destructuring every time
  (c as any).set("userId", session.user.id);

  console.info(`[Auth Middleware] Authorized: user="${session.user.id}" email="${session.user.email}"`);
  
  await next();
});
