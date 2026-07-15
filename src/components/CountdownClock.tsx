import { TimerIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { audio } from "../lib/audio";
import { cn } from "../lib/cn";

/**
 * Round countdown. Under 10 seconds it goes red, pulses, kicks the music
 * into fast-tempo urgent mode, and ticks with a rising pitch-bend. The
 * actual reveal at 0 is scheduled server-side — this is pure theater.
 */
export function CountdownClock({ endsAt }: { endsAt: number }) {
  const [remainingMs, setRemainingMs] = useState(() => endsAt - Date.now());
  const lastTicked = useRef<number | null>(null);

  useEffect(() => {
    const interval = window.setInterval(() => {
      setRemainingMs(endsAt - Date.now());
    }, 200);
    return () => window.clearInterval(interval);
  }, [endsAt]);

  const seconds = Math.max(0, Math.ceil(remainingMs / 1000));
  const urgent = seconds <= 10 && seconds > 0;

  useEffect(() => {
    audio.setUrgent(urgent);
    return () => audio.setUrgent(false);
  }, [urgent]);

  useEffect(() => {
    if (urgent && lastTicked.current !== seconds) {
      lastTicked.current = seconds;
      audio.urgentTick(seconds);
    }
  }, [urgent, seconds]);

  const mm = String(Math.floor(seconds / 60)).padStart(2, "0");
  const ss = String(seconds % 60).padStart(2, "0");

  return (
    <div
      className={cn(
        "flex items-center gap-2 border-2 px-3 py-1.5 font-arcade text-sm",
        urgent
          ? "animate-pulse-urgent border-neon-red text-neon-red shadow-neon-red"
          : "border-neon-yellow/70 text-neon-yellow",
      )}
      aria-label={`Time remaining ${mm}:${ss}`}
    >
      <TimerIcon size={14} aria-hidden />
      {mm}:{ss}
    </div>
  );
}
