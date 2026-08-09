import { classicLevel } from "../src/core/chapters";
import { solve } from "../src/core/solver";

/** How much search each shipped level demands — the difficulty proxy. */
for (const chapter of [1, 2, 3, 5, 8, 12, 16, 20]) {
  const scores: number[] = [];
  for (let stage = 1; stage <= 32; stage++) {
    const level = classicLevel(chapter, stage);
    scores.push(solve(level, { limit: 2 }).nodesVisited);
  }
  scores.sort((a, b) => a - b);
  const pct = (p: number) => scores[Math.floor(scores.length * p)];
  console.log(
    `ch${String(chapter).padStart(2)}  min ${String(scores[0]).padStart(4)}  ` +
      `p25 ${String(pct(0.25)).padStart(5)}  median ${String(pct(0.5)).padStart(5)}  ` +
      `p75 ${String(pct(0.75)).padStart(6)}  max ${scores[scores.length - 1]}`,
  );
}
