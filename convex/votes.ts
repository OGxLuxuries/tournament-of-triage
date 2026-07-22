import { ConvexError, v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { pointValue } from "./schema";
import { requirePlayer, requireRoom } from "./lib/game";

/**
 * Votes for the active ticket. Blind while voting is open: other players'
 * individual picks are masked server-side (only `ready` leaks) — but the
 * round AVERAGES and the bid count are public in real time, which is what
 * drives the mechanical sliders and the BIDS counter. The caller always
 * sees their own picks so the cabinet lights up after a refresh.
 */
export const forActive = query({
  args: { roomId: v.id("rooms"), sessionId: v.optional(v.string()) },
  handler: async (ctx, { roomId, sessionId }) => {
    const empty = {
      revealed: false,
      votes: [] as MaskedVote[],
      averages: { complexity: null as number | null, uncertainty: null as number | null },
      bidCount: 0,
    };
    const room = await ctx.db.get(roomId);
    if (!room || !room.activeTicketId) return empty;
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
    const currentVotes = allVotes.filter((vote) => vote.round === room.roundCount);

    const average = (values: number[]): number | null =>
      values.length === 0
        ? null
        : Math.round((values.reduce((sum, value) => sum + value, 0) / values.length) * 10) / 10;

    const votes: MaskedVote[] = currentVotes.map((vote) => {
      const visible = revealed || vote.playerId === myPlayerId;
      return {
        playerId: vote.playerId,
        ready: vote.complexity !== undefined && vote.uncertainty !== undefined,
        complexity: visible ? vote.complexity : undefined,
        uncertainty: visible ? vote.uncertainty : undefined,
        bid: visible ? (vote.bid ?? false) : undefined,
        updatedAt: vote.updatedAt,
      };
    });

    return {
      revealed,
      votes,
      averages: {
        complexity: average(
          currentVotes.map((vote) => vote.complexity).filter((value): value is 1 | 2 | 3 => value !== undefined),
        ),
        uncertainty: average(
          currentVotes.map((vote) => vote.uncertainty).filter((value): value is 1 | 2 | 3 => value !== undefined),
        ),
      },
      bidCount: currentVotes.filter((vote) => vote.bid).length,
    };
  },
});

interface MaskedVote {
  playerId: string;
  ready: boolean;
  complexity?: number;
  uncertainty?: number;
  bid?: boolean;
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
      // Stale row from a restarted round: wipe everything, then set this axis.
      await ctx.db.patch(existing._id, {
        round: room.roundCount,
        complexity: undefined,
        uncertainty: undefined,
        bid: undefined,
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

/**
 * The gold button: raise (or withdraw) a bid to take the work. Allowed while
 * voting AND after the reveal — the discussion phase is exactly when people
 * volunteer.
 */
export const toggleBid = mutation({
  args: { roomId: v.id("rooms"), sessionId: v.string() },
  handler: async (ctx, { roomId, sessionId }) => {
    const room = await requireRoom(ctx, roomId);
    if ((room.status !== "voting" && room.status !== "revealed") || !room.activeTicketId) {
      throw new ConvexError("NO OPEN QUEST TO BID ON");
    }
    const player = await requirePlayer(ctx, roomId, sessionId);
    const now = Date.now();

    const existing = await ctx.db
      .query("votes")
      .withIndex("by_ticket_player", (q) =>
        q.eq("ticketId", room.activeTicketId!).eq("playerId", player._id),
      )
      .unique();

    if (!existing) {
      await ctx.db.insert("votes", {
        roomId,
        ticketId: room.activeTicketId,
        playerId: player._id,
        round: room.roundCount,
        bid: true,
        updatedAt: now,
      });
    } else if (existing.round !== room.roundCount) {
      await ctx.db.patch(existing._id, {
        round: room.roundCount,
        complexity: undefined,
        uncertainty: undefined,
        bid: true,
        updatedAt: now,
      });
    } else {
      await ctx.db.patch(existing._id, { bid: !existing.bid, updatedAt: now });
    }
    await ctx.db.patch(player._id, { lastSeenAt: now });
  },
});
