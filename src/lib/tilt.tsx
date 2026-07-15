import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { audio } from "./audio";
import { cn } from "./cn";

/** How long the machine sulks after a TILT. */
export const TILT_LOCKOUT_MS = 2600;

interface TiltContextValue {
  tilted: boolean;
  /** Register a cabinet-button press; returns true if this press tripped TILT. */
  registerPress: () => boolean;
}

const Ctx = createContext<TiltContextValue>({ tilted: false, registerPress: () => false });

/**
 * Anti-Spam Tilt: more than 5 cabinet presses inside 2 seconds trips the
 * machine — full-screen shake, flashing TILT! marquee, buttons dead until
 * the lockout clears. Wraps the whole app so the shake hits everything.
 */
export function TiltProvider({ children }: { children: ReactNode }) {
  const [tilted, setTilted] = useState(false);
  const presses = useRef<number[]>([]);
  const timeout = useRef<number | null>(null);

  const registerPress = useCallback(() => {
    const now = Date.now();
    presses.current = [...presses.current.filter((at) => now - at < 2000), now];
    if (presses.current.length <= 5) return false;

    presses.current = [];
    setTilted(true);
    audio.tilt();
    if (timeout.current !== null) window.clearTimeout(timeout.current);
    timeout.current = window.setTimeout(() => setTilted(false), TILT_LOCKOUT_MS);
    return true;
  }, []);

  const value = useMemo(() => ({ tilted, registerPress }), [tilted, registerPress]);

  return (
    <Ctx.Provider value={value}>
      <div className={cn("min-h-screen", tilted && "animate-shake")}>{children}</div>
      {tilted && (
        <div className="tilt-stripes fixed inset-0 z-[95] flex items-center justify-center bg-abyss-950/60">
          <div className="animate-tilt-flash font-arcade text-6xl sm:text-8xl" aria-live="assertive">
            TILT!
          </div>
        </div>
      )}
    </Ctx.Provider>
  );
}

export function useTilt(): TiltContextValue {
  return useContext(Ctx);
}
