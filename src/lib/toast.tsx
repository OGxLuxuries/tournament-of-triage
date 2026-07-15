import { ConvexError } from "convex/values";
import { AlertTriangle, CheckCircle2, Info } from "lucide-react";
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { cn } from "./cn";

type ToastTone = "info" | "success" | "error";

interface Toast {
  id: number;
  tone: ToastTone;
  message: string;
}

interface ToastContextValue {
  push: (tone: ToastTone, message: string) => void;
  error: (err: unknown) => void;
}

const Ctx = createContext<ToastContextValue>({ push: () => {}, error: () => {} });

const TONE_STYLES: Record<ToastTone, string> = {
  info: "border-neon-cyan text-neon-cyan shadow-neon-cyan",
  success: "border-neon-green text-neon-green shadow-neon-green",
  error: "border-neon-red text-neon-red shadow-neon-red",
};

const TONE_ICONS: Record<ToastTone, typeof Info> = {
  info: Info,
  success: CheckCircle2,
  error: AlertTriangle,
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(1);

  const push = useCallback((tone: ToastTone, message: string) => {
    const id = nextId.current++;
    setToasts((current) => [...current.slice(-3), { id, tone, message }]);
    window.setTimeout(() => {
      setToasts((current) => current.filter((toast) => toast.id !== id));
    }, 4600);
  }, []);

  const error = useCallback(
    (err: unknown) => {
      const message =
        err instanceof ConvexError
          ? String(err.data)
          : err instanceof Error
            ? err.message
            : "SYSTEM FAULT — TRY AGAIN";
      push("error", message);
    },
    [push],
  );

  const value = useMemo(() => ({ push, error }), [push, error]);

  return (
    <Ctx.Provider value={value}>
      {children}
      <div className="fixed bottom-4 left-4 z-[100] flex w-[min(92vw,380px)] flex-col gap-2">
        {toasts.map((toast) => {
          const Icon = TONE_ICONS[toast.tone];
          return (
            <div
              key={toast.id}
              role="status"
              className={cn(
                "flex items-start gap-2 border-2 bg-abyss-900/95 px-3 py-2 text-xs animate-slide-up",
                TONE_STYLES[toast.tone],
              )}
            >
              <Icon size={16} className="mt-0.5 shrink-0" aria-hidden />
              <span className="break-words leading-relaxed">{toast.message}</span>
            </div>
          );
        })}
      </div>
    </Ctx.Provider>
  );
}

export function useToast(): ToastContextValue {
  return useContext(Ctx);
}
