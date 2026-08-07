import { writeFileSync } from "node:fs";
import { type GenSpec, generateLevel, mulberry32 } from "../src/core/generator";
import { formatLevel } from "../src/core/level";
import { solve } from "../src/core/solver";
import { TUTORIAL_LEVELS } from "../src/levels/tutorial";

/** Difficulty ramp: each tier widens the board and adds a line or hub traffic. */
const TIERS: { count: number; spec: GenSpec }[] = [
  { count: 4, spec: { width: 4, height: 4, shapes: 1, pathLength: 7, maxHubCapacity: 2 } },
  { count: 4, spec: { width: 5, height: 5, shapes: 2, pathLength: 7, maxHubCapacity: 2 } },
  { count: 5, spec: { width: 5, height: 5, shapes: 2, pathLength: 9, maxHubCapacity: 3 } },
  { count: 5, spec: { width: 6, height: 6, shapes: 2, pathLength: 12, maxHubCapacity: 3 } },
  { count: 6, spec: { width: 6, height: 6, shapes: 3, pathLength: 9, maxHubCapacity: 3 } },
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
