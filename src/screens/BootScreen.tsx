import { TerminalSquare } from "lucide-react";
import { Blink } from "../components/ui";

/** Shown when VITE_CONVEX_URL is missing — a friendly retro setup terminal. */
export function BootScreen() {
  return (
    <main className="relative z-10 flex min-h-screen items-center justify-center px-4">
      <div className="pixel-frame-yellow panel-chrome w-full max-w-2xl p-6">
        <div className="mb-4 flex items-center gap-3 font-arcade text-xs text-neon-yellow">
          <TerminalSquare size={18} aria-hidden />
          SYSTEM BOOT · ERROR 0x42
        </div>
        <div className="flex flex-col gap-3 text-sm leading-relaxed">
          <p className="text-neon-red">CONVEX COPROCESSOR NOT DETECTED.</p>
          <p className="text-slate-300">
            The cabinet needs a realtime backend before it can take quarters. One-time setup:
          </p>
          <ol className="flex list-decimal flex-col gap-2 pl-6 text-slate-300">
            <li>
              Run <code className="bg-abyss-700 px-1 text-neon-cyan">npx convex dev</code> in the
              repo — it provisions a free deployment and writes{" "}
              <code className="bg-abyss-700 px-1 text-neon-cyan">VITE_CONVEX_URL</code> to{" "}
              <code className="bg-abyss-700 px-1 text-neon-cyan">.env.local</code>.
            </li>
            <li>
              Local play: restart <code className="bg-abyss-700 px-1 text-neon-cyan">npm run dev</code>.
            </li>
            <li>
              Production: set <code className="bg-abyss-700 px-1 text-neon-cyan">VITE_CONVEX_URL</code>{" "}
              in Vercel → Project → Environment Variables, then redeploy. Full steps in the README.
            </li>
          </ol>
          <p className="mt-2 font-arcade text-[10px] text-neon-green">
            <Blink>▮</Blink> AWAITING BACKEND LINK…
          </p>
        </div>
      </div>
    </main>
  );
}
