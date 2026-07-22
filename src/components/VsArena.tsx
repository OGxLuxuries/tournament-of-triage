import { useAction, useMutation } from "convex/react";
import { Bot, Eye, ExternalLink, Rocket, Skull, Swords, Zap } from "lucide-react";
import { useState } from "react";
import { api } from "../../convex/_generated/api";
import { cn } from "../lib/cn";
import { Markdown } from "../lib/md";
import { useToast } from "../lib/toast";
import {
  isOnline,
  type MeState,
  type PlayerRow,
  type RoomState,
  type TicketRow,
  type VotesState,
} from "../lib/types";
import { ControllerDeck } from "./ControllerDeck";
import { CountdownClock } from "./CountdownClock";
import { PixelAvatar } from "./PixelAvatar";
import { SliderMeter } from "./SliderMeter";
import { ArcadeButton, Panel } from "./ui";

interface VsArenaProps {
  room: RoomState;
  players: PlayerRow[];
  ticket: TicketRow;
  votes: VotesState | undefined;
  me: MeState;
  now: number;
  sessionId: string;
}

/** The boss battle: VS marquee, team vs ticket, reveal + victory theatrics. */
export function VsArena({ room, players, ticket, votes, me, now, sessionId }: VsArenaProps) {
  const toast = useToast();
  const reveal = useMutation(api.rooms.reveal);
  const defeatTicket = useAction(api.linear.defeatTicket);
  const [syncBusy, setSyncBusy] = useState(false);

  const phase = room.status === "victory" ? "victory" : room.status === "revealed" ? "revealed" : "voting";
  const onlinePlayers = players.filter((player) => isOnline(player, now));
  const squad = (onlinePlayers.length > 0 ? onlinePlayers : players).slice(0, 8);
  const readyIds = new Set(
    (votes?.votes ?? []).filter((vote) => vote.ready).map((vote) => vote.playerId),
  );

  const handleReveal = () =>
    reveal({ roomId: room._id, sessionId }).catch((error) => toast.error(error));

  const handleDefeat = async () => {
    setSyncBusy(true);
    try {
      const result = await defeatTicket({ roomId: room._id, sessionId });
      toast.push(result.synced ? "success" : "info", result.detail);
    } catch (error) {
      toast.error(error);
    } finally {
      setSyncBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      {/* ── VS marquee ─────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2 text-center">
        <span className="max-w-56 truncate font-arcade text-sm text-glow-cyan sm:text-base">
          TEAM {room.name.toUpperCase()}
        </span>
        <span className="animate-pulse-urgent font-arcade text-2xl text-glow-yellow">VS</span>
        <span className="max-w-72 truncate font-arcade text-sm text-glow-magenta sm:text-base">
          {ticket.identifier}: {shortTitle(ticket.title)}
        </span>
        {room.roundEndsAt !== undefined && phase === "voting" && (
          <CountdownClock endsAt={room.roundEndsAt} />
        )}
      </div>

      {/* ── Arena: voting deck vs boss ─────────────────────────────────── */}
      <div className="relative grid gap-4 md:grid-cols-[1.15fr_auto_1.25fr]">
        {/* Voting side: the cabinet controls live where the roster was */}
        <ControllerDeck
          room={room}
          votes={votes}
          me={me}
          sessionId={sessionId}
          readyCount={readyIds.size}
          squadCount={onlinePlayers.length}
        />

        {/* VS bolt */}
        <div className="hidden items-center justify-center md:flex">
          <Zap
            size={44}
            className={cn("text-neon-yellow", phase === "victory" && "animate-pulse-urgent")}
            fill="currentColor"
            aria-hidden
          />
        </div>

        {/* Boss side */}
        <Panel
          tone="magenta"
          title={
            <span className="flex items-center gap-2">
              <Skull size={12} aria-hidden /> BOSS · {ticket.identifier}
              {ticket.url && (
                <a
                  href={ticket.url}
                  target="_blank"
                  rel="noreferrer"
                  className="ml-auto text-neon-cyan hover:text-glow-cyan"
                  aria-label="Open in Linear"
                >
                  <ExternalLink size={12} />
                </a>
              )}
            </span>
          }
          className={cn(phase === "victory" && "animate-boss-hit")}
        >
          <div className="flex flex-col gap-3">
            <h3 className="font-arcade text-xs leading-relaxed text-neon-magenta">
              {ticket.title.toUpperCase()}
            </h3>
            <div>
              <p className="mb-1 font-arcade text-[8px] text-slate-500">ISSUE DESC</p>
              <div className="max-h-44 overflow-y-auto whitespace-pre-wrap border-2 border-abyss-600 bg-abyss-950/70 p-3 text-xs leading-relaxed text-slate-300">
                {ticket.description || "No intel available. It hides its power level."}
              </div>
            </div>
            {/* Live crowd meters: averages move as votes land, picks stay blind */}
            <div className="flex flex-col gap-2 border-2 border-abyss-600 bg-abyss-950/60 p-3">
              <SliderMeter
                label="COMPLEXITY AVG"
                value={votes?.averages.complexity ?? null}
                glow="#ff2ec4"
                labelClass="text-neon-magenta"
              />
              <SliderMeter
                label="UNCERTAINTY AVG"
                value={votes?.averages.uncertainty ?? null}
                glow="#22f7ff"
                labelClass="text-neon-cyan"
              />
            </div>
            <div className="grid grid-cols-3 gap-2 font-arcade text-[8px]">
              <div className="border border-abyss-600 bg-abyss-900/70 p-2">
                <p className="text-slate-500">CURRENT EST</p>
                <p className="mt-1 text-neon-red">
                  {ticket.currentEstimate !== undefined ? `${ticket.currentEstimate} PTS` : "NONE"}
                </p>
              </div>
              <div className="border border-abyss-600 bg-abyss-900/70 p-2">
                <p className="text-slate-500">TYPE</p>
                <p className="mt-1 break-words text-neon-cyan">
                  {ticket.labels.length > 0 ? ticket.labels.join(" · ").toUpperCase() : "UNKNOWN"}
                </p>
              </div>
              <div className="border border-abyss-600 bg-abyss-900/70 p-2">
                <p className="text-slate-500">BIDS</p>
                <p className="mt-1 text-neon-yellow">💰 {votes?.bidCount ?? 0}</p>
              </div>
            </div>
          </div>
        </Panel>

        {/* Victory overlay: laser volley + DEFEATED stamp */}
        {phase === "victory" && (
          <>
            <svg
              className="pointer-events-none absolute inset-0 z-30 h-full w-full"
              viewBox="0 0 100 100"
              preserveAspectRatio="none"
              aria-hidden
            >
              {squad.map((player, index) => (
                <line
                  key={player._id}
                  x1={6 + (index * 36) / Math.max(squad.length - 1, 1)}
                  y1={92}
                  x2={76}
                  y2={26}
                  stroke={index % 2 === 0 ? "#ff2ec4" : "#22f7ff"}
                  strokeWidth={1.1}
                  className="laser-line"
                  style={{ animationDelay: `${index * 0.13}s`, color: index % 2 === 0 ? "#ff2ec4" : "#22f7ff" }}
                />
              ))}
            </svg>
            <div className="pointer-events-none absolute inset-0 z-40 flex items-center justify-center">
              <div
                className="animate-stamp-in border-8 border-neon-red bg-abyss-950/85 px-8 py-5 font-arcade text-3xl text-glow-red sm:text-5xl"
                style={{ animationDelay: "1.5s", opacity: 0 }}
              >
                DEFEATED!
              </div>
            </div>
          </>
        )}
      </div>

      {/* ── Round status strip / results ───────────────────────────────── */}
      {phase === "voting" && (
        <Panel tone="dim">
          <div className="flex flex-wrap items-center justify-center gap-4">
            <p className="font-mono text-xs text-slate-300">
              Size up the boss: <span className="text-neon-magenta">COMPLEXITY</span> +{" "}
              <span className="text-neon-cyan">UNCERTAINTY</span>, 1–3 each. Votes stay masked
              until the reveal.
            </p>
            {me.isHost && (
              <ArcadeButton tone="yellow" onClick={handleReveal}>
                <span className="flex items-center gap-2">
                  <Eye size={14} aria-hidden /> REVEAL VOTES
                </span>
              </ArcadeButton>
            )}
          </div>
        </Panel>
      )}

      {(phase === "revealed" || phase === "victory") && (
        <RevealPanel
          room={room}
          ticket={ticket}
          players={players}
          votes={votes}
          me={me}
          sessionId={sessionId}
          syncBusy={syncBusy}
          onDefeat={handleDefeat}
          phase={phase}
        />
      )}
    </div>
  );
}

function shortTitle(title: string): string {
  return title.length > 34 ? `${title.slice(0, 32)}…` : title;
}

/* ── Reveal panel: the vote board + consensus + Smart Agent ───────────── */

interface RevealPanelProps {
  room: RoomState;
  ticket: TicketRow;
  players: PlayerRow[];
  votes: VotesState | undefined;
  me: MeState;
  sessionId: string;
  syncBusy: boolean;
  onDefeat: () => void;
  phase: "revealed" | "victory";
}

function RevealPanel({
  room,
  ticket,
  players,
  votes,
  me,
  sessionId,
  syncBusy,
  onDefeat,
  phase,
}: RevealPanelProps) {
  const toast = useToast();
  const startRound = useMutation(api.rooms.startRound);
  const playerById = new Map(players.map((player) => [player._id as string, player]));
  const board = (votes?.votes ?? []).filter((vote) => vote.ready);

  return (
    <div className="grid gap-4 lg:grid-cols-[1.2fr_1fr] animate-slide-up">
      <Panel tone="yellow" title="VOTE BOARD">
        {ticket.unanimous && (
          <p className="animate-hue mb-3 text-center font-arcade text-xl text-glow-green">
            ★ PERFECT! UNANIMOUS! ★
          </p>
        )}
        <div className="flex flex-col gap-2">
          {board.map((vote) => {
            const player = playerById.get(vote.playerId);
            return (
              <div
                key={vote.playerId}
                className="flex items-center gap-3 border-2 border-abyss-600 bg-abyss-900/60 px-3 py-2"
              >
                <PixelAvatar seed={player?.avatarSeed ?? 7} size={26} />
                <span className="min-w-0 flex-1 truncate text-xs text-slate-200">
                  {player?.name ?? "???"}
                  {vote.bid && (
                    <span className="ml-1.5" title="Bid to take this work" aria-label="Bid to take this work">
                      💰
                    </span>
                  )}
                </span>
                <span className="border-2 border-neon-magenta px-2.5 py-1 font-arcade text-sm text-neon-magenta shadow-neon-magenta">
                  {vote.complexity}
                </span>
                <span className="border-2 border-neon-cyan px-2.5 py-1 font-arcade text-sm text-neon-cyan shadow-neon-cyan">
                  {vote.uncertainty}
                </span>
              </div>
            );
          })}
          {board.length === 0 && (
            <p className="py-3 text-center text-xs text-slate-500">
              Nobody locked in a full vote. The boss smirks.
            </p>
          )}
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-center gap-3 border-t-2 border-abyss-600 pt-4">
          <div className="text-center">
            <p className="font-arcade text-[8px] text-slate-500">CONSENSUS</p>
            <p className="mt-1 font-mono text-xs text-slate-300">
              CMPLX <span className="text-neon-magenta">{ticket.finalComplexity ?? "—"}</span> ·
              UNCRT <span className="text-neon-cyan">{ticket.finalUncertainty ?? "—"}</span>
            </p>
          </div>
          <div className="border-4 border-neon-yellow bg-abyss-900 px-5 py-2 text-center shadow-neon-yellow">
            <p className="font-arcade text-[8px] text-slate-400">FINAL SCORE</p>
            <p className="font-arcade text-2xl text-glow-yellow">
              {ticket.finalPoints ?? "—"} PTS
            </p>
          </div>
          {me.isHost && phase === "revealed" && (
            <div className="flex flex-col gap-2">
              <ArcadeButton tone="green" big disabled={syncBusy} onClick={onDefeat}>
                <span className="flex items-center gap-2">
                  <Rocket size={14} aria-hidden />
                  {syncBusy ? "FIRING…" : "SYNC & ADVANCE ▶"}
                </span>
              </ArcadeButton>
              <ArcadeButton
                tone="dim"
                onClick={() =>
                  startRound({ roomId: room._id, sessionId, ticketId: ticket._id }).catch(
                    (error) => toast.error(error),
                  )
                }
              >
                <span className="flex items-center gap-2">
                  <Swords size={12} aria-hidden /> RE-FIGHT (REVOTE)
                </span>
              </ArcadeButton>
            </div>
          )}
        </div>
      </Panel>

      {ticket.pairingSummary ? (
        <Panel tone="green" title={
          <span className="flex items-center gap-2">
            <Bot size={12} aria-hidden /> SMART AGENT INTEL
          </span>
        }>
          <Markdown source={ticket.pairingSummary} />
        </Panel>
      ) : (
        <Panel tone="dim" title="SMART AGENT INTEL">
          <p className="py-6 text-center text-xs leading-relaxed text-slate-500">
            The Smart Agent only wakes for max-danger bosses — a consensus of 3 in Complexity or
            Uncertainty triggers a Navigator / Implementor pairing recommendation.
          </p>
        </Panel>
      )}
    </div>
  );
}
