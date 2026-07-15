import { useMemo } from "react";

/** Deterministic PRNG so every client renders the same invader per seed. */
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const PALETTE = ["#ff2ec4", "#22f7ff", "#ffe600", "#39ff14", "#a855f7", "#ff8a00"];

/**
 * 8-bit space-invader avatar: a 4x7 random half, mirrored to 7x7 (with an
 * eye row forced on) so every player gets a symmetric little monster.
 */
export function PixelAvatar({ seed, size = 40 }: { seed: number; size?: number }) {
  const { cells, color } = useMemo(() => {
    const rand = mulberry32(seed || 1);
    const color = PALETTE[Math.floor(rand() * PALETTE.length)];
    const grid: boolean[][] = [];
    for (let y = 0; y < 7; y++) {
      const row: boolean[] = [];
      for (let x = 0; x < 4; x++) row.push(rand() > 0.48);
      grid.push(row);
    }
    // Guarantee eyes and a mouth line so it reads as a creature.
    grid[2][1] = true;
    grid[4][0] = true;
    grid[4][1] = true;

    const cells: Array<{ x: number; y: number }> = [];
    for (let y = 0; y < 7; y++) {
      for (let x = 0; x < 7; x++) {
        const half = x < 4 ? grid[y][x] : grid[y][6 - x];
        if (half) cells.push({ x, y });
      }
    }
    return { cells, color };
  }, [seed]);

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 7 7"
      shapeRendering="crispEdges"
      aria-hidden
      style={{ filter: `drop-shadow(0 0 4px ${color})` }}
    >
      {cells.map(({ x, y }) => (
        <rect key={`${x}-${y}`} x={x} y={y} width={1} height={1} fill={color} />
      ))}
    </svg>
  );
}
