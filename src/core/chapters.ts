import { type GenSpec, generateLevel, mulberry32 } from "./generator";
import { TUTORIAL_LEVELS, TUTORIAL_STAGES } from "./tutorial";
import type { Level } from "./types";

export const CHAPTER_COUNT = 20;
export const STAGES_PER_CHAPTER = 32;
export const DAILY_STAGES = 32;

/** Stages solved in a chapter before the next one opens. */
export const CHAPTER_UNLOCK_THRESHOLD = 20;

interface Band {
  width: number;
  height: number;
  shapes: number;
  /** Path length at stage 1 and at stage 32; stages interpolate between them. */
  lenMin: number;
  lenMax: number;
  hub: number;
  /** Smallest board worth shipping, so a stalled walk is retried. */
  minPieces: number;
  /**
   * Least search the solver must burn proving the board unique. This is the
   * difficulty dial that matters: without it the generator happily ships
   * boards whose only route is forced, which play as busywork rather than
   * puzzles. Measured per chapter rather than guessed.
   */
  minNodes: number;
}

/**
 * The difficulty ramp.
 *
 * Chapters 1-5 stay three columns wide. The third colour arrives at chapter 6,
 * and only then do boards start to grow.
 *
 * Path length deliberately stays moderate throughout. Benchmarking showed that
 * pushing it high relative to the board is what makes generation slow *and*
 * ambiguous — a long line has too many equivalent routings. Difficulty instead
 * comes from area, line count and hub traffic, which is also the more
 * interesting kind of hard: more constraints interacting, not more spaghetti.
 */
const CHAPTERS: Band[] = [
  // Chapter 1's first twelve stages are the authored tutorial; these bands
  // cover what follows, so they pick up where the teaching left off rather
  // than dropping back to trivial boards.
  { width: 3, height: 4, shapes: 2, lenMin: 6, lenMax: 7, hub: 2, minPieces: 10, minNodes: 80 },
  { width: 3, height: 5, shapes: 2, lenMin: 6, lenMax: 8, hub: 2, minPieces: 11, minNodes: 130 },
  { width: 3, height: 5, shapes: 2, lenMin: 7, lenMax: 8, hub: 3, minPieces: 12, minNodes: 190 },
  { width: 3, height: 5, shapes: 2, lenMin: 8, lenMax: 9, hub: 3, minPieces: 13, minNodes: 250 },
  { width: 3, height: 5, shapes: 2, lenMin: 8, lenMax: 9, hub: 3, minPieces: 14, minNodes: 320 },
  // Third colour.
  { width: 3, height: 5, shapes: 3, lenMin: 5, lenMax: 6, hub: 3, minPieces: 12, minNodes: 370 },
  { width: 3, height: 5, shapes: 3, lenMin: 6, lenMax: 7, hub: 3, minPieces: 13, minNodes: 400 },
  { width: 4, height: 5, shapes: 2, lenMin: 8, lenMax: 9, hub: 3, minPieces: 13, minNodes: 430 },
  { width: 4, height: 5, shapes: 3, lenMin: 6, lenMax: 7, hub: 3, minPieces: 14, minNodes: 460 },
  { width: 4, height: 5, shapes: 3, lenMin: 7, lenMax: 8, hub: 3, minPieces: 15, minNodes: 490 },
  { width: 4, height: 6, shapes: 3, lenMin: 6, lenMax: 7, hub: 3, minPieces: 15, minNodes: 520 },
  { width: 4, height: 6, shapes: 3, lenMin: 7, lenMax: 7, hub: 3, minPieces: 16, minNodes: 545 },
  { width: 5, height: 5, shapes: 3, lenMin: 7, lenMax: 7, hub: 3, minPieces: 16, minNodes: 570 },
  { width: 5, height: 5, shapes: 3, lenMin: 7, lenMax: 8, hub: 3, minPieces: 17, minNodes: 590 },
  { width: 5, height: 6, shapes: 3, lenMin: 7, lenMax: 7, hub: 3, minPieces: 17, minNodes: 610 },
  { width: 5, height: 6, shapes: 3, lenMin: 7, lenMax: 8, hub: 3, minPieces: 18, minNodes: 630 },
  { width: 5, height: 6, shapes: 3, lenMin: 8, lenMax: 8, hub: 3, minPieces: 18, minNodes: 650 },
  { width: 5, height: 6, shapes: 3, lenMin: 8, lenMax: 9, hub: 3, minPieces: 19, minNodes: 670 },
  { width: 6, height: 6, shapes: 3, lenMin: 8, lenMax: 8, hub: 3, minPieces: 19, minNodes: 690 },
  { width: 6, height: 6, shapes: 3, lenMin: 8, lenMax: 9, hub: 3, minPieces: 20, minNodes: 710 },
];

