import { useAction, useMutation, useQuery } from "convex/react";
import {
  Download,
  FileSpreadsheet,
  Link2,
  ListOrdered,
  Play,
  Settings2,
  Swords,
  Timer,
  Unplug,
  Upload,
  X,
} from "lucide-react";
import { useRef, useState, type ChangeEvent } from "react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { audio } from "../lib/audio";
import { cn } from "../lib/cn";
import { parseSkillsCsv, type SkillRow } from "../lib/csv";
import { useToast } from "../lib/toast";
import { isOnline, type PlayerRow, type RoomState, type TicketRow } from "../lib/types";
import { ArcadeButton, Panel } from "./ui";

type Tab = "missions" | "timer" | "skills" | "linear";

interface HostDockProps {
  room: RoomState;
  players: PlayerRow[];
  tickets: TicketRow[];
  now: number;
  sessionId: string;
}

/** Floating HOST CONSOLE drawer: queue, timers, skills matrix, Linear sync. */
export function HostDock({ room, players, tickets, now, sessionId }: HostDockProps) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<Tab>("missions");

  if (!open) {
    return (
      <button
        onClick={() => {
          audio.click();
          setOpen(true);
        }}
        className="fixed bottom-4 right-4 z-40 flex items-center gap-2 border-2 border-neon-magenta bg-abyss-900/95 px-4 py-3 font-arcade text-[10px] text-neon-magenta shadow-neon-magenta hover:animate-flicker"
      >
        <Settings2 size={14} aria-hidden /> HOST CONSOLE
      </button>
    );
  }

  const tabs: Array<{ id: Tab; label: string; icon: typeof Settings2 }> = [
    { id: "missions", label: "MISSIONS", icon: ListOrdered },
    { id: "timer", label: "TIMER", icon: Timer },
    { id: "skills", label: "SKILLS", icon: FileSpreadsheet },
    { id: "linear", label: "LINEAR", icon: Link2 },
  ];

  return (
    <div className="fixed inset-x-2 bottom-2 z-40 sm:inset-x-auto sm:right-4 sm:w-[440px]">
      <Panel tone="magenta" className="max-h-[75vh] overflow-y-auto">
        <div className="mb-3 flex items-center gap-1">
          {tabs.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => {
                audio.click();
                setTab(id);
              }}
              className={cn(
                "flex items-center gap-1.5 border-2 px-2.5 py-1.5 font-arcade text-[8px]",
                tab === id
                  ? "border-neon-magenta text-neon-magenta shadow-neon-magenta"
                  : "border-abyss-500 text-slate-400 hover:text-slate-200",
              )}
            >
              <Icon size={11} aria-hidden />
              {label}
            </button>
          ))}
          <button
            onClick={() => setOpen(false)}
            aria-label="Close host console"
            className="ml-auto border-2 border-abyss-500 p-1.5 text-slate-400 hover:border-neon-red hover:text-neon-red"
          >
            <X size={12} />
          </button>
        </div>

        {tab === "missions" && (
          <MissionsTab room={room} tickets={tickets} sessionId={sessionId} />
        )}
        {tab === "timer" && <TimerTab room={room} sessionId={sessionId} />}
        {tab === "skills" && (
          <SkillsTab room={room} players={players} now={now} sessionId={sessionId} />
        )}
        {tab === "linear" && <LinearTab room={room} sessionId={sessionId} />}
      </Panel>
    </div>
  );
}

/* ── MISSIONS ─────────────────────────────────────────────────────────── */

