import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { getRoomByCode, roomPlayers } from "./lib/game";

/**
 * Roster for the room. `sessionId` is each player's credential, so it is
 * stripped before anything leaves the server.
 */
export const byRoom = query({
  args: { roomId: v.id("rooms") },
  handler: async (ctx, { roomId }) => {
    const players = await roomPlayers(ctx, roomId);
    return players
      .sort((a, b) => a.joinedAt - b.joinedAt)
      .map((player) => ({
        _id: player._id,
        name: player.name,
        isHost: player.isHost,
        avatarSeed: player.avatarSeed,
        coins: player.coins ?? 100,
        joinedAt: player.joinedAt,
        lastSeenAt: player.lastSeenAt,
      }));
  },
});

/** The caller's own identity in a room (or null if they haven't joined). */
export const me = query({
  args: { code: v.string(), sessionId: v.string() },
  handler: async (ctx, { code, sessionId }) => {
    const room = await getRoomByCode(ctx, code);
    if (!room) return null;
    const player = await ctx.db
      .query("players")
      .withIndex("by_room_session", (q) => q.eq("roomId", room._id).eq("sessionId", sessionId))
      .unique();
    if (!player) return null;
    return {
      playerId: player._id,
      roomId: room._id,
      name: player.name,
      isHost: room.hostSessionId === sessionId,
      avatarSeed: player.avatarSeed,
      coins: player.coins ?? 100,
    };
  },
});

/** Presence heartbeat — fired every ~10s and on tab focus. */
export const heartbeat = mutation({
  args: { roomId: v.id("rooms"), sessionId: v.string() },
  handler: async (ctx, { roomId, sessionId }) => {
    const player = await ctx.db
      .query("players")
      .withIndex("by_room_session", (q) => q.eq("roomId", roomId).eq("sessionId", sessionId))
      .unique();
    if (player) await ctx.db.patch(player._id, { lastSeenAt: Date.now() });
  },
});
