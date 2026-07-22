import { useMutation, useQuery } from "convex/react";
import { Check, Copy, Crown, Users, Volume2, VolumeX } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "../../convex/_generated/api";
import { ControllerDeck } from "../components/ControllerDeck";
import { GameOverPanel } from "../components/GameOverPanel";
import { HostDock } from "../components/HostDock";
import { Lobby } from "../components/Lobby";
import { MusicPicker } from "../components/MusicPicker";
import { VsArena } from "../components/VsArena";
import { ArcadeButton, Blink, Panel } from "../components/ui";
import { audio } from "../lib/audio";
import { useAudioControls } from "../lib/audio-context";
import { cn } from "../lib/cn";
import { getSessionId } from "../lib/session";
import { useToast } from "../lib/toast";
import { isOnline } from "../lib/types";

export function RoomScreen() {
  const { code = "" } = useParams();
  const sessionId = useMemo(getSessionId, []);
  const toast = useToast();
  const { muted, toggleMuted } = useAudioControls();

  const room = useQuery(api.rooms.get, { code });
  const me = useQuery(api.players.me, { code, sessionId });
  const roomId = room?._id;
  const players = useQuery(api.players.byRoom, roomId ? { roomId } : "skip");
  const tickets = useQuery(api.tickets.byRoom, roomId ? { roomId } : "skip");
  const votes = useQuery(api.votes.forActive, roomId ? { roomId, sessionId } : "skip");
  const heartbeat = useMutation(api.players.heartbeat);

  const [now, setNow] = useState(() => Date.now());
  const [copied, setCopied] = useState(false);
  const [dockOpen, setDockOpen] = useState(false);

  const activeTicket = tickets?.find((ticket) => ticket._id === room?.activeTicketId);
  const onlineCount = players?.filter((player) => isOnline(player, now)).length ?? 0;

  /* Presence clock for online dots. */
  useEffect(() => {
    const interval = window.setInterval(() => setNow(Date.now()), 5000);
    return () => window.clearInterval(interval);
  }, []);

  /* Heartbeat every 10s + when the tab regains focus. */
  useEffect(() => {
    if (!me || !roomId) return;
    const send = () => void heartbeat({ roomId, sessionId }).catch(() => {});
    send();
    const interval = window.setInterval(send, 10_000);
    const onVisibility = () => {
      if (!document.hidden) send();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [me, roomId, sessionId, heartbeat]);

  /* Coin drop when the roster grows. */
  const prevPlayerCount = useRef<number | null>(null);
  useEffect(() => {
    const count = players?.length;
    if (count === undefined) return;
    if (prevPlayerCount.current !== null && count > prevPlayerCount.current) audio.coin();
    prevPlayerCount.current = count;
  }, [players?.length]);

  /* Status-transition soundtrack. */
  const prevStatus = useRef<string | null>(null);
  useEffect(() => {
    const status = room?.status;
    if (!status) return;
    const previous = prevStatus.current;
    prevStatus.current = status;
    if (previous === null || previous === status) return;
    if (status === "voting") audio.powerup();
    else if (status === "revealed") {
      if (activeTicket?.unanimous) audio.perfect();
      else audio.reveal();
    } else if (status === "victory") audio.victorySequence(Math.max(onlineCount, 1));
    else if (status === "complete") audio.fanfare();
  }, [room?.status, activeTicket?.unanimous, onlineCount]);

  const copyCode = async () => {
    try {
      await navigator.clipboard.writeText(room?.code ?? code);
      setCopied(true);
      toast.push("info", "ROOM CODE COPIED — RECRUIT YOUR PARTY");
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.push("error", "CLIPBOARD BLOCKED — COPY IT MANUALLY");
    }
  };

  /* ── Loading / error states ─────────────────────────────────────────── */

  if (room === undefined || me === undefined) {
    return (
      <main className="relative z-10 flex min-h-screen items-center justify-center">
        <p className="font-arcade text-sm text-neon-cyan">
          <Blink>▮▮▮</Blink> BOOTING CABINET…
        </p>
      </main>
    );
  }

  if (room === null) {
    return (
      <main className="relative z-10 flex min-h-screen items-center justify-center px-4">
        <Panel tone="red" title="GAME OVER" className="max-w-md">
          <p className="mb-4 text-sm leading-relaxed text-slate-300">
            No cabinet answers to code <span className="font-arcade text-neon-red">{code}</span>.
            It may have been unplugged, or the code was mistyped.
          </p>
          <Link to="/">
            <ArcadeButton tone="cyan">◀ BACK TO ATTRACT MODE</ArcadeButton>
          </Link>
        </Panel>
      </main>
    );
  }

  if (me === null) {
    return <JoinGate code={room.code} roomName={room.name} />;
  }

  const inBattle =
    room.status === "voting" || room.status === "revealed" || room.status === "victory";

  return (
    <div
      className={cn(
        "transition-[padding] duration-300",
        me.isHost && dockOpen && "lg:pr-[460px]",
      )}
    >
      <div className="relative z-10 mx-auto flex min-h-screen w-full max-w-6xl flex-col gap-4 px-3 py-4 sm:px-6">
      {/* ── Marquee header ─────────────────────────────────────────────── */}
      <header className="panel-chrome pixel-frame-dim flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
        <Link to="/" className="font-arcade text-xs text-glow-magenta">
          BITPOINT
        </Link>
        <span className="hidden font-mono text-xs text-slate-400 sm:inline">
          {room.name.toUpperCase()}
        </span>
        <span className="font-arcade text-[9px] text-slate-500">
          ROUND {room.roundCount || "—"}
        </span>
        <div className="ml-auto flex items-center gap-2">
          <span className="flex items-center gap-1.5 font-mono text-xs text-slate-300">
            <Users size={14} className="text-neon-green" aria-hidden />
            {onlineCount}/{players?.length ?? 0}
          </span>
          {me.isHost && (
            <span className="flex items-center gap-1 border border-neon-yellow/60 px-2 py-0.5 font-arcade text-[8px] text-neon-yellow">
              <Crown size={10} aria-hidden /> HOST
            </span>
          )}
          <button
            onClick={copyCode}
            className="flex items-center gap-2 border-2 border-neon-cyan/70 bg-abyss-900/70 px-3 py-1.5 font-arcade text-xs text-neon-cyan hover:shadow-neon-cyan"
            aria-label="Copy room code"
          >
            {room.code}
            {copied ? <Check size={12} aria-hidden /> : <Copy size={12} aria-hidden />}
          </button>
          <MusicPicker compact />
          <button
            onClick={toggleMuted}
            aria-label={muted ? "Unmute audio" : "Mute audio"}
            className="border-2 border-abyss-500 bg-abyss-900/70 p-1.5 text-slate-300 hover:border-neon-cyan hover:text-neon-cyan"
          >
            {muted ? <VolumeX size={16} /> : <Volume2 size={16} />}
          </button>
        </div>
      </header>

      {/* ── Stage ──────────────────────────────────────────────────────── */}
      <main className="flex flex-1 flex-col gap-4">
        {room.status === "lobby" && (
          <Lobby
            room={room}
            players={players ?? []}
            tickets={tickets ?? []}
            me={me}
            now={now}
            sessionId={sessionId}
          />
        )}
        {inBattle && activeTicket && (
          <VsArena
            room={room}
            players={players ?? []}
            ticket={activeTicket}
            votes={votes}
            me={me}
            now={now}
            sessionId={sessionId}
          />
        )}
        {inBattle && !activeTicket && (
          <p className="mt-10 text-center font-arcade text-xs text-neon-yellow">
            <Blink>LOADING NEXT LEVEL…</Blink>
          </p>
        )}
        {room.status === "complete" && (
          <GameOverPanel room={room} tickets={tickets ?? []} me={me} sessionId={sessionId} />
        )}
      </main>

        {/* ── The cabinet deck ─────────────────────────────────────────── */}
        {inBattle && (
          <ControllerDeck room={room} votes={votes} me={me} sessionId={sessionId} />
        )}

      </div>

      {me.isHost && (
        <HostDock
          room={room}
          players={players ?? []}
          tickets={tickets ?? []}
          now={now}
          sessionId={sessionId}
          open={dockOpen}
          onOpenChange={setDockOpen}
        />
      )}
    </div>
  );
}

/* ── Join gate for players arriving via a shared link ─────────────────── */

function JoinGate({ code, roomName }: { code: string; roomName: string }) {
  const sessionId = useMemo(getSessionId, []);
  const joinRoom = useMutation(api.rooms.join);
  const toast = useToast();
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!name.trim() || busy) return;
    setBusy(true);
    try {
      await joinRoom({ code, name, sessionId });
      // players.me flips from null automatically via the live query.
    } catch (error) {
      toast.error(error);
      setBusy(false);
    }
  };

  return (
    <main className="relative z-10 flex min-h-screen items-center justify-center px-4">
      <Panel tone="cyan" title={`JOINING · ${roomName.toUpperCase()}`} className="w-full max-w-md">
        <form onSubmit={submit} className="flex flex-col gap-3">
          <p className="font-arcade text-[10px] leading-relaxed text-neon-yellow">
            CABINET {code} FOUND. ENTER YOUR HANDLE, CHALLENGER.
          </p>
          <input
            className="w-full border-2 border-abyss-500 bg-abyss-950/80 px-3 py-2.5 font-mono text-sm text-slate-100 placeholder:text-slate-500 focus:border-neon-cyan focus:outline-none"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="grace"
            maxLength={20}
            autoFocus
            required
          />
          <ArcadeButton type="submit" tone="cyan" big disabled={busy || !name.trim()}>
            INSERT COIN ▶
          </ArcadeButton>
        </form>
      </Panel>
    </main>
  );
}
