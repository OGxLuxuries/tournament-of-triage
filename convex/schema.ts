import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

/** A vote on either axis is always exactly 1, 2 or 3. */
export const pointValue = v.union(v.literal(1), v.literal(2), v.literal(3));

export default defineSchema({
  /**
   * One arcade cabinet per planning session. `hostSessionId` is the host's
   * private credential — it must never be returned by a public query.
   * `linear.accessToken` likewise stays server-side only.
   */
  rooms: defineTable({
    code: v.string(),
    name: v.string(),
    hostSessionId: v.string(),
    status: v.union(
      v.literal("lobby"),
      v.literal("voting"),
      v.literal("revealed"),
      v.literal("victory"),
      v.literal("complete"),
    ),
    activeTicketId: v.optional(v.id("tickets")),
    roundCount: v.number(),
    roundEndsAt: v.optional(v.number()),
    createdAt: v.number(),
    linear: v.optional(
      v.object({
        accessToken: v.string(),
        userName: v.optional(v.string()),
        workspaceName: v.optional(v.string()),
        teamId: v.optional(v.string()),
        teamName: v.optional(v.string()),
      }),
    ),
  }).index("by_code", ["code"]),

  /**
   * Presence: clients heartbeat `lastSeenAt` every ~10s; anyone stale for
   * more than PRESENCE_TTL_MS is rendered offline and excluded from the
   * Smart Agent's pairing pool. `sessionId` is the player's credential.
   */
  players: defineTable({
    roomId: v.id("rooms"),
    sessionId: v.string(),
    name: v.string(),
    isHost: v.boolean(),
    avatarSeed: v.number(),
    joinedAt: v.number(),
    lastSeenAt: v.number(),
  })
    .index("by_room", ["roomId"])
    .index("by_room_session", ["roomId", "sessionId"]),

  /** Boss battles. Either imported from Linear or seeded demo missions. */
  tickets: defineTable({
    roomId: v.id("rooms"),
    source: v.union(v.literal("linear"), v.literal("demo")),
    linearIssueId: v.optional(v.string()),
    identifier: v.string(),
    title: v.string(),
    description: v.string(),
    url: v.optional(v.string()),
    labels: v.array(v.string()),
    priority: v.optional(v.number()),
    /** Estimate already on the Linear issue when it was imported. */
    currentEstimate: v.optional(v.number()),
    order: v.number(),
    status: v.union(v.literal("queued"), v.literal("active"), v.literal("defeated")),
    finalComplexity: v.optional(v.number()),
    finalUncertainty: v.optional(v.number()),
    finalPoints: v.optional(v.number()),
    unanimous: v.optional(v.boolean()),
    pairingSummary: v.optional(v.string()),
    syncState: v.optional(
      v.union(v.literal("pending"), v.literal("synced"), v.literal("error"), v.literal("skipped")),
    ),
    syncError: v.optional(v.string()),
  })
    .index("by_room", ["roomId"])
    .index("by_room_status", ["roomId", "status"]),

  /**
   * One row per (ticket, player). `round` ties the row to a specific round
   * so a restarted round invalidates earlier picks without a delete sweep.
   */
  votes: defineTable({
    roomId: v.id("rooms"),
    ticketId: v.id("tickets"),
    playerId: v.id("players"),
    round: v.number(),
    complexity: v.optional(pointValue),
    uncertainty: v.optional(pointValue),
    /** Player raised their hand to take the work. */
    bid: v.optional(v.boolean()),
    updatedAt: v.number(),
  })
    .index("by_ticket", ["ticketId"])
    .index("by_ticket_player", ["ticketId", "playerId"]),

  /** Skills matrix rows uploaded by the host (CSV / Google Sheets export). */
  skillProfiles: defineTable({
    roomId: v.id("rooms"),
    email: v.string(),
    username: v.string(),
    skills: v.array(v.string()),
    confidence: v.number(),
  }).index("by_room", ["roomId"]),
});