function MissionsTab({
  room,
  tickets,
  sessionId,
}: {
  room: RoomState;
  tickets: TicketRow[];
  sessionId: string;
}) {
  const toast = useToast();
  const loadDemo = useMutation(api.tickets.loadDemo);
  const startRound = useMutation(api.rooms.startRound);

  const jumpTo = (ticketId: Id<"tickets">) =>
    startRound({ roomId: room._id, sessionId, ticketId }).catch((error) => toast.error(error));

  return (
    <div className="flex flex-col gap-2">
      {tickets.length === 0 && (
        <p className="py-2 text-center text-xs text-slate-500">
          Queue is empty. Import a Linear backlog or load the demo quest.
        </p>
      )}
      {tickets.map((ticket) => (
        <div
          key={ticket._id}
          className={cn(
            "flex items-center gap-2 border-2 px-2.5 py-2 text-xs",
            ticket.status === "active"
              ? "border-neon-yellow bg-abyss-900"
              : "border-abyss-600 bg-abyss-900/50",
          )}
        >
          <span
            className={cn(
              "font-arcade text-[7px]",
              ticket.status === "defeated"
                ? "text-neon-green"
                : ticket.status === "active"
                  ? "text-neon-yellow"
                  : "text-slate-500",
            )}
          >
            {ticket.status === "defeated" ? "☠ DOWN" : ticket.status === "active" ? "▶ LIVE" : "… WAIT"}
          </span>
          <span className="font-arcade text-[8px] text-neon-cyan">{ticket.identifier}</span>
          <span className="min-w-0 flex-1 truncate text-slate-300">{ticket.title}</span>
          {ticket.status === "defeated" ? (
            <span className="font-arcade text-[9px] text-neon-yellow">
              {ticket.finalPoints ?? "—"}p
            </span>
          ) : (
            <button
              onClick={() => jumpTo(ticket._id)}
              className="border border-neon-magenta/60 px-1.5 py-0.5 font-arcade text-[7px] text-neon-magenta hover:shadow-neon-magenta"
            >
              <Swords size={9} className="mr-0.5 inline" aria-hidden />
              FIGHT
            </button>
          )}
        </div>
      ))}
      <ArcadeButton
        tone="yellow"
        onClick={() =>
          loadDemo({ roomId: room._id, sessionId })
            .then(({ inserted }) =>
              toast.push(inserted ? "success" : "info", inserted ? "DEMO QUEST LOADED" : "DEMO ALREADY LOADED"),
            )
            .catch((error) => toast.error(error))
        }
      >
        LOAD DEMO QUEST
      </ArcadeButton>
    </div>
  );
}

/* ── TIMER ────────────────────────────────────────────────────────────── */

const DURATIONS = [30, 60, 90, 120] as const;

function TimerTab({ room, sessionId }: { room: RoomState; sessionId: string }) {
  const toast = useToast();
  const startRound = useMutation(api.rooms.startRound);
  const armTimer = useMutation(api.rooms.armTimer);
  const clearTimer = useMutation(api.rooms.clearTimer);
  const [duration, setDuration] = useState<number | null>(60);

  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs leading-relaxed text-slate-400">
        Round clock. Under 10s the cabinet goes into red-alert; at zero votes auto-reveal.
      </p>
      <div className="flex flex-wrap gap-2">
        {DURATIONS.map((seconds) => (
          <button
            key={seconds}
            onClick={() => setDuration(seconds)}
            className={cn(
              "border-2 px-3 py-1.5 font-arcade text-[9px]",
              duration === seconds
                ? "border-neon-yellow text-neon-yellow shadow-neon-yellow"
                : "border-abyss-500 text-slate-400",
            )}
          >
            {seconds}s
          </button>
        ))}
        <button
          onClick={() => setDuration(null)}
          className={cn(
            "border-2 px-3 py-1.5 font-arcade text-[9px]",
            duration === null
              ? "border-neon-cyan text-neon-cyan shadow-neon-cyan"
              : "border-abyss-500 text-slate-400",
          )}
        >
          NO CLOCK
        </button>
      </div>
      <div className="flex flex-wrap gap-2">
        <ArcadeButton
          tone="green"
          onClick={() =>
            startRound({
              roomId: room._id,
              sessionId,
              durationSec: duration ?? undefined,
            }).catch((error) => toast.error(error))
          }
        >
          <span className="flex items-center gap-1.5">
            <Play size={12} aria-hidden />
            {room.status === "voting" ? "RESTART ROUND" : "START ROUND"}
          </span>
        </ArcadeButton>
        {room.status === "voting" && duration !== null && (
          <ArcadeButton
            tone="yellow"
            onClick={() =>
              armTimer({ roomId: room._id, sessionId, durationSec: duration }).catch((error) =>
                toast.error(error),
              )
            }
          >
            ARM {duration}s NOW
          </ArcadeButton>
        )}
        {room.status === "voting" && room.roundEndsAt !== undefined && (
          <ArcadeButton
            tone="dim"
            onClick={() =>
              clearTimer({ roomId: room._id, sessionId }).catch((error) => toast.error(error))
            }
          >
            DISARM CLOCK
          </ArcadeButton>
        )}
      </div>
    </div>
  );
}

/* ── SKILLS ───────────────────────────────────────────────────────────── */

