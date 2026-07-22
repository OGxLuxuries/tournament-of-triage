import { useAction, useMutation, useQuery } from "convex/react";
import {
  Database,
  Download,
  KeyRound,
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
import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { audio } from "../lib/audio";
import { cn } from "../lib/cn";
import { parseSkillsCsv, type SkillRow } from "../lib/csv";
import { useToast } from "../lib/toast";
import { isOnline, type PlayerRow, type RoomState, type TicketRow } from "../lib/types";
import { ArcadeButton } from "./ui";

type Tab = "missions" | "timer" | "skills" | "linear";

interface HostDockProps {
  room: RoomState;
  players: PlayerRow[];
  tickets: TicketRow[];
  now: number;
  sessionId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * The HOST CONSOLE: a full-height panel docked to the right edge. It slides
 * in over a translate transition and (on lg+ screens) the page content
 * shifts left so the arena stays fully visible. State lives in RoomScreen
 * so the layout can react; the panel stays mounted to preserve scan results.
 */
export function HostDock({
  room,
  players,
  tickets,
  now,
  sessionId,
  open,
  onOpenChange,
}: HostDockProps) {
  const [tab, setTab] = useState<Tab>("missions");

  const tabs: Array<{ id: Tab; label: string; icon: typeof Settings2 }> = [
    { id: "missions", label: "MISSIONS", icon: ListOrdered },
    { id: "timer", label: "TIMER", icon: Timer },
    { id: "skills", label: "DATA", icon: Database },
    { id: "linear", label: "LINEAR", icon: Link2 },
  ];

  return (
    <>
      {!open && (
        <button
          onClick={() => {
            audio.click();
            onOpenChange(true);
          }}
          className="fixed bottom-4 right-4 z-40 flex items-center gap-2 border-2 border-neon-magenta bg-abyss-900/95 px-4 py-3 font-arcade text-[10px] text-neon-magenta shadow-neon-magenta hover:animate-flicker"
        >
          <Settings2 size={14} aria-hidden /> HOST CONSOLE
        </button>
      )}

      <aside
        aria-label="Host console"
        aria-hidden={!open}
        className={cn(
          "fixed inset-y-0 right-0 z-40 flex w-[min(94vw,460px)] flex-col",
          "border-l-[3px] border-neon-magenta bg-abyss-900/95 backdrop-blur",
          "shadow-[-14px_0_44px_rgba(255,46,196,0.22)] transition-transform duration-300",
          open ? "translate-x-0" : "pointer-events-none translate-x-full",
        )}
      >
        <header className="flex items-center gap-2 border-b-2 border-abyss-600 px-4 py-3">
          <Settings2 size={14} className="text-neon-magenta" aria-hidden />
          <span className="font-arcade text-[10px] tracking-widest text-neon-magenta">
            HOST CONSOLE
          </span>
          <button
            onClick={() => {
              audio.click();
              onOpenChange(false);
            }}
            aria-label="Close host console"
            className="ml-auto border-2 border-abyss-500 p-1.5 text-slate-400 hover:border-neon-red hover:text-neon-red"
          >
            <X size={12} />
          </button>
        </header>

        <nav className="flex gap-1 border-b-2 border-abyss-600 px-3 py-2" aria-label="Console tabs">
          {tabs.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => {
                audio.click();
                setTab(id);
              }}
              aria-pressed={tab === id}
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
        </nav>

        <div className="flex-1 overflow-y-auto p-3">
          {tab === "missions" && (
            <MissionsTab room={room} tickets={tickets} sessionId={sessionId} />
          )}
          {tab === "timer" && <TimerTab room={room} sessionId={sessionId} />}
          {tab === "skills" && (
            <SkillsTab room={room} players={players} now={now} sessionId={sessionId} />
          )}
          {tab === "linear" && <LinearTab room={room} sessionId={sessionId} />}
        </div>
      </aside>
    </>
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
  const removeTicket = useMutation(api.tickets.remove);
  const startRound = useMutation(api.rooms.startRound);

  const jumpTo = (ticketId: Id<"tickets">) =>
    startRound({ roomId: room._id, sessionId, ticketId }).catch((error) => toast.error(error));

  const bench = (ticketId: Id<"tickets">) =>
    removeTicket({ roomId: room._id, sessionId, ticketId }).catch((error) => toast.error(error));

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
            <>
              <button
                onClick={() => jumpTo(ticket._id)}
                className="border border-neon-magenta/60 px-1.5 py-0.5 font-arcade text-[7px] text-neon-magenta hover:shadow-neon-magenta"
              >
                <Swords size={9} className="mr-0.5 inline" aria-hidden />
                FIGHT
              </button>
              {ticket.status === "queued" && (
                <button
                  onClick={() => bench(ticket._id)}
                  aria-label={`Remove ${ticket.identifier} from the queue`}
                  title="Remove from queue"
                  className="border border-abyss-500 px-1.5 py-0.5 font-arcade text-[7px] text-slate-400 hover:border-neon-red hover:text-neon-red"
                >
                  ✕
                </button>
              )}
            </>
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
        Schema: <span className="text-neon-cyan">Username, Skills, Confidence (1–5)</span>.
        Export your Google Sheet as CSV. Usernames must match player handles for the Smart Agent
        to target them. <a href="/sample-skills.csv" download className="text-neon-magenta underline">
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
            placeholder={"Username,Skills,Confidence\nada,\"postgres, sql\",5"}
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

interface LinearTeamOption {
  id: string;
  key: string;
  name: string;
}

interface TriagePreviewItem {
  id: string;
  identifier: string;
  title: string;
  priority: number;
  teamId: string;
  teamKey: string;
  teamName: string;
}

function LinearTab({ room, sessionId }: { room: RoomState; sessionId: string }) {
  const toast = useToast();
  const connectWithKey = useAction(api.linear.connectApiKey);
  const fetchTeams = useAction(api.linear.teams);
  const previewTriage = useAction(api.linear.previewTriage);
  const importSelected = useAction(api.linear.importSelected);
  const disconnect = useMutation(api.linear.disconnect);

  const [teams, setTeams] = useState<LinearTeamOption[] | null>(null);
  const [allTeams, setAllTeams] = useState(true);
  const [selectedTeamIds, setSelectedTeamIds] = useState<Set<string>>(new Set());
  const [preview, setPreview] = useState<TriagePreviewItem[] | null>(null);
  const [selectedIssueIds, setSelectedIssueIds] = useState<Set<string>>(new Set());
  const [apiKey, setApiKey] = useState("");
  const [busy, setBusy] = useState(false);
  const teamsRequested = useRef(false);

  /* Team list loads itself once the workspace is linked. */
  useEffect(() => {
    if (!room.linear.connected || teamsRequested.current) return;
    teamsRequested.current = true;
    fetchTeams({ roomId: room._id, sessionId })
      .then(setTeams)
      .catch((error) => toast.error(error));
  }, [room.linear.connected, room._id, sessionId, fetchTeams, toast]);

  const toggleTeam = (teamId: string) => {
    setAllTeams(false);
    setPreview(null);
    setSelectedTeamIds((current) => {
      const next = new Set(current);
      if (next.has(teamId)) next.delete(teamId);
      else next.add(teamId);
      return next;
    });
  };

  const scanTriage = async () => {
    setBusy(true);
    try {
      const issues = await previewTriage({
        roomId: room._id,
        sessionId,
        teamIds: allTeams ? undefined : [...selectedTeamIds],
      });
      setPreview(issues);
      setSelectedIssueIds(new Set(issues.map((issue) => issue.id)));
    } catch (error) {
      toast.error(error);
    } finally {
      setBusy(false);
    }
  };

  const toggleIssue = (issueId: string) => {
    setSelectedIssueIds((current) => {
      const next = new Set(current);
      if (next.has(issueId)) next.delete(issueId);
      else next.add(issueId);
      return next;
    });
  };

  const runImport = async () => {
    setBusy(true);
    try {
      const { inserted, skipped } = await importSelected({
        roomId: room._id,
        sessionId,
        issueIds: [...selectedIssueIds],
      });
      toast.push(
        "success",
        `${inserted} TRIAGE BOSS${inserted === 1 ? "" : "ES"} ENTERED THE TOURNAMENT` +
          (skipped > 0 ? ` · ${skipped} ALREADY QUEUED` : ""),
      );
      setPreview(null);
    } catch (error) {
      toast.error(error);
    } finally {
      setBusy(false);
    }
  };

  const submitKey = async () => {
    setBusy(true);
    try {
      const result = await connectWithKey({ roomId: room._id, sessionId, apiKey });
      setApiKey("");
      toast.push(
        "success",
        `LINEAR LINKED · ${(result.workspace ?? "WORKSPACE").toUpperCase()} AS ${(result.user ?? "?").toUpperCase()}`,
      );
    } catch (error) {
      toast.error(error);
    } finally {
      setBusy(false);
    }
  };

  if (!room.linear.connected) {
    return (
      <div className="flex flex-col gap-3">
        <p className="font-arcade text-[9px] text-neon-cyan">LINK LINEAR · API KEY</p>
        <p className="text-xs leading-relaxed text-slate-400">
          Link Linear to import triage issues as bosses and push estimates + the consensus board
          back to each ticket.
        </p>
        <p className="text-[11px] leading-relaxed text-slate-400">
          Any workspace member can mint a key: Linear →{" "}
          <span className="text-neon-cyan">Settings → Security &amp; access → API keys</span>. It's
          validated with Linear, stored server-side only, and never shown again.
        </p>
        <input
          type="password"
          value={apiKey}
          onChange={(event) => setApiKey(event.target.value)}
          placeholder="lin_api_…"
          autoComplete="off"
          className="w-full border-2 border-abyss-500 bg-abyss-950/80 px-3 py-2 font-mono text-xs text-slate-200 placeholder:text-slate-600 focus:border-neon-green focus:outline-none"
        />
        <ArcadeButton tone="green" disabled={busy || !apiKey.trim()} onClick={submitKey}>
          <span className="flex items-center justify-center gap-2">
            <KeyRound size={12} aria-hidden /> CONNECT WITH API KEY
          </span>
        </ArcadeButton>
      </div>
    );
  }

  const scanDisabled = busy || (!allTeams && selectedTeamIds.size === 0);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2 border-2 border-neon-green/50 bg-abyss-900/60 px-3 py-2 text-xs text-slate-300">
        <div className="min-w-0 flex-1">
          <p className="text-neon-green">⚡ CONNECTED</p>
          <p className="mt-1 truncate">
            {room.linear.workspaceName ?? "Workspace"} · as {room.linear.userName ?? "?"}
          </p>
        </div>
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

      <p className="text-[11px] leading-relaxed text-slate-400">
        Scope: <span className="text-neon-yellow">TRIAGE issues only</span> — in-progress work
        never enters the arena. Pick teams, scan, then choose exactly which issues fight.
      </p>

      {/* Team scope: all, one, or many */}
      <div className="flex flex-wrap gap-1.5">
        <button
          onClick={() => {
            setAllTeams(true);
            setSelectedTeamIds(new Set());
            setPreview(null);
          }}
          aria-pressed={allTeams}
          className={cn(
            "border-2 px-2.5 py-1.5 font-arcade text-[8px]",
            allTeams
              ? "border-neon-yellow text-neon-yellow shadow-neon-yellow"
              : "border-abyss-500 text-slate-400 hover:text-slate-200",
          )}
        >
          ALL TEAMS
        </button>
        {(teams ?? []).map((team) => (
          <button
            key={team.id}
            onClick={() => toggleTeam(team.id)}
            aria-pressed={!allTeams && selectedTeamIds.has(team.id)}
            title={team.name}
            className={cn(
              "border-2 px-2.5 py-1.5 font-arcade text-[8px]",
              !allTeams && selectedTeamIds.has(team.id)
                ? "border-neon-cyan text-neon-cyan shadow-neon-cyan"
                : "border-abyss-500 text-slate-400 hover:text-slate-200",
            )}
          >
            {team.key}
          </button>
        ))}
        {teams === null && (
          <span className="px-1 py-1.5 text-[10px] text-slate-500">loading teams…</span>
        )}
      </div>

      <ArcadeButton tone="cyan" disabled={scanDisabled} onClick={scanTriage}>
        {busy ? "SCANNING…" : "SCAN TRIAGE ISSUES"}
      </ArcadeButton>

      {preview !== null && preview.length === 0 && (
        <p className="border-2 border-abyss-600 bg-abyss-900/60 px-3 py-2 text-center text-[11px] text-slate-400">
          No triage issues in this scope. The queue is safe from you today.
        </p>
      )}

      {preview !== null && preview.length > 0 && (
        <div className="flex flex-col gap-2 border-2 border-neon-yellow/50 bg-abyss-900/50 p-2.5">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-arcade text-[9px] text-neon-yellow">
              {selectedIssueIds.size}/{preview.length} SELECTED
            </span>
            <button
              onClick={() => setSelectedIssueIds(new Set(preview.map((issue) => issue.id)))}
              className="border border-abyss-500 px-2 py-0.5 font-arcade text-[7px] text-slate-300 hover:border-neon-green hover:text-neon-green"
            >
              ALL
            </button>
            <button
              onClick={() => setSelectedIssueIds(new Set())}
              className="border border-abyss-500 px-2 py-0.5 font-arcade text-[7px] text-slate-300 hover:border-neon-red hover:text-neon-red"
            >
              NONE
            </button>
          </div>
          <div className="flex max-h-52 flex-col gap-1 overflow-y-auto">
            {preview.map((issue) => {
              const checked = selectedIssueIds.has(issue.id);
              return (
                <button
                  key={issue.id}
                  onClick={() => toggleIssue(issue.id)}
                  aria-pressed={checked}
                  className={cn(
                    "flex items-center gap-2 border px-2 py-1.5 text-left text-[11px]",
                    checked
                      ? "border-neon-green/70 bg-abyss-900 text-slate-200"
                      : "border-abyss-600 bg-abyss-900/40 text-slate-500",
                  )}
                >
                  <span className={cn("font-arcade text-[9px]", checked ? "text-neon-green" : "text-slate-600")}>
                    {checked ? "☑" : "☐"}
                  </span>
                  <span className="font-arcade text-[7px] text-neon-cyan">{issue.identifier}</span>
                  <span className="min-w-0 flex-1 truncate">{issue.title}</span>
                  <span className="font-arcade text-[7px] text-neon-magenta" title={issue.teamName}>
                    {issue.teamKey}
                  </span>
                </button>
              );
            })}
          </div>
          <ArcadeButton
            tone="green"
            disabled={busy || selectedIssueIds.size === 0}
            onClick={runImport}
          >
            TOURNAMENT {selectedIssueIds.size} ISSUE{selectedIssueIds.size === 1 ? "" : "S"} ▶
          </ArcadeButton>
        </div>
      )}
    </div>
  );
}
