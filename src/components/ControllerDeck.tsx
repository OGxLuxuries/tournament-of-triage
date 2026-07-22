import { useMutation } from "convex/react";
import { useState, type CSSProperties } from "react";
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
  const placeBid = useMutation(api.votes.placeBid);
  const { tilted, registerPress } = useTilt();
  const [wager, setWager] = useState(10);

  const myVote = votes?.votes.find((vote) => vote.playerId === me.playerId);
  const votingOpen = room.status === "voting";
  const biddingOpen = votingOpen || room.status === "revealed";
  const locked = myVote?.ready ?? false;
  const myBid = myVote?.bidAmount ?? 0;
  const purse = me.coins;
  const displayWager = Math.min(wager, Math.max(purse, 0));
  const broke = purse < 5;

  const press = (axis: Axis, value: PointValue) => {
    if (!votingOpen || tilted) return;
    if (registerPress()) return; // that press tripped the TILT switch
    audio.thunk();
    cast({ roomId: room._id, sessionId, axis, value }).catch((error) => toast.error(error));
  };

  const adjustWager = (delta: number) => {
    if (!biddingOpen || tilted || broke) return;
    audio.click();
    setWager((current) => Math.min(Math.max(current + delta, 5), Math.max(purse, 5)));
  };

  const submitBid = (amount: number) => {
    if (!biddingOpen || tilted) return;
    if (registerPress()) return;
    audio.coin();
    placeBid({ roomId: room._id, sessionId, amount }).catch((error) => toast.error(error));
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

        {/* The gold corner: wager coins from your purse to claim the quest */}
        <div className="flex flex-col items-center gap-2">
          <span className="font-arcade text-[10px] tracking-[0.25em] text-glow-yellow">
            CLAIM IT · 🪙 {purse}
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => adjustWager(-5)}
              disabled={!biddingOpen || tilted || broke}
              aria-label="Decrease wager"
              className="border-2 border-abyss-500 px-2.5 py-1 font-arcade text-sm text-slate-300 hover:border-neon-yellow hover:text-neon-yellow disabled:opacity-40"
            >
              −
            </button>
            <span
              className="w-16 border-2 border-neon-yellow/60 bg-abyss-950 py-1.5 text-center font-arcade text-sm text-neon-yellow"
              aria-label={`Wager ${displayWager} coins`}
            >
              {broke ? "—" : displayWager}
            </span>
            <button
              type="button"
              onClick={() => adjustWager(5)}
              disabled={!biddingOpen || tilted || broke}
              aria-label="Increase wager"
              className="border-2 border-abyss-500 px-2.5 py-1 font-arcade text-sm text-slate-300 hover:border-neon-yellow hover:text-neon-yellow disabled:opacity-40"
            >
              +
            </button>
          </div>
          <button
            type="button"
            className={cn("cab-btn h-16 w-28 sm:h-20 sm:w-32", myBid > 0 && "cab-selected")}
            style={{ "--cab-glow": "#ffd700" } as CSSProperties}
            disabled={!biddingOpen || tilted || broke}
            onClick={() => submitBid(displayWager)}
            aria-label={`Bid ${displayWager} coins to take this work`}
            aria-pressed={myBid > 0}
          >
            <span className="cab-btn-edge" aria-hidden />
            <span
              className="cab-btn-face h-full w-full flex-col gap-1 font-arcade"
              style={{
                color: myBid > 0 ? "#ffffff" : "#ffd700",
                textShadow: "0 0 10px #ffd700",
              }}
            >
              <span className="text-base sm:text-lg">💰 {broke ? "BROKE" : displayWager}</span>
              <span className="text-[7px] tracking-widest">
                {broke
                  ? "PURSE EMPTY!"
                  : myBid === 0
                    ? "PLACE BID"
                    : myBid === displayWager
                      ? "BID PLACED!"
                      : `RAISE (NOW ${myBid})`}
              </span>
            </span>
          </button>
          {myBid > 0 && (
            <button
              type="button"
              onClick={() => submitBid(0)}
              disabled={!biddingOpen || tilted}
              className="font-arcade text-[8px] text-slate-400 underline hover:text-neon-red"
            >
              WITHDRAW BID
            </button>
          )}
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
