import type { FunctionReturnType } from "convex/server";
import { api } from "../../convex/_generated/api";

/** Client-side views of server state, derived straight from the query types. */
export type RoomState = NonNullable<FunctionReturnType<typeof api.rooms.get>>;
export type PlayerRow = FunctionReturnType<typeof api.players.byRoom>[number];
export type TicketRow = FunctionReturnType<typeof api.tickets.byRoom>[number];
export type VotesState = FunctionReturnType<typeof api.votes.forActive>;
export type MeState = NonNullable<FunctionReturnType<typeof api.players.me>>;
export type SkillRowView = FunctionReturnType<typeof api.skills.byRoom>[number];

/** Presence: mirrors PRESENCE_TTL_MS on the server. */
export const ONLINE_TTL_MS = 45_000;

export function isOnline(player: Pick<PlayerRow, "lastSeenAt">, now: number): boolean {
  return now - player.lastSeenAt < ONLINE_TTL_MS;
}
