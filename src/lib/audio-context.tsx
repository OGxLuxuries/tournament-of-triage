import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { audio } from "./audio";

interface AudioContextValue {
  muted: boolean;
  toggleMuted: () => void;
}

const Ctx = createContext<AudioContextValue>({ muted: false, toggleMuted: () => {} });

/**
 * Bridges the audio singleton into React and arms the "unlock on first
 * gesture" listener required by browser autoplay policies.
 */
export function AudioProvider({ children }: { children: ReactNode }) {
  const [muted, setMuted] = useState(audio.muted);

  useEffect(() => {
    const unlock = () => audio.unlock();
    window.addEventListener("pointerdown", unlock, { passive: true });
    window.addEventListener("keydown", unlock);
    return () => {
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
    };
  }, []);

  const toggleMuted = useCallback(() => {
    setMuted((current) => {
      audio.setMuted(!current);
      return !current;
    });
  }, []);

  const value = useMemo(() => ({ muted, toggleMuted }), [muted, toggleMuted]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAudioControls(): AudioContextValue {
  return useContext(Ctx);
}
