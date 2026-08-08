import { type GenSpec, generateCandidate, mulberry32 } from "../src/core/generator";
import { formatLevel, shapesIn } from "../src/core/level";
import { solve } from "../src/core/solver";
import type { Level } from "../src/core/types";

/**
 * Finds small, unique boards that match a teaching goal, so the opening stages
 * can ramp deliberately instead of relying on whatever the generator happens
 * to produce at the bottom of the difficulty curve.
 */
interface Goal {
  label: string;
  spec: GenSpec;
  shapes: number;
  minPieces: number;
  maxPieces: number;
  hubs: number;
  maxWidth: number;
  maxHeight: number;
}

const goals: Goal[] = [
  { label: "A one colour small", spec: { width: 3, height: 3, shapes: 1, pathLength: 7, maxHubCapacity: 2 }, shapes: 1, minPieces: 6, maxPieces: 7, hubs: 0, maxWidth: 3, maxHeight: 3 },
  { label: "B one colour big", spec: { width: 3, height: 4, shapes: 1, pathLength: 9, maxHubCapacity: 2 }, shapes: 1, minPieces: 8, maxPieces: 9, hubs: 0, maxWidth: 3, maxHeight: 4 },
  { label: "C two colours small", spec: { width: 3, height: 4, shapes: 2, pathLength: 5, maxHubCapacity: 2 }, shapes: 2, minPieces: 7, maxPieces: 9, hubs: 0, maxWidth: 3, maxHeight: 4 },
  { label: "D two colours big", spec: { width: 3, height: 4, shapes: 2, pathLength: 6, maxHubCapacity: 2 }, shapes: 2, minPieces: 10, maxPieces: 11, hubs: 0, maxWidth: 3, maxHeight: 4 },
  { label: "E one hub", spec: { width: 3, height: 4, shapes: 2, pathLength: 6, maxHubCapacity: 2 }, shapes: 2, minPieces: 9, maxPieces: 11, hubs: 1, maxWidth: 3, maxHeight: 4 },
  { label: "F hub fuller", spec: { width: 3, height: 5, shapes: 2, pathLength: 7, maxHubCapacity: 2 }, shapes: 2, minPieces: 12, maxPieces: 14, hubs: 1, maxWidth: 3, maxHeight: 5 },
  { label: "G two hubs", spec: { width: 3, height: 5, shapes: 2, pathLength: 8, maxHubCapacity: 3 }, shapes: 2, minPieces: 12, maxPieces: 15, hubs: 2, maxWidth: 3, maxHeight: 5 },
];

function matches(level: Level, goal: Goal): boolean {
  if (level.width > goal.maxWidth || level.height > goal.maxHeight) return false;
  if (shapesIn(level).length !== goal.shapes) return false;
  const pieces = level.cells.filter((c) => c.kind !== "empty").length;
  if (pieces < goal.minPieces || pieces > goal.maxPieces) return false;
  const hubs = level.cells.filter((c) => c.kind === "hub").length;
  return hubs === goal.hubs;
}

for (const goal of goals) {
  const rng = mulberry32(20260808);
  const found: string[] = [];

  for (let i = 0; i < 200_000 && found.length < 3; i++) {
    const level = generateCandidate(goal.spec, rng, "hunt");
    if (!level || !matches(level, goal)) continue;

    const { solutions, exhausted } = solve(level, { limit: 2, maxNodes: 200_000 });
    if (exhausted || solutions.length !== 1) continue;

    const rows = formatLevel(level);
    const signature = rows.join("/");
    if (found.includes(signature)) continue;
    found.push(signature);
    console.log(`${goal.label}  ${level.width}x${level.height}`);
    console.log(`  ${JSON.stringify(rows)},`);
  }
  if (found.length === 0) console.log(`${goal.label}  -- none found`);
  console.log();
}
