import { Music2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { audio, type MusicMode } from "../lib/audio";
import { cn } from "../lib/cn";

/**
 * The music library: MIX (all four tracks, 90s each, fading between) or any
 * single track on loop. Lives next to the volume control. Selection persists
 * and the ♪ marker tracks whatever is actually spinning right now.
 */
export function MusicPicker({ compact = false }: { compact?: boolean }) {
  const [open, setOpen] = useState(false);
  const [state, setState] = useState(() => audio.getMusicState());
  const rootRef = useRef<HTMLDivElement>(null);

  /* Keep the ♪ marker honest while the menu is open (mix mode rotates). */
  useEffect(() => {
    if (!open) return;
    const interval = window.setInterval(() => setState(audio.getMusicState()), 1000);
    const onOutsideClick = (event: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onOutsideClick);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener("mousedown", onOutsideClick);
    };
  }, [open]);

  const select = (mode: MusicMode) => {
    audio.setMusicMode(mode);
    setState(audio.getMusicState());
    setOpen(false);
  };

  const rows: Array<{ mode: MusicMode; label: string }> = [
    { mode: "mix", label: "MIX · ALL FOUR" },
    ...state.tracks.map((name, index) => ({ mode: index as MusicMode, label: name })),
  ];

  return (
    <div className="relative" ref={rootRef}>
      <button
        onClick={() => {
          audio.click();
          setState(audio.getMusicState());
          setOpen((current) => !current);
        }}
        aria-label="Music library"
        aria-expanded={open}
        className={cn(
          "border-2 border-abyss-500 bg-abyss-900/80 text-slate-300 hover:border-neon-magenta hover:text-neon-magenta",
          compact ? "p-1.5" : "p-2",
        )}
      >
        <Music2 size={compact ? 16 : 18} />
      </button>

      {open && (
        <div className="absolute right-0 top-full z-[60] mt-2 w-56 border-2 border-neon-magenta bg-abyss-900/95 p-2 shadow-neon-magenta">
          <p className="mb-2 px-1 font-arcade text-[8px] tracking-widest text-slate-500">
            MUSIC LIBRARY
          </p>
          <div className="flex flex-col gap-1">
            {rows.map(({ mode, label }) => {
              const selected = state.mode === mode;
              const nowPlaying = mode !== "mix" && state.playing === mode;
              return (
                <button
                  key={String(mode)}
                  onClick={() => select(mode)}
                  aria-pressed={selected}
                  className={cn(
                    "flex items-center gap-2 border-2 px-2 py-1.5 text-left font-arcade text-[9px]",
                    selected
                      ? "border-neon-magenta text-neon-magenta"
                      : "border-abyss-600 text-slate-300 hover:border-slate-400",
                  )}
                >
                  <span className="w-3 text-neon-green" aria-hidden>
                    {nowPlaying ? "♪" : selected && mode === "mix" ? "♪" : ""}
                  </span>
                  <span className="min-w-0 flex-1 truncate">{label}</span>
                </button>
              );
            })}
          </div>
          <p className="mt-2 px-1 text-[9px] leading-relaxed text-slate-500">
            MIX rotates all four — 90s each, fading between.
          </p>
        </div>
      )}
    </div>
  );
}
