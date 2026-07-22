interface SliderMeterProps {
  label: string;
  /** Live round average on a 1–3 scale, or null before any votes land. */
  value: number | null;
  glow: string;
  labelClass: string;
}

/**
 * A mechanical cabinet slider: a notched 1–2–3 track whose thumb glides to
 * the live average as votes come in. Individual votes stay blind — only the
 * crowd's needle moves.
 */
export function SliderMeter({ label, value, glow, labelClass }: SliderMeterProps) {
  const clamped = value === null ? null : Math.min(3, Math.max(1, value));
  const pct = clamped === null ? 0 : ((clamped - 1) / 2) * 100;

  return (
    <div aria-label={`${label} average ${value === null ? "no votes yet" : value.toFixed(1)}`}>
      <div className="mb-1 flex items-center justify-between font-arcade text-[9px]">
        <span className={labelClass}>{label}</span>
        <span className={value === null ? "text-slate-600" : labelClass}>
          {value === null ? "-.-" : value.toFixed(1)}
        </span>
      </div>
      <div className="relative h-4 border-2 border-abyss-500 bg-abyss-950">
        {[0, 50, 100].map((notch) => (
          <span
            key={notch}
            className="absolute top-0 h-full w-0.5 bg-abyss-600"
            style={{ left: `calc(${notch}% - 1px)` }}
            aria-hidden
          />
        ))}
        <span
          className="absolute -top-1.5 h-7 w-2.5 border-2 border-abyss-950 transition-all duration-500 ease-out"
          style={{
            left: `calc(${pct}% - 5px)`,
            background: clamped === null ? "#3a1a5e" : glow,
            boxShadow: clamped === null ? "none" : `0 0 10px ${glow}`,
          }}
          aria-hidden
        />
      </div>
      <div className="mt-1.5 flex justify-between font-arcade text-[8px] text-slate-500" aria-hidden>
        <span>1</span>
        <span>2</span>
        <span>3</span>
      </div>
    </div>
  );
}