function SkillsTab({
  room,
  players,
  now,
  sessionId,
}: {
  room: RoomState;
  players: PlayerRow[];
  now: number;
  sessionId: string;
}) {
  const toast = useToast();
  const upload = useMutation(api.skills.upload);
  const profiles = useQuery(api.skills.byRoom, { roomId: room._id });
  const fileInput = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState<SkillRow[] | null>(null);
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteText, setPasteText] = useState("");

  const onlineNames = new Set(
    players.filter((player) => isOnline(player, now)).map((player) => player.name.toLowerCase()),
  );

  const ingest = (text: string, source: string) => {
    const rows = parseSkillsCsv(text);
    if (rows.length === 0) {
      toast.push("error", `NO ROWS PARSED FROM ${source} — CHECK THE FORMAT`);
      return;
    }
    setPending(rows);
  };

  const onFile = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => ingest(String(reader.result ?? ""), file.name.toUpperCase());
    reader.readAsText(file);
    event.target.value = "";
  };

  const apply = () => {
    if (!pending) return;
    upload({ roomId: room._id, sessionId, rows: pending })
      .then(({ inserted }) => {
        toast.push("success", `${inserted} SKILL PROFILES LOADED INTO THE MATRIX`);
        setPending(null);
        setPasteText("");
        setPasteOpen(false);
      })
      .catch((error) => toast.error(error));
  };

  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs leading-relaxed text-slate-400">
        Schema: <span className="text-neon-cyan">Email/Username, Skills, Confidence (1–5)</span>.
        Export your Google Sheet as CSV. Handles must match player names for the Smart Agent to
        target them. <a href="/sample-skills.csv" download className="text-neon-magenta underline">
          <Download size={10} className="inline" aria-hidden /> sample.csv
        </a>
      </p>

      <div className="flex flex-wrap gap-2">
        <input ref={fileInput} type="file" accept=".csv,text/csv" hidden onChange={onFile} />
        <ArcadeButton tone="cyan" onClick={() => fileInput.current?.click()}>
          <span className="flex items-center gap-1.5">
            <Upload size={12} aria-hidden /> UPLOAD CSV
          </span>
        </ArcadeButton>
        <ArcadeButton tone="dim" onClick={() => setPasteOpen((current) => !current)}>
          PASTE CSV
        </ArcadeButton>
      </div>

      {pasteOpen && (
        <div className="flex flex-col gap-2">
          <textarea
            value={pasteText}
            onChange={(event) => setPasteText(event.target.value)}
            rows={5}
            placeholder={"Email,Username,Skills,Confidence\nada@team.dev,ada,\"postgres, sql\",5"}
            className="w-full border-2 border-abyss-500 bg-abyss-950/80 p-2 font-mono text-xs text-slate-200 focus:border-neon-cyan focus:outline-none"
          />
          <ArcadeButton tone="cyan" onClick={() => ingest(pasteText, "PASTE")}>
            PARSE
          </ArcadeButton>
        </div>
      )}

      {pending && (
        <div className="border-2 border-neon-yellow/60 bg-abyss-900/70 p-2.5">
          <p className="mb-2 font-arcade text-[8px] text-neon-yellow">
            PREVIEW: {pending.length} ROWS — REPLACES THE CURRENT MATRIX
          </p>
          <div className="flex flex-wrap gap-1.5">
            {pending.slice(0, 8).map((row, index) => (
              <span key={index} className="border border-abyss-500 px-1.5 py-0.5 text-[10px] text-slate-300">
                {row.username} · {row.skills.length} skills · c{row.confidence}
              </span>
            ))}
            {pending.length > 8 && (
              <span className="px-1.5 py-0.5 text-[10px] text-slate-500">+{pending.length - 8} more</span>
            )}
          </div>
          <div className="mt-2 flex gap-2">
            <ArcadeButton tone="green" onClick={apply}>
              APPLY MATRIX
            </ArcadeButton>
            <ArcadeButton tone="dim" onClick={() => setPending(null)}>
              CANCEL
            </ArcadeButton>
          </div>
        </div>
      )}

      <div className="flex flex-col gap-1.5">
        {(profiles ?? []).map((profile) => (
          <div
            key={profile._id}
            className="flex items-center gap-2 border border-abyss-600 bg-abyss-900/50 px-2 py-1.5 text-[11px]"
          >
            <span
              className={cn(
                "h-2 w-2 rounded-full",
                onlineNames.has(profile.username.toLowerCase())
                  ? "bg-neon-green shadow-neon-green"
                  : "bg-abyss-500",
              )}
              title={onlineNames.has(profile.username.toLowerCase()) ? "In the lobby" : "Not in the lobby"}
            />
            <span className="font-arcade text-[8px] text-slate-200">{profile.username}</span>
            <span className="min-w-0 flex-1 truncate text-slate-400">
              {profile.skills.join(", ") || "no skills listed"}
            </span>
            <span className="text-neon-yellow">{"★".repeat(profile.confidence)}</span>
          </div>
        ))}
        {(profiles ?? []).length === 0 && (
          <p className="py-2 text-center text-[11px] text-slate-500">Matrix empty — agent asleep.</p>
        )}
      </div>
    </div>
  );
}

