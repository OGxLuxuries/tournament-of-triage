import { useMutation } from "convex/react";
import {
  Bot,
  Coins,
  Download,
  Gamepad2,
  KeyRound,
  ListChecks,
  LogIn,
  ShieldCheck,
  SlidersHorizontal,
  Swords,
  Timer,
  Volume2,
  VolumeX,
} from "lucide-react";
import { useMemo, useState, type FormEvent, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../../convex/_generated/api";
import { MusicPicker } from "../components/MusicPicker";
import { ArcadeButton, Blink, Panel } from "../components/ui";
import { useAudioControls } from "../lib/audio-context";
import { getSessionId } from "../lib/session";
import { useToast } from "../lib/toast";

/** Landing page: attract mode up top, the full how-to-play manual below. */
export function AttractScreen() {
  const navigate = useNavigate();
  const toast = useToast();
  const { muted, toggleMuted } = useAudioControls();
  const sessionId = useMemo(getSessionId, []);

  const createRoom = useMutation(api.rooms.create);
  const joinRoom = useMutation(api.rooms.join);

  const [roomName, setRoomName] = useState("");
  const [hostName, setHostName] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [joinName, setJoinName] = useState("");
  const [busy, setBusy] = useState(false);

  const handleCreate = async (event: FormEvent) => {
    event.preventDefault();
    if (!hostName.trim() || busy) return;
    setBusy(true);
    try {
      const { code } = await createRoom({ roomName, hostName, sessionId });
      navigate(`/room/${code}`);
    } catch (error) {
      toast.error(error);
      setBusy(false);
    }
  };

  const handleJoin = async (event: FormEvent) => {
    event.preventDefault();
    if (!joinCode.trim() || !joinName.trim() || busy) return;
    setBusy(true);
    try {
      const { code } = await joinRoom({ code: joinCode, name: joinName, sessionId });
      navigate(`/room/${code}`);
    } catch (error) {
      toast.error(error);
      setBusy(false);
    }
  };

  const inputClass =
    "w-full border-2 border-abyss-500 bg-abyss-950/80 px-3 py-2.5 font-mono text-sm text-slate-100 " +
    "placeholder:text-slate-500 focus:border-neon-cyan focus:outline-none focus:shadow-neon-cyan";

  return (
    <main className="relative z-10 mx-auto flex min-h-screen w-full max-w-5xl flex-col items-center px-4 py-10">
      <div className="absolute right-4 top-4 flex gap-2">
        <MusicPicker />
        <button
          onClick={toggleMuted}
          aria-label={muted ? "Unmute audio" : "Mute audio"}
          className="border-2 border-abyss-500 bg-abyss-900/80 p-2 text-slate-300 hover:border-neon-cyan hover:text-neon-cyan"
        >
          {muted ? <VolumeX size={18} /> : <Volume2 size={18} />}
        </button>
      </div>

      {/* ── Marquee ────────────────────────────────────────────────────── */}
      <header className="mb-10 mt-6 text-center">
        <p className="mb-3 font-arcade text-[10px] tracking-[0.4em] text-neon-cyan">
          BIT-POINT ARCADE PRESENTS
        </p>
        <h1 className="animate-flicker font-arcade text-3xl leading-tight text-glow-magenta sm:text-5xl">
          TOURNAMENT
          <br />
          OF TRIAGE
        </h1>
        <p className="mt-4 font-mono text-sm tracking-widest text-slate-200 [text-shadow:0_2px_10px_rgba(8,0,15,0.95),0_0_4px_rgba(8,0,15,0.9)]">
          COOPERATIVE STORY POINTING · EST. 1986
        </p>
        {/* Dark marquee plate: keeps the yellow text readable over the sun */}
        <p className="mt-6">
          <span className="inline-block border-2 border-neon-yellow/60 bg-abyss-950/90 px-5 py-2.5 font-arcade text-xs text-neon-yellow shadow-neon-yellow">
            <Blink>▶ INSERT COIN TO CONTINUE ◀</Blink>
          </span>
        </p>
      </header>

      {/* ── Coin slots ─────────────────────────────────────────────────── */}
      <div className="grid w-full gap-6 md:grid-cols-2">
        <Panel tone="magenta" title="NEW GAME · HOST A CABINET">
          <form onSubmit={handleCreate} className="flex flex-col gap-3">
            <label className="flex flex-col gap-1 font-arcade text-[10px] text-slate-400">
              TEAM NAME
              <input
                className={inputClass}
                value={roomName}
                onChange={(event) => setRoomName(event.target.value)}
                placeholder="THE MIDNIGHT SHIPPERS"
                maxLength={32}
              />
            </label>
            <label className="flex flex-col gap-1 font-arcade text-[10px] text-slate-400">
              YOUR HANDLE
              <input
                className={inputClass}
                value={hostName}
                onChange={(event) => setHostName(event.target.value)}
                placeholder="ada"
                maxLength={20}
                required
              />
            </label>
            <ArcadeButton type="submit" tone="magenta" big disabled={busy || !hostName.trim()}>
              <span className="flex items-center justify-center gap-2">
                <Gamepad2 size={16} aria-hidden /> POWER ON
              </span>
            </ArcadeButton>
            <p className="text-[11px] leading-relaxed text-slate-400">
              You become the Host: link Linear, pick the triage issues, run the rounds.
            </p>
          </form>
        </Panel>

        <Panel tone="cyan" title="CONTINUE · JOIN A CABINET">
          <form onSubmit={handleJoin} className="flex flex-col gap-3">
            <label className="flex flex-col gap-1 font-arcade text-[10px] text-slate-400">
              ROOM CODE
              <input
                className={`${inputClass} font-arcade uppercase tracking-[0.3em]`}
                value={joinCode}
                onChange={(event) => setJoinCode(event.target.value.toUpperCase())}
                placeholder="XQ42Z"
                maxLength={5}
                required
              />
            </label>
            <label className="flex flex-col gap-1 font-arcade text-[10px] text-slate-400">
              YOUR HANDLE
              <input
                className={inputClass}
                value={joinName}
                onChange={(event) => setJoinName(event.target.value)}
                placeholder="grace"
                maxLength={20}
                required
              />
            </label>
            <ArcadeButton
              type="submit"
              tone="cyan"
              big
              disabled={busy || !joinCode.trim() || !joinName.trim()}
            >
              <span className="flex items-center justify-center gap-2">
                <LogIn size={16} aria-hidden /> INSERT COIN
              </span>
            </ArcadeButton>
            <p className="text-[11px] leading-relaxed text-slate-400">
              Tip: use the same handle as your row in the host's data CSV so the Smart Agent can
              draft you.
            </p>
          </form>
        </Panel>
      </div>

      {/* ── The manual ─────────────────────────────────────────────────── */}
      <section className="mt-16 w-full" aria-label="How to play">
        <h2 className="mb-8 text-center font-arcade text-lg text-glow-cyan sm:text-xl">
          ▼ HOW TO PLAY ▼
        </h2>

        <div className="grid gap-6 lg:grid-cols-2">
          <Panel tone="yellow" title="WHY THIS GAME EXISTS">
            <div className="flex flex-col gap-3 text-xs leading-relaxed text-slate-300">
              <p>
                Estimation meetings fail the same three ways everywhere: the loudest voice anchors
                the number, half the room checks out, and whatever gets decided never makes it back
                into the tracker. This cabinet fixes all three.
              </p>
              <TutorialRow icon={<ShieldCheck size={14} className="text-neon-yellow" />}>
                Only issues in Linear's <b className="text-neon-yellow">triage</b> status can enter
                the tournament — enforced server-side, so in-flight work is untouchable.
              </TutorialRow>
              <TutorialRow icon={<SlidersHorizontal size={14} className="text-neon-yellow" />}>
                Every player scores two things, 1–3 each:{" "}
                <b className="text-neon-magenta">COMPLEXITY</b> (how hard is it really) and{" "}
                <b className="text-neon-cyan">UNCERTAINTY</b> (how much don't we know). Hard-but-known
                and easy-but-mysterious are different problems — this makes the difference visible.
              </TutorialRow>
              <TutorialRow icon={<Swords size={14} className="text-neon-yellow" />}>
                Votes are <b>blind</b> until the reveal, so estimates reflect real opinions. The
                final estimate is <span className="font-mono text-neon-yellow">max(C, U)</span> of
                the consensus (ties round up), written straight back to the Linear issue with a
                full vote breakdown.
              </TutorialRow>
            </div>
          </Panel>

          <Panel tone="cyan" title="ONE ROUND, START TO FINISH">
            <ol className="flex flex-col gap-2.5 text-xs leading-relaxed text-slate-300">
              {[
                <>The <b className="text-neon-cyan">Host</b> powers on a cabinet, links Linear with a personal API key, and scans triage issues — by one team, several, or all — then hand-picks which ones fight (8 of 12 is fine).</>,
                <>Players join with the <b className="text-neon-cyan">room code</b>. A coin drops. It's very satisfying.</>,
                <>Everyone votes 1–3 on both axes using the cabinet buttons. Individual picks stay hidden — only the <b className="text-neon-cyan">mechanical sliders</b> move, showing the live crowd average.</>,
                <>Want the work? Wager coins on the gold <b className="text-neon-yellow">💰 BID</b> button — everyone starts the game with <b className="text-neon-yellow">100 coins</b> and they never refill between bosses. Bids stay sealed until the reveal; rival bids spark a <b className="text-neon-yellow">BIDDING WAR</b> where anyone can keep raising. The top bid wins the quest and pays their coins at sync — losers keep theirs.</>,
                <>The Host reveals (or the round timer does it automatically). Unanimous vote? <b className="text-neon-green">PERFECT!</b> — the cabinet announces it.</>,
                <><b className="text-neon-green">SYNC &amp; ADVANCE</b> fires the laser volley, writes the estimate + a consensus-board comment (votes, bids, pairing intel) to Linear, and slides in the next issue.</>,
              ].map((step, index) => (
                <li key={index} className="flex gap-2.5">
                  <span className="font-arcade text-[10px] text-neon-cyan">{index + 1}.</span>
                  <span className="min-w-0">{step}</span>
                </li>
              ))}
            </ol>
          </Panel>

          <Panel tone="magenta" title="HOST PLAYBOOK · CONSOLE + TUNING">
            <div className="flex flex-col gap-3 text-xs leading-relaxed text-slate-300">
              <p>
                The <b className="text-neon-magenta">HOST CONSOLE</b> docks to the right edge of the
                screen (bottom-right button) with four tabs:
              </p>
              <TutorialRow icon={<ListChecks size={14} className="text-neon-magenta" />}>
                <b>MISSIONS</b> — the fight queue. Jump to any issue, bench (✕) anything imported by
                mistake, or load the demo quest to practice.
              </TutorialRow>
              <TutorialRow icon={<Timer size={14} className="text-neon-magenta" />}>
                <b>TIMER</b> — 30–120s round clocks that auto-reveal at zero. Under 10 seconds the
                cabinet goes red-alert and the music panics with you.
              </TutorialRow>
              <TutorialRow icon={<Bot size={14} className="text-neon-magenta" />}>
                <b>DATA</b> — upload the skills CSV that powers the Smart Agent.
              </TutorialRow>
              <TutorialRow icon={<KeyRound size={14} className="text-neon-magenta" />}>
                <b>LINEAR</b> — paste your API key, filter teams, scan triage, pick the fighters.
              </TutorialRow>
              <p className="border-t-2 border-abyss-600 pt-3">
                <b className="text-neon-yellow">Tuning tips:</b> 45–60s timers keep the tempo up ·
                3–8 players is the sweet spot · have people join with the same handle as their DATA
                row · a consensus 3 on either axis wakes the Smart Agent · use RE-FIGHT after a big
                split to revote post-discussion — the second round is usually tighter.
              </p>
            </div>
          </Panel>

          <Panel tone="green" title="THE DATA CSV · SMART AGENT FUEL">
            <div className="flex flex-col gap-3 text-xs leading-relaxed text-slate-300">
              <p>
                Three columns, exported from any spreadsheet. <b>Username</b> is the identifier —
                it must match the handle the player joins with.
              </p>
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-left">
                  <thead>
                    <tr>
                      {["USERNAME", "SKILLS", "CONFIDENCE"].map((column) => (
                        <th
                          key={column}
                          className="border border-abyss-600 bg-abyss-800 px-2.5 py-1.5 font-arcade text-[8px] text-neon-green"
                        >
                          {column}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="font-mono text-[11px]">
                    {[
                      ["ada", "postgres, sql, migrations", "5"],
                      ["grace", "react, performance, profiling", "4"],
                      ["linus", "kubernetes, terraform", "3"],
                    ].map(([username, skills, confidence]) => (
                      <tr key={username}>
                        <td className="border border-abyss-600 px-2.5 py-1.5 text-neon-cyan">
                          {username}
                        </td>
                        <td className="border border-abyss-600 px-2.5 py-1.5">{skills}</td>
                        <td className="border border-abyss-600 px-2.5 py-1.5 text-neon-yellow">
                          {"★".repeat(Number(confidence))}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p>
                <b className="text-neon-green">Why it matters:</b> when an issue lands a consensus 3
                in Complexity or Uncertainty, the Smart Agent matches these skills against the
                ticket text and recommends a pairing — a <b>Navigator</b> who has the skill with an{" "}
                <b>Implementor</b> who doesn't, so risky work gets staffed deliberately and
                knowledge spreads.
              </p>
              <a href="/sample-skills.csv" download className="text-neon-magenta underline">
                <Download size={11} className="mr-1 inline" aria-hidden />
                Download the sample CSV
              </a>
            </div>
          </Panel>
        </div>

        <p className="mt-8 text-center text-xs leading-relaxed text-slate-400">
          <Coins size={12} className="mr-1 inline text-neon-yellow" aria-hidden />
          No Linear handy? Hosts can <b className="text-neon-yellow">LOAD DEMO QUEST</b> in the
          lobby and play the whole tournament with four practice bosses.
        </p>
      </section>

      <footer className="mt-12 text-center font-mono text-[11px] text-slate-500">
        <p>2 CREDIT(S) · FREE PLAY MODE · NO QUARTERS REQUIRED</p>
        <p className="mt-1">React + Convex + Linear · headphones recommended 🎧</p>
      </footer>
    </main>
  );
}

function TutorialRow({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <p className="flex gap-2.5">
      <span className="mt-0.5 shrink-0" aria-hidden>
        {icon}
      </span>
      <span className="min-w-0">{children}</span>
    </p>
  );
}
