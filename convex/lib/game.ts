import { ConvexError } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";

/* ──────────────────────────────────────────────────────────────────────────
 * Constants
 * ────────────────────────────────────────────────────────────────────────── */

/** Unambiguous alphabet: no 0/O, 1/I/L so codes survive being read aloud. */
const ROOM_CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

/** A player is "online" if their heartbeat is fresher than this. */
export const PRESENCE_TTL_MS = 45_000;

/** How long the DEFEATED! animation plays before the next boss slides in. */
export const VICTORY_LAP_MS = 4_600;

export const MAX_PLAYERS = 16;
export const MAX_SKILL_ROWS = 200;

/* ──────────────────────────────────────────────────────────────────────────
 * Randomness helpers (Convex mutations may use Math.random / crypto)
 * ────────────────────────────────────────────────────────────────────────── */

export function randomCode(length = 5): string {
  let code = "";
  for (let i = 0; i < length; i++) {
    code += ROOM_CODE_ALPHABET[Math.floor(Math.random() * ROOM_CODE_ALPHABET.length)];
  }
  return code;
}

/** Deterministic 32-bit hash, used to seed pixel avatars. */
export function hashSeed(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/* ──────────────────────────────────────────────────────────────────────────
 * Lookup / auth guards
 * ────────────────────────────────────────────────────────────────────────── */

export async function getRoomByCode(
  ctx: QueryCtx,
  code: string,
): Promise<Doc<"rooms"> | null> {
  const normalized = code.trim().toUpperCase();
  return await ctx.db
    .query("rooms")
    .withIndex("by_code", (q) => q.eq("code", normalized))
    .unique();
}

export async function requireRoom(ctx: QueryCtx, roomId: Id<"rooms">): Promise<Doc<"rooms">> {
  const room = await ctx.db.get(roomId);
  if (!room) throw new ConvexError("ROOM NOT FOUND — CABINET UNPLUGGED");
  return room;
}

export async function requireHost(
  ctx: QueryCtx,
  roomId: Id<"rooms">,
  sessionId: string,
): Promise<Doc<"rooms">> {
  const room = await requireRoom(ctx, roomId);
  if (room.hostSessionId !== sessionId) {
    throw new ConvexError("HOST CONTROLS LOCKED — INSERT HOST KEY");
  }
  return room;
}

export async function requirePlayer(
  ctx: QueryCtx,
  roomId: Id<"rooms">,
  sessionId: string,
): Promise<Doc<"players">> {
  const player = await ctx.db
    .query("players")
    .withIndex("by_room_session", (q) => q.eq("roomId", roomId).eq("sessionId", sessionId))
    .unique();
  if (!player) throw new ConvexError("PLAYER NOT IN THIS CABINET — JOIN FIRST");
  return player;
}

export async function roomPlayers(
  ctx: QueryCtx,
  roomId: Id<"rooms">,
): Promise<Doc<"players">[]> {
  return await ctx.db
    .query("players")
    .withIndex("by_room", (q) => q.eq("roomId", roomId))
    .collect();
}

export function onlineOnly(players: Doc<"players">[], now: number): Doc<"players">[] {
  return players.filter((p) => now - p.lastSeenAt < PRESENCE_TTL_MS);
}

/* ──────────────────────────────────────────────────────────────────────────
 * Consensus math
 * ────────────────────────────────────────────────────────────────────────── */

export interface Consensus {
  complexity: number;
  uncertainty: number;
  points: number;
  unanimous: boolean;
  voterCount: number;
}

/** Most common value wins; ties round UP (agile rules: when in doubt, it's bigger). */
function mode(values: number[]): number {
  const counts = new Map<number, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  let best = values[0];
  let bestCount = 0;
  for (const [value, count] of counts) {
    if (count > bestCount || (count === bestCount && value > best)) {
      best = value;
      bestCount = count;
    }
  }
  return best;
}

export function computeConsensus(
  votes: Array<{ complexity?: number; uncertainty?: number }>,
): Consensus | undefined {
  const submitted = votes.filter(
    (vote): vote is { complexity: number; uncertainty: number } =>
      vote.complexity !== undefined && vote.uncertainty !== undefined,
  );
  if (submitted.length === 0) return undefined;
  const complexity = mode(submitted.map((vote) => vote.complexity));
  const uncertainty = mode(submitted.map((vote) => vote.uncertainty));
  const unanimous =
    submitted.length >= 2 &&
    submitted.every(
      (vote) =>
        vote.complexity === submitted[0].complexity &&
        vote.uncertainty === submitted[0].uncertainty,
    );
  return {
    complexity,
    uncertainty,
    points: Math.max(complexity, uncertainty),
    unanimous,
    voterCount: submitted.length,
  };
}

/* ──────────────────────────────────────────────────────────────────────────
 * Smart Agent — Navigator / Implementor pairing
 * ────────────────────────────────────────────────────────────────────────── */

interface PairingInput {
  ticket: Pick<Doc<"tickets">, "identifier" | "title" | "description" | "labels">;
  onlinePlayers: Array<Pick<Doc<"players">, "name">>;
  profiles: Array<Pick<Doc<"skillProfiles">, "email" | "username" | "skills" | "confidence">>;
  consensus: Consensus;
}

interface RankedPlayer {
  name: string;
  matched: string[];
  confidence: number;
  hasProfile: boolean;
  score: number;
}

function profileFor(
  name: string,
  profiles: PairingInput["profiles"],
): PairingInput["profiles"][number] | undefined {
  const needle = name.trim().toLowerCase();
  return profiles.find(
    (profile) =>
      profile.username.trim().toLowerCase() === needle ||
      profile.email.trim().toLowerCase() === needle ||
      profile.email.trim().toLowerCase().split("@")[0] === needle,
  );
}

/**
 * Rank the lobby against the ticket text. A skill "matches" when it appears
 * as a substring of the ticket's title + description + labels (both sides
 * lowercased), so `postgres` matches "the ancient Postgres 9.4 cluster".
 */
function rankPlayers(input: PairingInput): RankedPlayer[] {
  const haystack = [input.ticket.title, input.ticket.description, input.ticket.labels.join(" ")]
    .join(" ")
    .toLowerCase();
  return input.onlinePlayers.map((player) => {
    const profile = profileFor(player.name, input.profiles);
    if (!profile) {
      return { name: player.name, matched: [], confidence: 0, hasProfile: false, score: 0 };
    }
    const matched = profile.skills.filter(
      (skill) => skill.length >= 2 && haystack.includes(skill.toLowerCase()),
    );
    return {
      name: player.name,
      matched,
      confidence: profile.confidence,
      hasProfile: true,
      score: matched.length * profile.confidence,
    };
  });
}

export function buildPairingSummary(input: PairingInput): string {
  const trigger = [
    input.consensus.complexity === 3 ? "COMPLEXITY 3" : null,
    input.consensus.uncertainty === 3 ? "UNCERTAINTY 3" : null,
  ]
    .filter(Boolean)
    .join(" + ");

  const header = `### 🤖 SMART AGENT · PAIRING PROTOCOL\n**Trigger:** ${input.ticket.identifier} rolled ${trigger} — co-op strategy engaged.\n`;

  if (input.onlinePlayers.length < 2) {
    return (
      header +
      "\n⚠️ Only one fighter is online — pairing needs two. Recruit a second player, then re-run the reveal."
    );
  }
  if (input.profiles.length === 0) {
    return (
      header +
      "\n⚠️ No skills matrix loaded. Upload the CSV on the host dashboard (Email/Username, Skills, Confidence) to unlock pairing intel."
    );
  }

  const ranked = rankPlayers(input).sort(
    (a, b) => b.score - a.score || b.confidence - a.confidence,
  );
  const navigator = ranked[0];
  // Implementor: the weakest match — ideally no matched skills — for skill transfer.
  const implementor = [...ranked]
    .reverse()
    .find((candidate) => candidate.name !== navigator.name)!;

  const navigatorLoadout =
    navigator.matched.length > 0
      ? `${navigator.matched.map((skill) => `\`${skill}\``).join(" · ")} (confidence ${navigator.confidence}/5)`
      : navigator.hasProfile
        ? `no direct skill match — highest confidence aboard (${navigator.confidence}/5)`
        : "no profile on file — drafted on vibes";
  const implementorLoadout =
    implementor.matched.length > 0
      ? `knows ${implementor.matched.map((skill) => `\`${skill}\``).join(" · ")} — reinforcing`
      : "no matching skills yet — prime learning opportunity";

  const briefing =
    navigator.matched.length > 0
      ? `**${navigator.name}** navigates (owns the map: ${navigator.matched.join(", ")}). **${implementor.name}** implements — hands on keyboard — to level up. Swap the keyboard every 25 minutes.`
      : `Nobody aboard has a direct counter for this boss. **${navigator.name}** navigates on seniority; **${implementor.name}** implements. Consider a spike before committing.`;

  return [
    header,
    "| ROLE | PLAYER | LOADOUT |",
    "| --- | --- | --- |",
    `| 🧭 NAVIGATOR | **${navigator.name}** | ${navigatorLoadout} |`,
    `| 🔧 IMPLEMENTOR | **${implementor.name}** | ${implementorLoadout} |`,
    "",
    `**Mission briefing:** ${briefing} Ship it together. 🕹️`,
  ].join("\n");
}

/* ──────────────────────────────────────────────────────────────────────────
 * Reveal — shared by the host button and the countdown scheduler
 * ────────────────────────────────────────────────────────────────────────── */

export async function revealCore(ctx: MutationCtx, room: Doc<"rooms">): Promise<void> {
  if (room.status !== "voting" || !room.activeTicketId) return;
  const ticket = await ctx.db.get(room.activeTicketId);
  if (!ticket) return;

  const allVotes = await ctx.db
    .query("votes")
    .withIndex("by_ticket", (q) => q.eq("ticketId", ticket._id))
    .collect();
  const votes = allVotes.filter((vote) => vote.round === room.roundCount);
  const consensus = computeConsensus(votes);

  let pairingSummary: string | undefined;
  if (consensus && (consensus.complexity === 3 || consensus.uncertainty === 3)) {
    const now = Date.now();
    const players = onlineOnly(await roomPlayers(ctx, room._id), now);
    const profiles = await ctx.db
      .query("skillProfiles")
      .withIndex("by_room", (q) => q.eq("roomId", room._id))
      .collect();
    pairingSummary = buildPairingSummary({
      ticket,
      onlinePlayers: players,
      profiles,
      consensus,
    });
  }

  await ctx.db.patch(ticket._id, {
    finalComplexity: consensus?.complexity,
    finalUncertainty: consensus?.uncertainty,
    finalPoints: consensus?.points,
    unanimous: consensus?.unanimous ?? false,
    pairingSummary,
  });
  await ctx.db.patch(room._id, { status: "revealed", roundEndsAt: undefined });
}

/* ──────────────────────────────────────────────────────────────────────────
 * Linear comment — the arcade high-score board
 * ────────────────────────────────────────────────────────────────────────── */

const MEDALS = ["🥇", "🥈", "🥉"];

export function buildConsensusComment(input: {
  identifier: string;
  title: string;
  finalComplexity?: number;
  finalUncertainty?: number;
  finalPoints?: number;
  unanimous?: boolean;
  votes: Array<{ name: string; complexity: number; uncertainty: number }>;
  bidders?: string[];
  pairingSummary?: string;
  roomName: string;
}): string {
  const lines: string[] = [
    "## 👾 BITPOINT ARCADE — CONSENSUS BOARD",
    `> BOSS DEFEATED: **${input.identifier} · ${input.title}**`,
    "",
  ];
  if (input.finalPoints !== undefined) {
    lines.push(
      `**FINAL SCORE: ${input.finalPoints} PTS** — max(Complexity ${input.finalComplexity}, Uncertainty ${input.finalUncertainty})` +
        (input.unanimous ? " · 🌟 **PERFECT!** (unanimous)" : ""),
      "",
    );
  }
  if (input.votes.length > 0) {
    lines.push("| RANK | PLAYER | COMPLEXITY | UNCERTAINTY |", "| --- | --- | --- | --- |");
    input.votes.forEach((vote, index) => {
      const medal = MEDALS[index] ?? "🕹️";
      lines.push(
        `| ${index + 1} | ${medal} ${vote.name} | ${vote.complexity} | ${vote.uncertainty} |`,
      );
    });
    lines.push("");
  } else {
    lines.push("_No votes were cast — the boss surrendered out of boredom._", "");
  }
  if (input.bidders && input.bidders.length > 0) {
    lines.push(`🙋 **Bids to take it:** ${input.bidders.join(", ")}`, "");
  }
  if (input.pairingSummary) {
    lines.push("---", "", input.pairingSummary, "");
  }
  lines.push(`_Recorded by BitPoint Arcade · cabinet “${input.roomName}”_`);
  return lines.join("\n");
}

/* ──────────────────────────────────────────────────────────────────────────
 * Demo missions — playable without Linear
 * ────────────────────────────────────────────────────────────────────────── */

export const DEMO_TICKETS: Array<{
  identifier: string;
  title: string;
  description: string;
  labels: string[];
  priority: number;
}> = [
  {
    identifier: "LEGACY-01",
    title: "The Legacy Database Awakens",
    description:
      "The ancient Postgres 9.4 cluster powering billing has begun to stir. Migrate the `invoices` schema to the new cluster without downtime.\n\n- Dual-write shim for writes during cutover\n- Backfill 42M rows with checksum verification\n- Feature-flag rollback path\n\nBeware: triggers nobody remembers writing. SQL migrations are the only language it fears.",
    labels: ["database", "migration"],
    priority: 1,
  },
  {
    identifier: "AUTH-13",
    title: "Ghost in the Login Shell",
    description:
      "Users report being logged out at random — but only on Tuesdays. The OAuth refresh token rotation appears haunted.\n\n- Reproduce the 401 loop\n- Audit refresh token rotation and clock skew\n- Add regression tests for token expiry edge cases\n\nSecurity review required before the exorcism ships.",
    labels: ["auth", "bug", "security"],
    priority: 2,
  },
  {
    identifier: "PERF-07",
    title: "Render Loop of Doom",
    description:
      "The dashboard re-renders 400 times per keystroke. The React profiler flamegraph looks like an actual flame.\n\n- Memoize the widget grid\n- Move filter state out of context\n- Add a performance budget check to CI\n\nProfiling data attached. Bring a fire extinguisher.",
    labels: ["react", "performance"],
    priority: 3,
  },
  {
    identifier: "INFRA-99",
    title: "Kraken of the Kubernetes Deep",
    description:
      "The autoscaler summons 300 pods at 3 AM and nobody knows why. Tame the beast.\n\n- Trace the HPA metric source\n- Fix the terraform module defaults\n- Add alerting before the kraken wakes again\n\nInfra on-call has stopped sleeping. This is a cry for help.",
    labels: ["kubernetes", "terraform", "infra"],
    priority: 2,
  },
];
