import { writeFileSync } from "node:fs";
import { type GenSpec, generateLevel, mulberry32 } from "../src/core/generator";
import { formatLevel } from "../src/core/level";
import { solve } from "../src/core/solver";
import { TUTORIAL_LEVELS } from "../src/levels/tutorial";

/**
 * Difficulty ramp. The board is capped at 3 columns x 5 rows so it stays a
 * single thumb-reachable object in portrait — every tier grows downward or
 * adds a line rather than widening.
 */
const TIERS: { count: number; spec: GenSpec; minPieces: number }[] = [
  {
    count: 5,
    minPieces: 6,
    spec: { width: 3, height: 3, shapes: 1, pathLength: 6, maxHubCapacity: 2 },
  },
  {
    count: 5,
    minPieces: 8,
    spec: { width: 3, height: 4, shapes: 1, pathLength: 9, maxHubCapacity: 2 },
  },
  {
    count: 6,
    minPieces: 9,
    spec: { width: 3, height: 4, shapes: 2, pathLength: 6, maxHubCapacity: 3 },
  },
  {
    count: 7,
    minPieces: 11,
    spec: { width: 3, height: 5, shapes: 2, pathLength: 8, maxHubCapacity: 3 },
  },
  {
    count: 7,
    minPieces: 12,
    spec: { width: 3, height: 5, shapes: 3, pathLength: 6, maxHubCapacity: 3 },
  },
];

// Verify the hand-authored levels before spending time generating.
let tutorialProblems = 0;
for (const level of TUTORIAL_LEVELS) {
  const { solutions, exhausted } = solve(level, { limit: 3 });
  const ok = !exhausted && solutions.length === 1;
  if (!ok) tutorialProblems++;
  console.log(
    `tutorial ${level.id}: ${solutions.length} solution(s)` +
      (ok ? "" : "  <-- NOT UNIQUE"),
  );
}
if (tutorialProblems > 0) {
  console.log(`\n${tutorialProblems} tutorial level(s) need fixing.\n`);
}

const rng = mulberry32(20260807);
const emitted: { id: string; rows: string[] }[] = [];
let index = 0;

for (const [tierIdx, tier] of TIERS.entries()) {
  let made = 0;
  let guard = 0;
  while (made < tier.count && guard < tier.count * 12) {
    guard++;
    const id = `2-${++index}`;
    const started = Date.now();
    const level = generateLevel(tier.spec, rng, id, { attempts: 1500 });
    if (!level) {
      index--;
      console.log(`tier ${tierIdx}: attempt exhausted (${Date.now() - started}ms)`);
      continue;
    }
    // A walk that stalls early leaves a board too small to be a puzzle, and
    // trimming empty edges shrinks it further. Discard those outright.
    const pieces = level.cells.filter((c) => c.kind !== "empty").length;
    if (pieces < tier.minPieces) {
      index--;
      continue;
    }

    const rows = formatLevel(level);
    const signature = rows.join("/");
    if (emitted.some((e) => e.rows.join("/") === signature)) {
      index--;
      continue;
    }
    emitted.push({ id, rows });
    made++;
    console.log(
      `tier ${tierIdx} -> ${id}  ${level.width}x${level.height}  ${Date.now() - started}ms`,
    );
  }
}

const body = emitted
  .map(
    (e) =>
      `  parseLevel(${JSON.stringify(e.id)}, [\n` +
      e.rows.map((r) => `    ${JSON.stringify(r)},`).join("\n") +
      `\n  ]),`,
  )
  .join("\n");

const source = `// GENERATED FILE - do not edit by hand.
// Regenerate with: npm run gen
// Every level below was verified to have exactly one solution.
import { parseLevel } from "../core/level";
import type { Level } from "../core/types";

export const GENERATED_LEVELS: Level[] = [
${body}
];
`;

writeFileSync(new URL("../src/levels/generated.ts", import.meta.url), source);
console.log(`\nWrote ${emitted.length} generated levels.`);