/* ── LINEAR ───────────────────────────────────────────────────────────── */

function LinearTab({ room, sessionId }: { room: RoomState; sessionId: string }) {
  const toast = useToast();
  const getAuthUrl = useAction(api.linear.authUrl);
  const fetchTeams = useAction(api.linear.teams);
  const importBacklog = useAction(api.linear.importBacklog);
  const setTeam = useMutation(api.linear.setTeam);
  const disconnect = useMutation(api.linear.disconnect);

  const [teams, setTeams] = useState<Array<{ id: string; key: string; name: string }> | null>(null);
  const [busy, setBusy] = useState(false);

  const connect = async () => {
    setBusy(true);
    try {
      const url = await getAuthUrl({ roomId: room._id, sessionId });
      window.location.href = url;
    } catch (error) {
      toast.error(error);
      setBusy(false);
    }
  };

  const loadTeams = async () => {
    setBusy(true);
    try {
      setTeams(await fetchTeams({ roomId: room._id, sessionId }));
    } catch (error) {
      toast.error(error);
    } finally {
      setBusy(false);
    }
  };

  const runImport = async () => {
    setBusy(true);
    try {
      const { inserted } = await importBacklog({ roomId: room._id, sessionId });
      toast.push("success", `${inserted} BOSSES IMPORTED FROM LINEAR`);
    } catch (error) {
      toast.error(error);
    } finally {
      setBusy(false);
    }
  };

  if (!room.linear.connected) {
    return (
      <div className="flex flex-col gap-3">
        <p className="text-xs leading-relaxed text-slate-400">
          OAuth into Linear to pull the backlog and push estimates + the consensus board back to
          each ticket. Requires <span className="text-neon-cyan">LINEAR_CLIENT_ID</span> /{" "}
          <span className="text-neon-cyan">SECRET</span> on the Convex deployment (see README).
        </p>
        <ArcadeButton tone="cyan" big disabled={busy} onClick={connect}>
          <span className="flex items-center justify-center gap-2">
            <Link2 size={14} aria-hidden /> CONNECT LINEAR
          </span>
        </ArcadeButton>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="border-2 border-neon-green/50 bg-abyss-900/60 px-3 py-2 text-xs text-slate-300">
        <p className="text-neon-green">⚡ CONNECTED</p>
        <p className="mt-1">
          {room.linear.workspaceName ?? "Workspace"} · as {room.linear.userName ?? "?"}
        </p>
        <p className="mt-1 text-slate-400">
          TEAM: <span className="text-neon-cyan">{room.linear.teamName ?? "NOT SELECTED"}</span>
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        <ArcadeButton tone="dim" disabled={busy} onClick={loadTeams}>
          {teams ? "RELOAD TEAMS" : "CHOOSE TEAM"}
        </ArcadeButton>
        <ArcadeButton
          tone="green"
          disabled={busy || !room.linear.teamId}
          onClick={runImport}
        >
          IMPORT BACKLOG (25)
        </ArcadeButton>
        <ArcadeButton
          tone="red"
          disabled={busy}
          onClick={() =>
            disconnect({ roomId: room._id, sessionId })
              .then(() => toast.push("info", "LINEAR LINK SEVERED"))
              .catch((error) => toast.error(error))
          }
        >
          <span className="flex items-center gap-1.5">
            <Unplug size={12} aria-hidden /> UNLINK
          </span>
        </ArcadeButton>
      </div>

      {teams && (
        <div className="flex flex-col gap-1.5">
          {teams.map((team) => (
            <button
              key={team.id}
              onClick={() =>
                setTeam({ roomId: room._id, sessionId, teamId: team.id, teamName: team.name })
                  .then(() => toast.push("success", `TEAM SET: ${team.name.toUpperCase()}`))
                  .catch((error) => toast.error(error))
              }
              className={cn(
                "flex items-center gap-2 border-2 px-2.5 py-1.5 text-left text-xs",
                room.linear.connected && room.linear.teamId === team.id
                  ? "border-neon-cyan text-neon-cyan"
                  : "border-abyss-600 text-slate-300 hover:border-slate-400",
              )}
            >
              <span className="font-arcade text-[8px]">{team.key}</span>
              <span className="min-w-0 flex-1 truncate">{team.name}</span>
            </button>
          ))}
          {teams.length === 0 && (
            <p className="text-center text-[11px] text-slate-500">No teams visible to this token.</p>
          )}
        </div>
      )}
    </div>
  );
}
