import { useMutation } from "convex/react";
import { type CSSProperties } from "react";
import { api } from "../../convex/_generated/api";
import { audio } from "../lib/audio";
import { cn } from "../lib/cn";
import { useTilt } from "../lib/tilt";
import { useToast } from "../lib/toast";
import type { MeState, RoomState, VotesState } from "../lib/types";

type Axis = "complexity" | "uncertainty";
type PointValue = 1 | 2 | 3;

interface ControllerDeckProps {
  room: RoomState;
  votes: VotesState | undefined;
  me: MeState;
  sessionId: string;
}

/**
 * The physical cabinet deck: two clusters of chunky 3D buttons. Complexity
 * glows magenta, Uncertainty glows cyan; presses depress into the deck with
 * a mechanical clunk. Spamming >5 presses in 2s trips the TILT lockout.
 */
export function ControllerDeck({ room, votes, me, sessionId }: ControllerDeckProps) {
  const toast = useToast();
  const cast = useMutation(api.votes.cast);
  const toggleBid = useMutation(api.votes.toggleBid);
  const { tilted, registerPress } = useTilt();

  const myVote = votes?.votes.find((vote) => vote.playerId === me.playerId);
  const votingOpen = room.status === "voting";
  const biddingOpen = votingOpen || room.status === "revealed";
  const locked = myVote?.ready ?? false;
  const myBid = myVote?.bid ?? false;

  const press = (axis: Axis, value: PointValue) => {
    if (!votingOpen || tilted) return;
    if (registerPress()) return; // that press tripped the TILT switch
    audio.thunk();
    cast({ roomId: room._id, sessionId, axis, value }).catch((error) => toast.error(error));
  };

  const pressBid = () => {
    if (!biddingOpen || tilted) return;
    if (registerPress()) return;
    audio.coin();
    toggleBid({ roomId: room._id, sessionId }).catch((error) => toast.error(error));
  };

  return (
    <section
      aria-label="Voting controller"
      className="panel-chrome pixel-frame-dim sticky bottom-2 z-20 px-4 pb-5 pt-3"
      style={{ transform: "perspective(900px) rotateX(5deg)", transformOrigin: "bottom center" }}
    >
      <div className="mb-2 flex items-center justify-between font-arcade text-[8px] text-slate-500">
        <span>P1 · {me.name.toUpperCase()}</span>
        <span
          className={cn(
            "border px-2 py-1",
            tilted
              ? "animate-tilt-flash border-neon-red"
              : locked && votingOpen
                ? "border-neon-green text-neon-green"
                : votingOpen
                  ? "border-neon-yellow text-neon-yellow"
                  : "border-abyss-500 text-slate-500",
          )}
        >
          {tilted ? "TILT!!" : votingOpen ? (locked ? "● LOCKED IN" : "○ CAST YOUR VOTE") : "STANDBY"}
        </span>
      </div>

      <div className="flex flex-wrap items-start justify-center gap-x-12 gap-y-4">
        <ButtonCluster
          label="COMPLEXITY"
          glow="#ff2ec4"
          labelClass="text-glow-magenta"
          selected={myVote?.complexity}
          disabled={!votingOpen || tilted}
          onPress={(value) => press("complexity", value)}
        />
        <ButtonCluster
          label="UNCERTAINTY"
          glow="#22f7ff"
          labelClass="text-glow-cyan"
          selected={myVote?.uncertainty}
          disabled={!votingOpen || tilted}
          onPress={(value) => press("uncertainty", value)}
        />

        {/* The gold button: bid to take this work */}
        <div className="flex flex-col items-center gap-3">
          <span className="font-arcade text-[10px] tracking-[0.25em] text-glow-yellow">
            CLAIM IT
          </span>
          <button
            type="button"
            className={cn("cab-btn h-16 w-28 sm:h-20 sm:w-32", myBid && "cab-selected")}
            style={{ "--cab-glow": "#ffd700" } as CSSProperties}
            disabled={!biddingOpen || tilted}
            onClick={pressBid}
            aria-label="Bid to take this work"
            aria-pressed={myBid}
          >
            <span className="cab-btn-edge" aria-hidden />
            <span
              className="cab-btn-face h-full w-full flex-col gap-1 font-arcade"
              style={{
                color: myBid ? "#ffffff" : "#ffd700",
                textShadow: "0 0 10px #ffd700",
              }}
            >
              <span className="text-base sm:text-lg">💰 BID</span>
              <span className="text-[7px] tracking-widest">
                {myBid ? "BID PLACED!" : "TAKE THE QUEST"}
              </span>
            </span>
          </button>
        </div>
      </div>
    </section>
  );
}

interface ButtonClusterProps {
  label: string;
  glow: string;
  labelClass: string;
  selected: number | undefined;
  disabled: boolean;
  onPress: (value: PointValue) => void;
}

function ButtonCluster({ label, glow, labelClass, selected, disabled, onPress }: ButtonClusterProps) {
  return (
    <div className="flex flex-col items-center gap-3">
      <span className={cn("font-arcade text-[10px] tracking-[0.25em]", labelClass)}>{label}</span>
      <div className="flex gap-4">
        {([1, 2, 3] as const).map((value) => (
          <button
            key={value}
            type="button"
            className={cn("cab-btn h-16 w-16 sm:h-20 sm:w-20", selected === value && "cab-selected")}
            style={{ "--cab-glow": glow } as CSSProperties}
            disabled={disabled}
            onClick={() => onPress(value)}
            aria-label={`${label} ${value}`}
            aria-pressed={selected === value}
          >
            <span className="cab-btn-edge" aria-hidden />
            <span
              className="cab-btn-face h-full w-full font-arcade text-2xl sm:text-3xl"
              style={{ color: selected === value ? "#ffffff" : glow, textShadow: `0 0 10px ${glow}` }}
            >
              {value}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
