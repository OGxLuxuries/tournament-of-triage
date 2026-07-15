import { useMutation } from "convex/react";
import { Gamepad2, LogIn, Volume2, VolumeX } from "lucide-react";
import { useMemo, useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../../convex/_generated/api";
import { ArcadeButton, Blink, Panel } from "../components/ui";
import { useAudioControls } from "../lib/audio-context";
import { getSessionId } from "../lib/session";
import { useToast } from "../lib/toast";

/** Landing page: the attract mode. Create a cabinet or join with a code. */
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
      <button
        onClick={toggleMuted}
        aria-label={muted ? "Unmute audio" : "Mute audio"}
        className="absolute right-4 top-4 border-2 border-abyss-500 bg-abyss-900/80 p-2 text-slate-300 hover:border-neon-cyan hover:text-neon-cyan"
      >
        {muted ? <VolumeX size={18} /> : <Volume2 size={18} />}
      </button>

      <header className="mb-10 mt-6 text-center">
        <p className="mb-3 font-arcade text-[10px] tracking-[0.4em] text-neon-cyan">
          ANTHRO-CADE PRESENTS
        </p>
        <h1 className="animate-flicker font-arcade text-4xl leading-tight text-glow-magenta sm:text-6xl">
          BITPOINT
          <br />
          ARCADE
        </h1>
        <p className="mt-4 font-mono text-sm tracking-widest text-slate-300">
          COOPERATIVE STORY POINTING · EST. 1986
        </p>
        <p className="mt-6 font-arcade text-xs text-neon-yellow">
          <Blink>▶ INSERT COIN TO CONTINUE ◀</Blink>
        </p>
      </header>

      <div className="grid w-full gap-6 md:grid-cols-2">
        <Panel tone="magenta" title="NEW GAME · HOST A CABINET">
          <form onSubmit={handleCreate} className="flex flex-col gap-3">
            <label className="flex flex-col gap-1 text-[10px] font-arcade text-slate-400">
              TEAM NAME
              <input
                className={inputClass}
                value={roomName}
                onChange={(event) => setRoomName(event.target.value)}
                placeholder="THE MIDNIGHT SHIPPERS"
                maxLength={32}
              />
            </label>
            <label className="flex flex-col gap-1 text-[10px] font-arcade text-slate-400">
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
              You become the Host: connect Linear, load the backlog, run the rounds.
            </p>
          </form>
        </Panel>

        <Panel tone="cyan" title="CONTINUE · JOIN A CABINET">
          <form onSubmit={handleJoin} className="flex flex-col gap-3">
            <label className="flex flex-col gap-1 text-[10px] font-arcade text-slate-400">
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
            <label className="flex flex-col gap-1 text-[10px] font-arcade text-slate-400">
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
              Tip: use the same handle as your row in the skills matrix to power the Smart Agent.
            </p>
          </form>
        </Panel>
      </div>

      <footer className="mt-12 text-center font-mono text-[11px] text-slate-500">
        <p>2 CREDIT(S) · FREE PLAY MODE · NO QUARTERS REQUIRED</p>
        <p className="mt-1">React + Convex + Linear · headphones recommended 🎧</p>
      </footer>
    </main>
  );
}