/**
 * Daily puzzles are hard, but hard has to stay *readable*. A 5x6 board with
 * three colours is mostly clutter — the difficulty stops being a puzzle and
 * starts being a search. Four columns keeps every piece in one glance while
 * the third colour and hub traffic supply the challenge.
 */
const DAILY_BAND: Band = {
  width: 4,
  height: 6,
  shapes: 3,
  lenMin: 6,
  lenMax: 8,
  hub: 3,
  minPieces: 14,
  minNodes: 700,
};

function bandSpec(band: Band, progress: number): GenSpec {
  const span = band.lenMax - band.lenMin;
  return {
    width: band.width,
    height: band.height,
    shapes: band.shapes,
    pathLength: band.lenMin + Math.round(span * progress),
    maxHubCapacity: band.hub,
  };
}

/** FNV-1a, so a level id always maps to the same puzzle for every player. */
function hashString(text: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/**
 * Generation can fail — a random walk paints itself into a corner, or the board
 * it produces turns out ambiguous. Rather than risk a level that never appears,
 * this relaxes the spec in fixed steps and finally falls back to a board that
 * effectively always succeeds. Every step is derived from the seed, so the
 * result stays identical on every device.
 */
function generateDeterministic(
  spec: GenSpec,
  band: Pick<Band, "minPieces" | "minNodes">,
  seed: number,
  id: string,
): Level {
  for (let relax = 0; relax < 4; relax++) {
    const relaxed: GenSpec = {
      ...spec,
      pathLength: Math.max(4, spec.pathLength - Math.max(0, relax - 1)),
    };
    // Both bars ease as the search gets desperate, so a stubborn seed degrades
    // gently instead of dropping all the way to the trivial fallback.
    const nodeFloor = Math.round(band.minNodes * (1 - relax * 0.28));
    const pieceFloor = band.minPieces - relax;

    for (let attempt = 0; attempt < 4; attempt++) {
      const rng = mulberry32(seed + relax * 7717 + attempt * 104729);
      // Tight, deterministic budgets: a spec that resists is relaxed rather
      // than ground away at, which is what keeps the worst case bounded.
      const level = generateLevel(relaxed, rng, id, {
        attempts: 150,
        maxNodes: 90_000,
        minSearchNodes: nodeFloor,
      });
      if (!level) continue;
      const pieces = level.cells.filter((c) => c.kind !== "empty").length;
      if (pieces >= pieceFloor) return level;
    }
  }

  // Last resort at the right size: drop the difficulty floor entirely rather
  // than the board. An easy chapter-20 stage is a disappointment; a trivial
  // 3x4 one in its place is a bug the player can see.
  const atSize = generateLevel(spec, mulberry32(seed ^ 0x2545f491), id, {
    attempts: 900,
    maxNodes: 90_000,
  });
  if (atSize) return atSize;

  const fallback = generateLevel(
    { width: 3, height: 4, shapes: 1, pathLength: 7, maxHubCapacity: 2 },
    mulberry32(seed ^ 0x5f3759df),
    id,
    { attempts: 4000 },
  );
  if (fallback) return fallback;
  throw new Error(`could not generate level ${id}`);
}

const cache = new Map<string, Level>();

function cached(key: string, build: () => Level): Level {
  const hit = cache.get(key);
  if (hit) return hit;
  const level = build();
  cache.set(key, level);
  return level;
}

export function classicId(chapter: number, stage: number): string {
  return `c${chapter}-s${stage}`;
}

export function dailyId(dayKey: string, stage: number): string {
  return `d${dayKey}-s${stage}`;
}

/** Local calendar date, so the daily set turns over at the player's midnight. */
export function todayKey(date = new Date()): string {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

export function classicLevel(chapter: number, stage: number): Level {
  // The authored opening is returned as-is; it is the one part of the
  // catalogue that is designed rather than searched for.
  if (chapter === 1 && stage <= TUTORIAL_STAGES) return TUTORIAL_LEVELS[stage - 1];

  const id = classicId(chapter, stage);
  return cached(id, () => {
    const band = CHAPTERS[Math.min(CHAPTERS.length, Math.max(1, chapter)) - 1];
    // Chapter 1's generated stages start after the tutorial, so the ramp is
    // measured across the stages that are actually generated.
    const offset = chapter === 1 ? TUTORIAL_STAGES : 0;
    const span = STAGES_PER_CHAPTER - offset - 1;
    const progress = span <= 0 ? 1 : (stage - offset - 1) / span;
    return generateDeterministic(bandSpec(band, progress), band, hashString(id), id);
  });
}

export function dailyLevel(dayKey: string, stage: number): Level {
  const id = dailyId(dayKey, stage);
  return cached(id, () => {
    const progress = (stage - 1) / (DAILY_STAGES - 1);
    return generateDeterministic(
      bandSpec(DAILY_BAND, progress),
      DAILY_BAND,
      hashString(id),
      id,
    );
  });
}
