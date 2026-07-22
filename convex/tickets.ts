import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { internalMutation, mutation, query } from "./_generated/server";
import { DEMO_TICKETS, VICTORY_LAP_MS, requireHost, revealCore } from "./lib/game";

export const byRoom = query({
  args: { roomId: v.id("rooms") },
  handler: async (ctx, { roomId }) => {
    const tickets = await ctx.db
      .query("tickets")
      .withIndex("by_room", (q) => q.eq("roomId", roomId))
      .collect();
    return tickets.sort((a, b) => a.order - b.order);
  },
});

/** Seed the demo missions so the cabinet is playable without Linear. */
export const loadDemo = mutation({
  args: { roomId: v.id("rooms"), sessionId: v.string() },
  handler: async (ctx, { roomId, sessionId }) => {
    await requireHost(ctx, roomId, sessionId);
    const existing = await ctx.db
      .query("tickets")
      .withIndex("by_room", (q) => q.eq("roomId", roomId))
      .collect();
    if (existing.some((ticket) => ticket.source === "demo" && ticket.status !== "defeated")) {
      return { inserted: 0 };
    }
    let order = existing.reduce((max, ticket) => Math.max(max, ticket.order), 0);
    for (const demo of DEMO_TICKETS) {
      order += 1;
      await ctx.db.insert("tickets", {
        roomId,
        source: "demo",
        identifier: demo.identifier,
        title: demo.title,
        description: demo.description,
        labels: demo.labels,
        priority: demo.priority,
        order,
        status: "queued",
      });
    }
    return { inserted: DEMO_TICKETS.length };
  },
});

/**
 * Append the host's selected Linear issues to the queue. Issues already in
 * the room (any status) are skipped, so repeated scans across different team
 * scopes accumulate instead of clobbering each other.
 */
export const importMany = internalMutation({
  args: {
    roomId: v.id("rooms"),
    issues: v.array(
      v.object({
        linearIssueId: v.string(),
        identifier: v.string(),
        title: v.string(),
        description: v.string(),
        url: v.optional(v.string()),
        labels: v.array(v.string()),
        priority: v.optional(v.number()),
        currentEstimate: v.optional(v.number()),
      }),
    ),
  },
  handler: async (ctx, { roomId, issues }): Promise<{ inserted: number; skipped: number }> => {
    const existing = await ctx.db
      .query("tickets")
      .withIndex("by_room", (q) => q.eq("roomId", roomId))
      .collect();
    const knownIssueIds = new Set(
      existing.map((ticket) => ticket.linearIssueId).filter(Boolean),
    );

    let order = existing.reduce((max, ticket) => Math.max(max, ticket.order), 0);
    let inserted = 0;
    for (const issue of issues) {
      if (knownIssueIds.has(issue.linearIssueId)) continue;
      order += 1;
      inserted += 1;
      await ctx.db.insert("tickets", {
        roomId,
        source: "linear",
        linearIssueId: issue.linearIssueId,
        identifier: issue.identifier,
        title: issue.title,
        description: issue.description,
        url: issue.url,
        labels: issue.labels,
        priority: issue.priority,
        currentEstimate: issue.currentEstimate,
        order,
        status: "queued",
      });
    }
    return { inserted, skipped: issues.length - inserted };
  },
});

/** Host benches a queued boss — e.g. a triage issue imported by mistake. */
export const remove = mutation({
  args: {
    roomId: v.id("rooms"),
    sessionId: v.string(),
    ticketId: v.id("tickets"),
  },
  handler: async (ctx, { roomId, sessionId, ticketId }) => {
    await requireHost(ctx, roomId, sessionId);
    const ticket = await ctx.db.get(ticketId);
    if (!ticket || ticket.roomId !== roomId) throw new ConvexError("TICKET NOT FOUND");
    if (ticket.status !== "queued") {
      throw new ConvexError("ONLY QUEUED BOSSES CAN BE BENCHED");
    }
    await ctx.db.delete(ticketId);
  },
});

export interface DefeatPayload {
  ticketId: Id<"tickets">;
  identifier: string;
  title: string;
  roomName: string;
  finalComplexity?: number;
  finalUncertainty?: number;
  finalPoints?: number;
  unanimous?: boolean;
  pairingSummary?: string;
  votes: Array<{ name: string; complexity: number; uncertainty: number }>;
  bidders: Array<{ name: string; amount: number }>;
  wonBy?: { name: string; amount: number };
  linear: { accessToken: string; issueId: string } | null;
}

