import {
  CHAPTER_COUNT,
  DAILY_STAGES,
  STAGES_PER_CHAPTER,
  classicLevel,
  dailyLevel,
  todayKey,
} from "../src/core/chapters";
import { solve } from "../src/core/solver";

/**
 * Every classic and daily level is built on the player's device, so this walks
 * the whole catalogue once: it must never throw, never be slow enough to feel
 * like a hitch, and never produce an ambiguous board.
 */
const problems: string[] = [];
let worst = { id: "", ms: 0 };
const times: number[] = [];

function check(id: string, build: () => ReturnType<typeof classicLevel>): void {
  const started = performance.now();
  let level;
  try {
    level = build();
  } catch (err) {
    problems.push(`${id}: threw ${(err as Error).message}`);
    return;
  }
  const ms = performance.now() - started;
  times.push(ms);
  if (ms > worst.ms) worst = { id, ms };

  const { solutions, exhausted } = solve(level, { limit: 2 });
  if (exhausted) problems.push(`${id}: solver exhausted`);
  else if (solutions.length !== 1) {
    problems.push(`${id}: ${solutions.length} solutions (${level.width}x${level.height})`);
  }
}

for (let chapter = 1; chapter <= CHAPTER_COUNT; chapter++) {
  const started = performance.now();
  for (let stage = 1; stage <= STAGES_PER_CHAPTER; stage++) {
    check(`c${chapter}-s${stage}`, () => classicLevel(chapter, stage));
  }
  console.log(
    `chapter ${String(chapter).padStart(2)}  ${(performance.now() - started).toFixed(0).padStart(6)}ms for ${STAGES_PER_CHAPTER} stages`,
  );
}

const day = todayKey();
const dailyStarted = performance.now();
for (let stage = 1; stage <= DAILY_STAGES; stage++) {
  check(`daily-s${stage}`, () => dailyLevel(day, stage));
}
console.log(
  `daily ${day}  ${(performance.now() - dailyStarted).toFixed(0).padStart(6)}ms for ${DAILY_STAGES} stages`,
);

times.sort((a, b) => a - b);
const p50 = times[Math.floor(times.length * 0.5)];
const p95 = times[Math.floor(times.length * 0.95)];
console.log(
  `\n${times.length} levels   p50 ${p50.toFixed(1)}ms   p95 ${p95.toFixed(0)}ms   ` +
    `worst ${worst.ms.toFixed(0)}ms (${worst.id})`,
);

if (problems.length > 0) {
  console.error(`\n${problems.length} problem(s):`);
  for (const p of problems.slice(0, 30)) console.error(`  - ${p}`);
  process.exit(1);
}
console.log("All generated levels are unique-solution.");
