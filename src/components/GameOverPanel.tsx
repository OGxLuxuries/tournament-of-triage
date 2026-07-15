import { useMutation } from "convex/react";
import { RefreshCw, Sparkles, Trophy } from "lucide-react";
import { api } from "../../convex/_generated/api";
import { useToast } from "../lib/toast";
import type { MeState, RoomState, TicketRow } from "../lib/types";
import { ArcadeButton, Panel } from "./ui";

interface GameOverPanelProps {
  room: RoomState;
  tickets: TicketRow[];
  me: MeState;
  sessionId: string;
}

/** All bosses down: the credits screen with the final scoreboard. */
export function GameOverPanel({ room, tickets, me, sessionId }: GameOverPanelProps) {
  const toast = useToast();
  const backToLobby = useMutation(api.rooms.backToLobby);
  const defeated = tickets.filter((ticket) => ticket.status === "defeated");
  const totalPoints = defeated.reduce((sum, ticket) => sum + (ticket.finalPoints ?? 0), 0);
  const perfects = defeated.filter((ticket) => ticket.unanimous).length;

  return (
    <div className="mx-auto w-full max-w-3xl">
      <div className="mb-6 text-center">
        <Trophy size={48} className="mx-auto animate-float text-neon-yellow" aria-hidden />
        <h2 className="animate-hue mt-3 font-arcade text-3xl text-glow-yellow sm:text-4xl">
          ALL BOSSES DEFEATED
        </h2>
        <p className="mt-3 font-mono text-sm text-slate-300">
          {defeated.length} tickets pointed · {totalPoints} total story points · {perfects}{" "}
          PERFECT round{perfects === 1 ? "" : "s"}
        </p>
      </div>

      <Panel tone="yellow" title="FINAL SCOREBOARD">
        <ul className="flex flex-col gap-2">
          {defeated.map((ticket) => (
            <li
              key={ticket._id}
              className="flex flex-wrap items-center gap-2 border-2 border-abyss-600 bg-abyss-900/60 px-3 py-2 text-xs"
            >
              <span className="font-arcade text-[9px] text-neon-cyan">{ticket.identifier}</span>
              <span className="min-w-0 flex-1 truncate text-slate-300">{ticket.title}</span>
              {ticket.unanimous && (
                <span className="flex items-center gap-1 font-arcade text-[8px] text-neon-green">
                  <Sparkles size={10} aria-hidden /> PERFECT
                </span>
              )}
              <span
                className={
                  "font-arcade text-[8px] " +
                  (ticket.syncState === "synced"
                    ? "text-neon-green"
                    : ticket.syncState === "error"
                      ? "text-neon-red"
                      : "text-slate-500")
                }
              >
                {ticket.syncState === "synced"
                  ? "SYNCED→LINEAR"
                  : ticket.syncState === "error"
                    ? "SYNC FAILED"
                    : "LOCAL"}
              </span>
              <span className="font-arcade text-sm text-neon-yellow">
                {ticket.finalPoints ?? "—"} PTS
              </span>
            </li>
          ))}
          {defeated.length === 0 && (
            <li className="py-4 text-center text-xs text-slate-500">
              The bosses fled before a single round was played.
            </li>
          )}
        </ul>

        {me.isHost && (
          <div className="mt-4 flex flex-wrap justify-center gap-3">
            <ArcadeButton
              tone="cyan"
              onClick={() =>
                backToLobby({ roomId: room._id, sessionId }).catch((error) => toast.error(error))
              }
            >
              <span className="flex items-center gap-2">
                <RefreshCw size={12} aria-hidden /> BACK TO LOBBY
              </span>
            </ArcadeButton>
            <p className="w-full text-center text-[11px] text-slate-400">
              Import more missions from the HOST CONSOLE to run another campaign.
            </p>
          </div>
        )}
      </Panel>
    </div>
  );
}
