import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import { internalMutation, mutation, query } from "./_generated/server";
import {
  MAX_PLAYERS,
  STARTING_COINS,
  getRoomByCode,
  hashSeed,
  randomCode,
  requireHost,
  revealCore,
} from "./lib/game";

/* ──────────────────────────────────────────────────────────────────────────
 * Queries
 * ────────────────────────────────────────────────────────────────────────── */

/**
 * Public room state. Strips `hostSessionId` and the Linear access token —
 * clients only learn whether Linear is connected and to which team.
 */
export const get = query({
  args: { code: v.string() },
  handler: async (ctx, { code }) => {
    const room = await getRoomByCode(ctx, code);
    if (!room) return null;
    const { hostSessionId: _hostSessionId, linear, ...publicFields } = room;
    return {
      ...publicFields,
      linear: linear
        ? {
            connected: true as const,
            userName: linear.userName,
            workspaceName: linear.workspaceName,
            teamId: linear.teamId,
            teamName: linear.teamName,
          }
        : { connected: false as const },
    };
  },
});

/* ──────────────────────────────────────────────────────────────────────────
 * Lobby mutations
 * ────────────────────────────────────────────────────────────────────────── */

export const create = mutation({
  args: {
    roomName: v.string(),
    hostName: v.string(),
    sessionId: v.string(),
  },
  handler: async (ctx, { roomName, hostName, sessionId }) => {
    const name = roomName.trim().slice(0, 32) || "PLAYER ONE CREW";
    const host = hostName.trim().slice(0, 20) || "HOST";

    let code = randomCode();
    for (let attempt = 0; attempt < 24; attempt++) {
      if (!(await getRoomByCode(ctx, code))) break;
      code = randomCode();
    }

    const now = Date.now();
    const roomId = await ctx.db.insert("rooms", {
      code,
      name,
      hostSessionId: sessionId,
      status: "lobby",
      roundCount: 0,
      createdAt: now,
    });
    await ctx.db.insert("players", {
      roomId,
      sessionId,
      name: host,
      isHost: true,
      avatarSeed: hashSeed(host + code),
      coins: STARTING_COINS,
      joinedAt: now,
      lastSeenAt: now,
    });
    return { code };
  },
});

export const join = mutation({
  args: {
    code: v.string(),
    name: v.string(),
    sessionId: v.string(),
  },
  handler: async (ctx, { code, name, sessionId }) => {
    const room = await getRoomByCode(ctx, code);
    if (!room) throw new ConvexError("NO CABINET WITH THAT CODE — CHECK THE MARQUEE");

    const cleanName = name.trim().slice(0, 20) || "PLAYER";
    const now = Date.now();

    const existing = await ctx.db
      .query("players")
      .withIndex("by_room_session", (q) => q.eq("roomId", room._id).eq("sessionId", sessionId))
      .unique();
    if (existing) {
      await ctx.db.patch(existing._id, { name: cleanName, lastSeenAt: now });
      return { playerId: existing._id, code: room.code };
    }

    const roster = await ctx.db
      .query("players")
      .withIndex("by_room", (q) => q.eq("roomId", room._id))
      .collect();
    if (roster.length >= MAX_PLAYERS) throw new ConvexError("CABINET FULL — 16 PLAYER MAX");

    const playerId = await ctx.db.insert("players", {
      roomId: room._id,
      sessionId,
      name: cleanName,
      isHost: room.hostSessionId === sessionId,
      avatarSeed: hashSeed(cleanName + room.code + String(now % 977)),
      coins: STARTING_COINS,
      joinedAt: now,
      lastSeenAt: now,
    });
    return { playerId, code: room.code };
  },
});

/* ──────────────────────────────────────────────────────────────────────────
 * Round lifecycle (host controls)
 * ────────────────────────────────────────────────────────────────────────── */

/**
 * Start (or restart) a round. Activates the given ticket, or the current
 * active one, or the first queued boss. Optionally arms the countdown —
 * auto-reveal is scheduled server-side so every client stays in sync.
 */
