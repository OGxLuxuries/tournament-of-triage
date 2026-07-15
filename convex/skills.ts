import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { MAX_SKILL_ROWS, requireHost } from "./lib/game";

/**
 * Skills matrix rows, with emails masked for the lobby. The Smart Agent
 * matches on the server against the unmasked rows.
 */
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
      emailMasked: row.email ? row.email.replace(/@.*$/, "@…") : "",
      skills: row.skills,
      confidence: row.confidence,
    }));
  },
});

/** Replace the room's skills matrix with freshly parsed CSV rows. */
export const upload = mutation({
  args: {
    roomId: v.id("rooms"),
    sessionId: v.string(),
    rows: v.array(
      v.object({
        email: v.string(),
        username: v.string(),
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
      const email = row.email.trim().slice(0, 80);
      const skills = [
        ...new Set(
          row.skills.map((skill) => skill.trim().toLowerCase()).filter((skill) => skill.length > 0),
        ),
      ].slice(0, 24);
      if (!username && !email) continue;
      await ctx.db.insert("skillProfiles", {
        roomId,
        email,
        username: username || email.split("@")[0],
        skills,
        confidence: Math.min(5, Math.max(1, Math.round(row.confidence) || 1)),
      });
      inserted += 1;
    }
    return { inserted };
  },
});
