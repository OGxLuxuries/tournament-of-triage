import { cn } from "../lib/cn";

/**
 * Boss health bar. Full while the team deliberates, weakened on reveal,
 * drains to zero (with a delay so the lasers land first) on victory.
 */
export function HpBar({ phase }: { phase: "voting" | "revealed" | "victory" }) {
  const width = phase === "voting" ? 100 : phase === "revealed" ? 42 : 0;
  return (
    <div className="w-full">
      <div className="mb-1 flex items-center justify-between font-arcade text-[9px]">
        <span className="text-neon-red">HP</span>
        <span className={cn("text-slate-400", phase === "victory" && "text-neon-red")}>
          {phase === "voting" ? "????" : phase === "revealed" ? "CRITICAL" : "0000"}
        </span>
      </div>
      <div className="h-4 border-2 border-neon-red/70 bg-abyss-950 p-0.5">
        <div
          className="h-full bg-gradient-to-r from-neon-red via-neon-magenta to-neon-yellow"
          style={{
            width: `${width}%`,
            transition: phase === "victory" ? "width 1.1s ease-in 1.1s" : "width 0.8s ease",
            boxShadow: "0 0 8px #ff2244",
          }}
        />
      </div>
    </div>
  );
}
