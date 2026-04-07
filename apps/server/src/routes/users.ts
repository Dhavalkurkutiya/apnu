import { Hono } from "hono";
import { db } from "@apnu/db";
import { user } from "@apnu/db/schema/auth";
import { and, ne, sql, desc } from "drizzle-orm";
import { authMiddleware } from "../middleware/auth";
import { z } from "zod";

const usersRoute = new Hono<{
  Variables: {
    user: typeof user.$inferSelect;
  };
}>();

const listUsersSchema = z.object({
    limit: z.string().optional().transform(v => parseInt(v || "50")).pipe(z.number().min(1).max(100)),
    offset: z.string().optional().transform(v => parseInt(v || "0")).pipe(z.number().min(0)),
});

const searchQuerySchema = z.object({
  q: z.string().optional().default(""),
});

/**
 * GET /api/users
 * List users excluding current user.
 */
usersRoute.get("/", authMiddleware, async (c) => {
    const query = c.req.query();
    const validation = listUsersSchema.safeParse(query);
    if (!validation.success) {
        return c.json({ error: "Invalid parameters", details: validation.error.format() }, 400);
    }

    const { limit, offset } = validation.data;
    const currentUser = c.get("user");
    if (!currentUser) return c.json({ error: "Unauthorized" }, 401);

    try {
        const results = await db
            .select({
                id: user.id,
                name: user.name,
                email: user.email,
                image: user.image,
            })
            .from(user)
            .where(ne(user.id, currentUser.id))
            .orderBy(desc(user.createdAt))
            .limit(limit)
            .offset(offset);
        
        console.info(`[Users] Listed ${results.length} users (offset=${offset}, limit=${limit})`);
        return c.json(results);
    } catch (error) {
        console.error("[Users] List error:", error);
        return c.json({ error: "Failed to list users" }, 500);
    }
});

/**
 * GET /api/users/search?q=...
 * Search users excluding current user.
 * Protected by authMiddleware.
 */
usersRoute.get("/search", authMiddleware, async (c) => {
  const query = c.req.query();
  const validation = searchQuerySchema.safeParse(query);

  if (!validation.success) {
    console.warn(`[Users] Invalid search request: q="${query.q}"`);
    return c.json(
      { error: "Invalid query parameters", details: validation.error.format() },
      400,
    );
  }

  const { q } = validation.data;
  const currentUser = c.get("user");

  if (!currentUser) {
    console.error(`[Users Search] Authentication guard failed - user not found in context`);
    return c.json({ error: "Unauthorized" }, 401);
  }

  console.info(`[Users Search] Processing: q="${q}" for user="${currentUser.id}"`);

  try {
    if (!q.trim()) {
      return c.json([]);
    }

    const formattedQuery = q
      .trim()
      .split(/\s+/)
      .map((term: string) => `${term}:*`) // Prefix search
      .join(" & ");

    const results = await db
      .select({
        id: user.id,
        name: user.name,
        email: user.email,
        image: user.image,
      })
      .from(user)
      .where(
        and(
          ne(user.id, currentUser.id),
          sql`((to_tsvector('simple', coalesce(${user.name}, '') || ' ' || coalesce(${user.email}, '')) @@ to_tsquery('simple', ${formattedQuery})) 
          OR (${user.name} ILIKE ${`%${q}%`}) 
          OR (${user.email} ILIKE ${`%${q}%`}))`,
        ),
      )
      .limit(20);

    console.info(`[Users Search] Completed: user="${currentUser.id}" | matches=${results.length}`);
    return c.json(results);
  } catch (error: any) {
    console.error("[Users Search Error]", error);
    
    // Safety fallback - if complex query fails, use simple exact/ILike match
    try {
      console.info(`[Users Search Fallback] Running simple query for q="${q}"`);
      const fallbackResults = await db
        .select({
          id: user.id,
          name: user.name,
          email: user.email,
          image: user.image,
        })
        .from(user)
        .where(
          and(ne(user.id, currentUser.id), sql`${user.name} ILIKE ${`%${q}%`}`),
        )
        .limit(20);
      return c.json(fallbackResults);
    } catch (fallbackError) {
      console.error("[Users Search Critical]", fallbackError);
      return c.json({ error: "Failed to perform user search" }, 500);
    }
  }
});

export default usersRoute;
