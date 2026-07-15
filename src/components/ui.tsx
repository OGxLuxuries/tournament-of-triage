import { type ButtonHTMLAttributes, type ReactNode } from "react";
import { audio } from "../lib/audio";
import { cn } from "../lib/cn";

type Tone = "magenta" | "cyan" | "yellow" | "green" | "red" | "dim";

const TONES: Record<Tone, string> = {
  magenta: "border-neon-magenta text-neon-magenta hover:shadow-neon-magenta",
  cyan: "border-neon-cyan text-neon-cyan hover:shadow-neon-cyan",
  yellow: "border-neon-yellow text-neon-yellow hover:shadow-neon-yellow",
  green: "border-neon-green text-neon-green hover:shadow-neon-green",
  red: "border-neon-red text-neon-red hover:shadow-neon-red",
  dim: "border-abyss-500 text-slate-400 hover:border-slate-300 hover:text-slate-200",
};

interface ArcadeButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  tone?: Tone;
  big?: boolean;
}

/** Standard console button: pixel font, neon border, mechanical clunk. */
export function ArcadeButton({
  tone = "magenta",
  big = false,
  className,
  onClick,
  children,
  ...rest
}: ArcadeButtonProps) {
  return (
    <button
      {...rest}
      onClick={(event) => {
        audio.click();
        onClick?.(event);
      }}
      className={cn(
        "border-2 bg-abyss-900/80 font-arcade uppercase tracking-wider transition-all",
        "active:translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none",
        big ? "px-6 py-4 text-xs sm:text-sm" : "px-3 py-2 text-[10px]",
        TONES[tone],
        className,
      )}
    >
      {children}
    </button>
  );
}

interface PanelProps {
  tone?: Tone;
  title?: ReactNode;
  className?: string;
  children: ReactNode;
}

/** Neon-framed cabinet panel with an optional marquee title strip. */
export function Panel({ tone = "dim", title, className, children }: PanelProps) {
  const frame: Record<Tone, string> = {
    magenta: "pixel-frame-magenta",
    cyan: "pixel-frame-cyan",
    yellow: "pixel-frame-yellow",
    green: "pixel-frame-green",
    red: "pixel-frame-red",
    dim: "pixel-frame-dim",
  };
  return (
    <section className={cn("panel-chrome", frame[tone], className)}>
      {title !== undefined && (
        <header className="border-b-2 border-abyss-600 px-3 py-2 font-arcade text-[10px] uppercase tracking-widest text-slate-300">
          {title}
        </header>
      )}
      <div className="p-3">{children}</div>
    </section>
  );
}

/** Blinking INSERT-COIN-style attention text. */
export function Blink({ children, className }: { children: ReactNode; className?: string }) {
  return <span className={cn("animate-blink", className)}>{children}</span>;
}
