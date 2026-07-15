import { ConvexError, v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { pointValue } from "./schema";
import { requirePlayer, requireRoom } from "./lib/game";

/**
 * Votes for the active ticket. Blind while voting is open: other players'
 * picks are masked server-side (only `ready` leaks). The caller always sees
 * their own picks so the cabinet buttons can light up after a refresh.
 */
export const forActive = query({
  args: { roomId: v.id("rooms"), sessionId: v.optional(v.string()) },
  handler: async (ctx, { roomId, sessionId }) => {
    const room = await ctx.db.get(roomId);
    if (!room || !room.activeTicketId) {
      return { revealed: false, votes: [] as MaskedVote[] };
    }
    const revealed = room.status !== "voting";

    let myPlayerId: string | undefined;
    if (sessionId) {
      const mine = await ctx.db
        .query("players")
        .withIndex("by_room_session", (q) => q.eq("roomId", roomId).eq("sessionId", sessionId))
        .unique();
      myPlayerId = mine?._id;
    }

    const allVotes = await ctx.db
      .query("votes")
      .withIndex("by_ticket", (q) => q.eq("ticketId", room.activeTicketId!))
      .collect();

    const votes: MaskedVote[] = allVotes
      .filter((vote) => vote.round === room.roundCount)
      .map((vote) => {
        const visible = revealed || vote.playerId === myPlayerId;
        return {
          playerId: vote.playerId,
          ready: vote.complexity !== undefined && vote.uncertainty !== undefined,
          complexity: visible ? vote.complexity : undefined,
          uncertainty: visible ? vote.uncertainty : undefined,
          updatedAt: vote.updatedAt,
        };
      });
    return { revealed, votes };
  },
});

interface MaskedVote {
  playerId: string;
  ready: boolean;
  complexity?: number;
  uncertainty?: number;
  updatedAt: number;
}

/** Cast or change a vote on one axis. Upserts per (ticket, player). */
export const cast = mutation({
  args: {
    roomId: v.id("rooms"),
    sessionId: v.string(),
    axis: v.union(v.literal("complexity"), v.literal("uncertainty")),
    value: pointValue,
  },
  handler: async (ctx, { roomId, sessionId, axis, value }) => {
    const room = await requireRoom(ctx, roomId);
    if (room.status !== "voting" || !room.activeTicketId) {
      throw new ConvexError("VOTING CLOSED — WAIT FOR THE NEXT ROUND");
    }
    const player = await requirePlayer(ctx, roomId, sessionId);
    const now = Date.now();

    const existing = await ctx.db
      .query("votes")
      .withIndex("by_ticket_player", (q) =>
        q.eq("ticketId", room.activeTicketId!).eq("playerId", player._id),
      )
      .unique();

    const axisPatch =
      axis === "complexity" ? { complexity: value } : { uncertainty: value };

    if (!existing) {
      await ctx.db.insert("votes", {
        roomId,
        ticketId: room.activeTicketId,
        playerId: player._id,
        round: room.roundCount,
        updatedAt: now,
        ...axisPatch,
      });
    } else if (existing.round !== room.roundCount) {
      // Stale row from a restarted round: wipe both axes, then set this one.
      await ctx.db.patch(existing._id, {
        round: room.roundCount,
        complexity: undefined,
        uncertainty: undefined,
        updatedAt: now,
        ...axisPatch,
      });
    } else {
      await ctx.db.patch(existing._id, { updatedAt: now, ...axisPatch });
    }

    // Voting counts as presence.
    await ctx.db.patch(player._id, { lastSeenAt: now });
  },
});
