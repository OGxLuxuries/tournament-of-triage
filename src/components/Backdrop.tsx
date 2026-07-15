/** Fixed synthwave backdrop: starfield, striped sun, scrolling grid floor. */
export function SynthwaveBackdrop() {
  return (
    <div className="pointer-events-none fixed inset-0 overflow-hidden" aria-hidden>
      <div
        className="absolute inset-0 opacity-60"
        style={{
          backgroundImage:
            "radial-gradient(1px 1px at 12% 18%, #fff 50%, transparent 50%)," +
            "radial-gradient(1px 1px at 34% 8%, #22f7ff 50%, transparent 50%)," +
            "radial-gradient(2px 2px at 58% 22%, #fff 50%, transparent 50%)," +
            "radial-gradient(1px 1px at 76% 12%, #ff2ec4 50%, transparent 50%)," +
            "radial-gradient(1px 1px at 90% 30%, #fff 50%, transparent 50%)," +
            "radial-gradient(1px 1px at 22% 38%, #ffe600 50%, transparent 50%)",
        }}
      />
      <div className="synth-sun" />
      <div className="synth-grid" />
      <div className="absolute inset-x-0 bottom-0 h-[46vh] bg-gradient-to-t from-abyss-950/70 to-transparent" />
    </div>
  );
}

/** CRT scanlines + vignette above everything except toasts/TILT. */
export function CrtOverlay() {
  return <div className="crt-overlay" aria-hidden />;
}
