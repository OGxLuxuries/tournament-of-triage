import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { MAX_SKILL_ROWS, requireHost } from "./lib/game";

/** Skills data rows for the room — username is the identifier. */
export const byRoom = query({
  args: { roomId: v.id("rooms") },
  handler: async (ctx, { roomId }) => {
    const rows = await ctx.db
      .query("skillProfiles")
      .withIndex("by_room", (q) => q.eq("roomId", roomId))
      .collect();
    return rows.map((row) => ({
      _id: row._id,
      username: row.username,
      skills: row.skills,
      confidence: row.confidence,
    }));
  },
});

/**
 * Replace the room's skills data with freshly parsed CSV rows. Username is
 * the identifier; an email column, if a legacy CSV still has one, is kept
 * only as a fallback match for the Smart Agent.
 */
export const upload = mutation({
  args: {
    roomId: v.id("rooms"),
    sessionId: v.string(),
    rows: v.array(
      v.object({
        username: v.string(),
        email: v.optional(v.string()),
        skills: v.array(v.string()),
        confidence: v.number(),
      }),
    ),
  },
  handler: async (ctx, { roomId, sessionId, rows }) => {
    await requireHost(ctx, roomId, sessionId);

    const existing = await ctx.db
      .query("skillProfiles")
      .withIndex("by_room", (q) => q.eq("roomId", roomId))
      .collect();
    for (const row of existing) await ctx.db.delete(row._id);

    let inserted = 0;
    for (const row of rows.slice(0, MAX_SKILL_ROWS)) {
      const username = row.username.trim().slice(0, 40);
      if (!username) continue;
      const skills = [
        ...new Set(
          row.skills.map((skill) => skill.trim().toLowerCase()).filter((skill) => skill.length > 0),
        ),
      ].slice(0, 24);
      await ctx.db.insert("skillProfiles", {
        roomId,
        email: (row.email ?? "").trim().slice(0, 80),
        username,
        skills,
        confidence: Math.min(5, Math.max(1, Math.round(row.confidence) || 1)),
      });
      inserted += 1;
    }
    return { inserted };
  },
});