export const startRound = mutation({
  args: {
    roomId: v.id("rooms"),
    sessionId: v.string(),
    ticketId: v.optional(v.id("tickets")),
    durationSec: v.optional(v.number()),
  },
  handler: async (ctx, { roomId, sessionId, ticketId, durationSec }): Promise<void> => {
    const room = await requireHost(ctx, roomId, sessionId);

    let ticket = ticketId ? await ctx.db.get(ticketId) : null;
    if (ticket && ticket.roomId !== roomId) throw new ConvexError("TICKET FROM ANOTHER CABINET");
    if (ticket?.status === "defeated") throw new ConvexError("THAT BOSS IS ALREADY DEFEATED");
    if (!ticket && room.activeTicketId) {
      const active = await ctx.db.get(room.activeTicketId);
      if (active && active.status === "active") ticket = active;
    }
    if (!ticket) {
      const queued = await ctx.db
        .query("tickets")
        .withIndex("by_room_status", (q) => q.eq("roomId", roomId).eq("status", "queued"))
        .collect();
      ticket = queued.sort((a, b) => a.order - b.order)[0] ?? null;
    }
    if (!ticket) throw new ConvexError("NO MISSIONS QUEUED — IMPORT A BACKLOG OR LOAD THE DEMO");

    // Bench the previously active boss if the host jumps to a different one.
    if (room.activeTicketId && room.activeTicketId !== ticket._id) {
      const previous = await ctx.db.get(room.activeTicketId);
      if (previous && previous.status === "active") {
        await ctx.db.patch(previous._id, { status: "queued" });
      }
    }
    if (ticket.status !== "active") await ctx.db.patch(ticket._id, { status: "active" });

    const round = room.roundCount + 1;
    const clampedSec =
      durationSec !== undefined ? Math.min(600, Math.max(10, Math.floor(durationSec))) : undefined;
    await ctx.db.patch(roomId, {
      activeTicketId: ticket._id,
      status: "voting",
      roundCount: round,
      roundEndsAt: clampedSec !== undefined ? Date.now() + clampedSec * 1000 : undefined,
    });
    if (clampedSec !== undefined) {
      await ctx.scheduler.runAfter(clampedSec * 1000, internal.rooms.autoReveal, {
        roomId,
        round,
      });
    }
  },
});

/** Arm or re-arm the countdown mid-round without resetting votes. */
export const armTimer = mutation({
  args: {
    roomId: v.id("rooms"),
    sessionId: v.string(),
    durationSec: v.number(),
  },
  handler: async (ctx, { roomId, sessionId, durationSec }): Promise<void> => {
    const room = await requireHost(ctx, roomId, sessionId);
    if (room.status !== "voting") throw new ConvexError("NO ROUND IN PROGRESS");
    const clampedSec = Math.min(600, Math.max(10, Math.floor(durationSec)));
    await ctx.db.patch(roomId, { roundEndsAt: Date.now() + clampedSec * 1000 });
    await ctx.scheduler.runAfter(clampedSec * 1000, internal.rooms.autoReveal, {
      roomId,
      round: room.roundCount,
    });
  },
});

export const clearTimer = mutation({
  args: { roomId: v.id("rooms"), sessionId: v.string() },
  handler: async (ctx, { roomId, sessionId }) => {
    await requireHost(ctx, roomId, sessionId);
    await ctx.db.patch(roomId, { roundEndsAt: undefined });
  },
});

export const reveal = mutation({
  args: { roomId: v.id("rooms"), sessionId: v.string() },
  handler: async (ctx, { roomId, sessionId }) => {
    const room = await requireHost(ctx, roomId, sessionId);
    if (room.status !== "voting") throw new ConvexError("NOTHING TO REVEAL — START A ROUND");
    await revealCore(ctx, room);
  },
});

/** Fired by the scheduler when the countdown hits zero. */
export const autoReveal = internalMutation({
  args: { roomId: v.id("rooms"), round: v.number() },
  handler: async (ctx, { roomId, round }) => {
    const room = await ctx.db.get(roomId);
    // A stale timer from a restarted round must not reveal the new one.
    if (!room || room.status !== "voting" || room.roundCount !== round) return;
    await revealCore(ctx, room);
  },
});

/** Scheduled by ticket defeat: slide in the next boss after the victory lap. */
export const advance = internalMutation({
  args: { roomId: v.id("rooms"), expectedRound: v.number() },
  handler: async (ctx, { roomId, expectedRound }) => {
    const room = await ctx.db.get(roomId);
    if (!room || room.status !== "victory" || room.roundCount !== expectedRound) return;

    const queued = await ctx.db
      .query("tickets")
      .withIndex("by_room_status", (q) => q.eq("roomId", roomId).eq("status", "queued"))
      .collect();
    const next = queued.sort((a, b) => a.order - b.order)[0];

    if (!next) {
      await ctx.db.patch(roomId, {
        status: "complete",
        activeTicketId: undefined,
        roundEndsAt: undefined,
      });
      return;
    }
    await ctx.db.patch(next._id, { status: "active" });
    await ctx.db.patch(roomId, {
      activeTicketId: next._id,
      status: "voting",
      roundCount: room.roundCount + 1,
      roundEndsAt: undefined,
    });
  },
});

export const backToLobby = mutation({
  args: { roomId: v.id("rooms"), sessionId: v.string() },
  handler: async (ctx, { roomId, sessionId }) => {
    const room = await requireHost(ctx, roomId, sessionId);
    if (room.activeTicketId) {
      const active = await ctx.db.get(room.activeTicketId);
      if (active && active.status === "active") {
        await ctx.db.patch(active._id, { status: "queued" });
      }
    }
    await ctx.db.patch(roomId, {
      status: "lobby",
      activeTicketId: undefined,
      roundEndsAt: undefined,
    });
  },
});
