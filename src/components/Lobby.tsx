import { useAction, useMutation } from "convex/react";
import { Crown, Gamepad2, Link2, Play, Rocket, Wifi, WifiOff } from "lucide-react";
import { useState } from "react";
import { api } from "../../convex/_generated/api";
import { audio } from "../lib/audio";
import { useToast } from "../lib/toast";
import { isOnline, type MeState, type PlayerRow, type RoomState, type TicketRow } from "../lib/types";
import { PixelAvatar } from "./PixelAvatar";
import { ArcadeButton, Blink, Panel } from "./ui";

interface LobbyProps {
  room: RoomState;
  players: PlayerRow[];
  tickets: TicketRow[];
  me: MeState;
  now: number;
  sessionId: string;
}

/** Pre-game staging area: roster, room code billboard, host quick-start. */
export function Lobby({ room, players, tickets, me, now, sessionId }: LobbyProps) {
  const toast = useToast();
  const loadDemo = useMutation(api.tickets.loadDemo);
  const startRound = useMutation(api.rooms.startRound);
  const getAuthUrl = useAction(api.linear.authUrl);
  const [busy, setBusy] = useState(false);

  const queued = tickets.filter((ticket) => ticket.status === "queued");
  const defeated = tickets.filter((ticket) => ticket.status === "defeated");

  const connectLinear = async () => {
    setBusy(true);
    try {
      const url = await getAuthUrl({ roomId: room._id, sessionId });
      window.location.href = url;
    } catch (error) {
      toast.error(error);
      setBusy(false);
    }
  };

  const handleLoadDemo = async () => {
    setBusy(true);
    try {
      const { inserted } = await loadDemo({ roomId: room._id, sessionId });
      toast.push(
        inserted > 0 ? "success" : "info",
        inserted > 0 ? `${inserted} DEMO BOSSES QUEUED` : "DEMO ALREADY LOADED",
      );
    } catch (error) {
      toast.error(error);
    } finally {
      setBusy(false);
    }
  };

  const handleStart = async () => {
    setBusy(true);
    try {
      await startRound({ roomId: room._id, sessionId });
      audio.powerup();
    } catch (error) {
      toast.error(error);
      setBusy(false);
    }
  };

  return (
    <div className="grid gap-4 lg:grid-cols-[1.3fr_1fr]">
      <Panel tone="cyan" title={`PLAYER ROSTER · ${players.length}/16`}>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {players.map((player) => {
            const online = isOnline(player, now);
            return (
              <div
                key={player._id}
                className="flex items-center gap-3 border-2 border-abyss-600 bg-abyss-900/60 p-2.5"
              >
                <div className="animate-float">
                  <PixelAvatar seed={player.avatarSeed} size={36} />
                </div>
                <div className="min-w-0">
                  <p className="truncate font-arcade text-[9px] text-slate-200">
                    {player.name.toUpperCase()}
                    {player.isHost && (
                      <Crown size={10} className="ml-1 inline text-neon-yellow" aria-label="Host" />
                    )}
                  </p>
                  <p className="mt-1 flex items-center gap-1 text-[10px] text-slate-500">
                    {online ? (
                      <>
                        <Wifi size={10} className="text-neon-green" aria-hidden /> ONLINE
                      </>
                    ) : (
                      <>
                        <WifiOff size={10} className="text-neon-red" aria-hidden /> AFK
                      </>
                    )}
                  </p>
                </div>
              </div>
            );
          })}
          {players.length < 6 &&
            Array.from({ length: 6 - players.length }).map((_, index) => (
              <div
                key={`slot-${index}`}
                className="flex items-center justify-center border-2 border-dashed border-abyss-600 p-2.5 font-arcade text-[8px] text-slate-600"
              >
                SLOT OPEN
              </div>
            ))}
        </div>
        <p className="mt-4 text-center font-mono text-xs text-slate-400">
          Recruit with code{" "}
          <span className="font-arcade text-sm tracking-[0.3em] text-glow-cyan">{room.code}</span>{" "}
          — or share this page's URL.
        </p>
      </Panel>

      {me.isHost ? (
        <Panel tone="magenta" title="HOST COMMAND STATION">
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between border-2 border-abyss-600 bg-abyss-900/60 px-3 py-2 text-xs">
              <span className="text-slate-400">MISSIONS QUEUED</span>
              <span className="font-arcade text-neon-yellow">{queued.length}</span>
            </div>
            {defeated.length > 0 && (
              <div className="flex items-center justify-between border-2 border-abyss-600 bg-abyss-900/60 px-3 py-2 text-xs">
                <span className="text-slate-400">BOSSES DEFEATED</span>
                <span className="font-arcade text-neon-green">{defeated.length}</span>
              </div>
            )}

            {room.linear.connected ? (
              <p className="border-2 border-neon-green/50 bg-abyss-900/60 px-3 py-2 text-xs text-neon-green">
                ⚡ LINEAR LINKED · {room.linear.workspaceName?.toUpperCase() ?? "WORKSPACE"}
                {room.linear.teamName ? ` · ${room.linear.teamName.toUpperCase()}` : " · PICK A TEAM IN THE HOST CONSOLE"}
              </p>
            ) : (
              <>
                <ArcadeButton tone="cyan" disabled={busy} onClick={connectLinear}>
                  <span className="flex items-center justify-center gap-2">
                    <Link2 size={14} aria-hidden /> CONNECT LINEAR (OAUTH)
                  </span>
                </ArcadeButton>
                <p className="text-[11px] leading-relaxed text-slate-500">
                  No OAuth app? Paste a personal API key in{" "}
                  <span className="text-neon-magenta">HOST CONSOLE → LINEAR</span> instead.
                </p>
              </>
            )}

            <ArcadeButton tone="yellow" disabled={busy} onClick={handleLoadDemo}>
              <span className="flex items-center justify-center gap-2">
                <Gamepad2 size={14} aria-hidden /> LOAD DEMO QUEST
              </span>
            </ArcadeButton>

            <ArcadeButton
              tone="green"
              big
              disabled={busy || queued.length === 0}
              onClick={handleStart}
            >
              <span className="flex items-center justify-center gap-2">
                <Play size={16} aria-hidden /> START GAME
              </span>
            </ArcadeButton>

            <p className="text-[11px] leading-relaxed text-slate-400">
              <Rocket size={12} className="mr-1 inline text-neon-magenta" aria-hidden />
              Backlog import, round timers and the skills matrix live in the{" "}
              <span className="text-neon-magenta">HOST CONSOLE</span> (bottom right).
            </p>
          </div>
        </Panel>
      ) : (
        <Panel tone="yellow" title="STANDBY">
          <div className="flex h-full min-h-40 flex-col items-center justify-center gap-4 text-center">
            <p className="font-arcade text-[10px] leading-loose text-neon-yellow">
              <Blink>WAITING FOR HOST TO START THE GAME…</Blink>
            </p>
            <p className="max-w-64 text-xs leading-relaxed text-slate-400">
              Stretch your clicking finger. Bosses incoming. Vote 1–3 on Complexity and
              Uncertainty — the team's consensus becomes the story points.
            </p>
          </div>
        </Panel>
      )}
    </div>
  );
}
