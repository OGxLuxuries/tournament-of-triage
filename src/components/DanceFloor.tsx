import { useEffect, useState } from "react";
import { cn } from "../lib/cn";
import type { PlayerRow } from "../lib/types";
import { PixelAvatar } from "./PixelAvatar";

interface DanceFloorProps {
  players: PlayerRow[];
  /** Player ids that have locked in — shown as a dot, never their numbers. */
  lockedIds: Set<string>;
}

/**
 * The team box: every online member's 8-bit character wandering around the
 * floor. Movement is per-dancer randomized waypoints glided over a CSS
 * transition; the float animation adds the bob, and dancers face the way
 * they're walking. No vote information leaks here beyond the locked dot.
 */
export function DanceFloor({ players, lockedIds }: DanceFloorProps) {
  return (
    <div className="relative h-full min-h-[240px] overflow-hidden bg-abyss-950/50">
      {/* checkerboard floor glow */}
      <div
        className="absolute inset-x-0 bottom-0 h-1/3 opacity-30"
        style={{
          backgroundImage:
            "repeating-linear-gradient(90deg, rgba(255,46,196,0.35) 0 24px, rgba(34,247,255,0.25) 24px 48px)",
          maskImage: "linear-gradient(to top, black, transparent)",
          WebkitMaskImage: "linear-gradient(to top, black, transparent)",
        }}
        aria-hidden
      />
      {players.map((player, index) => (
        <Dancer
          key={player._id}
          player={player}
          locked={lockedIds.has(player._id)}
          index={index}
        />
      ))}
      {players.length === 0 && (
        <p className="absolute inset-0 flex items-center justify-center text-xs text-slate-500">
          The floor is empty. Eerie.
        </p>
      )}
    </div>
  );
}

function Dancer({
  player,
  locked,
  index,
}: {
  player: PlayerRow;
  locked: boolean;
  index: number;
}) {
  const [pos, setPos] = useState(() => ({
    x: 8 + (player.avatarSeed % 70),
    y: 10 + ((player.avatarSeed >> 4) % 55),
    facingLeft: false,
  }));

  useEffect(() => {
    const wander = () =>
      setPos((previous) => {
        const x = 4 + Math.random() * 76;
        return { x, y: 5 + Math.random() * 60, facingLeft: x < previous.x };
      });
    const kickoff = window.setTimeout(wander, 150 + index * 180);
    const interval = window.setInterval(wander, 2400 + (index % 5) * 260);
    return () => {
      window.clearTimeout(kickoff);
      window.clearInterval(interval);
    };
  }, [index]);

  return (
    <div
      className="absolute flex w-16 flex-col items-center transition-all duration-[2200ms] ease-in-out"
      style={{ left: `${pos.x}%`, top: `${pos.y}%` }}
    >
      <span
        className={cn(
          "mb-0.5 h-1.5 w-1.5 rounded-full",
          locked ? "bg-neon-green shadow-neon-green" : "bg-transparent",
        )}
        title={locked ? "Locked in" : undefined}
        aria-label={locked ? `${player.name} locked in` : undefined}
      />
      <div
        className={cn("animate-float", pos.facingLeft && "-scale-x-100")}
        style={{ animationDelay: `${index * 0.23}s` }}
      >
        <PixelAvatar seed={player.avatarSeed} size={36} />
      </div>
      <span className="mt-0.5 max-w-full truncate text-[9px] text-slate-300">{player.name}</span>
    </div>
  );
}