/**
 * Host pressed SYNC & ADVANCE: reveal if needed, stamp the boss DEFEATED,
 * enter the victory lap, and schedule the next boss. Returns everything the
 * Linear sync action needs (internal-only — the token never reaches clients).
 */
export const finalizeActive = internalMutation({
  args: { roomId: v.id("rooms"), sessionId: v.string() },
  handler: async (ctx, { roomId, sessionId }): Promise<DefeatPayload> => {
    let room = await requireHost(ctx, roomId, sessionId);
    if (room.status !== "voting" && room.status !== "revealed") {
      throw new ConvexError("NO BATTLE IN PROGRESS");
    }
    if (!room.activeTicketId) throw new ConvexError("NO ACTIVE BOSS");

    if (room.status === "voting") {
      await revealCore(ctx, room);
      room = (await ctx.db.get(roomId))!;
    }

    const ticket = await ctx.db.get(room.activeTicketId!);
    if (!ticket) throw new ConvexError("BOSS ESCAPED — TICKET MISSING");

    await ctx.db.patch(ticket._id, {
      status: "defeated",
      syncState: ticket.linearIssueId && room.linear ? "pending" : "skipped",
    });
    await ctx.db.patch(roomId, { status: "victory", roundEndsAt: undefined });
    await ctx.scheduler.runAfter(VICTORY_LAP_MS, internal.rooms.advance, {
      roomId,
      expectedRound: room.roundCount,
    });

    const allVotes = await ctx.db
      .query("votes")
      .withIndex("by_ticket", (q) => q.eq("ticketId", ticket._id))
      .collect();
    const roundVotes = allVotes.filter((vote) => vote.round === room.roundCount);
    const fullVotes = roundVotes
      .filter((vote) => vote.complexity !== undefined && vote.uncertainty !== undefined)
      .sort((a, b) => a.updatedAt - b.updatedAt);

    const namedVotes: DefeatPayload["votes"] = [];
    for (const vote of fullVotes) {
      const player = await ctx.db.get(vote.playerId);
      namedVotes.push({
        name: player?.name ?? "UNKNOWN PLAYER",
        complexity: vote.complexity!,
        uncertainty: vote.uncertainty!,
      });
    }
    // Settle the bidding war: highest wager wins (tie → earliest bid), and
    // ONLY the winner pays — coins leave their purse permanently.
    const bidVotes = roundVotes
      .filter((vote) => (vote.bidAmount ?? 0) > 0)
      .sort((a, b) => (b.bidAmount ?? 0) - (a.bidAmount ?? 0) || a.updatedAt - b.updatedAt);
    const bidders: DefeatPayload["bidders"] = [];
    let wonBy: DefeatPayload["wonBy"];
    for (const [index, vote] of bidVotes.entries()) {
      const player = await ctx.db.get(vote.playerId);
      if (!player) continue;
      const amount = vote.bidAmount!;
      bidders.push({ name: player.name, amount });
      if (index === 0) {
        wonBy = { name: player.name, amount };
        await ctx.db.patch(player._id, {
          coins: Math.max(0, (player.coins ?? 100) - amount),
        });
      }
    }
    if (wonBy) {
      await ctx.db.patch(ticket._id, { wonBy: wonBy.name, winningBid: wonBy.amount });
    }

    const fresh: Doc<"tickets"> = (await ctx.db.get(ticket._id))!;
    return {
      ticketId: fresh._id,
      identifier: fresh.identifier,
      title: fresh.title,
      roomName: room.name,
      finalComplexity: fresh.finalComplexity,
      finalUncertainty: fresh.finalUncertainty,
      finalPoints: fresh.finalPoints,
      unanimous: fresh.unanimous,
      pairingSummary: fresh.pairingSummary,
      votes: namedVotes,
      bidders,
      wonBy,
      linear:
        room.linear && fresh.linearIssueId
          ? { accessToken: room.linear.accessToken, issueId: fresh.linearIssueId }
          : null,
    };
  },
});

export const markSync = internalMutation({
  args: {
    ticketId: v.id("tickets"),
    state: v.union(
      v.literal("pending"),
      v.literal("synced"),
      v.literal("error"),
      v.literal("skipped"),
    ),
    error: v.optional(v.string()),
  },
  handler: async (ctx, { ticketId, state, error }) => {
    await ctx.db.patch(ticketId, { syncState: state, syncError: error });
  },
});
