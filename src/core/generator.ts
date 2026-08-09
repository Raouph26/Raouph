import {
  type Cell,
  type CellIndex,
  type GridSize,
  type Level,
  type ShapeId,
  EMPTY,
  inBounds,
  xOf,
  yOf,
} from "./types";
import { crossingSegment, segKey } from "./rules";
import { assertWellFormed } from "./level";
import { solve } from "./solver";

export interface GenSpec {
  width: number;
  height: number;
  /** How many lines the puzzle contains, 1-3. */
  shapes: number;
  /** Target cells per line. Longer lines mean denser, harder boards. */
  pathLength: number;
  /** Largest dot count a hub may show. */
  maxHubCapacity?: number;
}

/** Deterministic PRNG so a seed always yields the same puzzle. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pick<T>(rng: () => number, items: T[]): T {
  return items[Math.floor(rng() * items.length)];
}

/**
 * Builds a puzzle by *drawing its own solution first*, then reading the board
 * off that drawing.
 *
 * Each line is a random walk that already obeys every play rule, so a solution
 * is guaranteed to exist. Cells touched once become nodes of that line; cells
 * touched more than once — by one line doubling back, or by two lines meeting —
 * become hubs whose dot count is exactly the number of passes. Endpoints are
 * kept single-use so they can be terminals.
 *
 * Returns null when the walk paints itself into a corner, which is common and
 * simply means "retry with another seed".
 */
export function generateCandidate(
  spec: GenSpec,
  rng: () => number,
  id: string,
): Level | null {
  const grid: GridSize = { width: spec.width, height: spec.height };
  const size = spec.width * spec.height;
  const maxHub = spec.maxHubCapacity ?? 3;

  const passes = new Int32Array(size);
  const isEndpoint = new Uint8Array(size);
  const owner = new Int32Array(size).fill(-1);
  const segments = new Set<number>();

  for (let shape = 0; shape < spec.shapes; shape++) {
    const starts: CellIndex[] = [];
    for (let i = 0; i < size; i++) if (passes[i] === 0) starts.push(i);
    if (starts.length === 0) return null;

    const start = pick(rng, starts);
    const walk: CellIndex[] = [start];
    const localSegments: number[] = [];
    /** Visits made by *this* walk so far, on top of earlier lines' passes. */
    const local = new Int32Array(size);
    local[start] = 1;

    while (walk.length < spec.pathLength) {
      const head = walk[walk.length - 1];
      const hx = xOf(grid, head);
      const hy = yOf(grid, head);
      const options: CellIndex[] = [];

      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (dx === 0 && dy === 0) continue;
          const x = hx + dx;
          const y = hy + dy;
          if (!inBounds(grid, x, y)) continue;
          const to = y * spec.width + x;

          // Terminals — this line's start, or any earlier line's endpoint —
          // must stay single-use so they can render as terminals, not hubs.
          if (to === start || isEndpoint[to]) continue;

          // A cell may be crossed repeatedly, but only up to the dot cap, and
          // the count spans this walk plus every line already drawn.
          if (passes[to] + local[to] + 1 > maxHub) continue;

          const key = segKey(head, to);
          if (segments.has(key)) continue;
          const cross = crossingSegment(grid, head, to);
          if (cross !== null && segments.has(cross)) continue;

          options.push(to);
        }
      }

      if (options.length === 0) break;
      const next = pick(rng, options);
      const key = segKey(head, next);
      segments.add(key);
      localSegments.push(key);
      local[next] += 1;
      walk.push(next);
    }

    // A line needs both endpoints to be exclusively its own.
    const end = walk[walk.length - 1];
    if (walk.length < 3 || end === start || passes[end] > 0 || local[end] !== 1) {
      for (const key of localSegments) segments.delete(key);
      return null;
    }

    isEndpoint[start] = 1;
    isEndpoint[end] = 1;
    for (const cell of walk) {
      passes[cell] += 1;
      owner[cell] = owner[cell] === -1 || owner[cell] === shape ? shape : -2;
    }
  }

  const cells: Cell[] = [];
  for (let i = 0; i < size; i++) {
    const used = passes[i];
    if (used === 0) {
      cells.push(EMPTY);
    } else if (used === 1) {
      cells.push({
        kind: "node",
        shape: owner[i] as ShapeId,
        terminal: isEndpoint[i] === 1,
      });
    } else {
      cells.push({ kind: "hub", capacity: used });
    }
  }

  const level: Level = { id, width: spec.width, height: spec.height, cells };
  try {
    assertWellFormed(level);
  } catch {
    // A walk that swallowed one of its own terminals produces a shape with the
    // wrong terminal count. Cheaper to discard than to repair.
    return null;
  }
  return trimEmptyEdges(level);
}

/** Crops fully-empty border rows and columns so puzzles fill the screen. */
export function trimEmptyEdges(level: Level): Level | null {
  let minX = level.width;
  let minY = level.height;
  let maxX = -1;
  let maxY = -1;

  for (const [i, cell] of level.cells.entries()) {
    if (cell.kind === "empty") continue;
    const x = xOf(level, i);
    const y = yOf(level, i);
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);
  }
  if (maxX < 0) return null;

  const width = maxX - minX + 1;
  const height = maxY - minY + 1;
  const cells: Cell[] = [];
  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) cells.push(level.cells[y * level.width + x]);
  }
  return { id: level.id, width, height, cells };
}

export interface GenerateOptions {
  attempts?: number;
  /** Reject boards with more than one solution. */
  requireUnique?: boolean;
  /** Search ceiling per candidate. Bounds work without consulting the clock. */
  maxNodes?: number;
  /**
   * Reject boards the solver finds too easily.
   *
   * The nodes an exhaustive search burns proving a board has exactly one answer
   * is a decent proxy for how much the player must think: a board with one
   * forced route is found immediately, while one demanding real deduction makes
   * the search backtrack. This is what stops trivial puzzles shipping.
   */
  minSearchNodes?: number;
}

/**
 * Retries `generateCandidate` until one survives the solver.
 *
 * Both limits are counted in work, never in elapsed time. Levels are generated
 * on the player's device, and a wall-clock budget would let a slow phone give
 * up sooner than a fast one — producing a different puzzle for the same level
 * id. Counting attempts and search nodes keeps every device in agreement.
 */
export function generateLevel(
  spec: GenSpec,
  rng: () => number,
  id: string,
  options: GenerateOptions = {},
): Level | null {
  const attempts = options.attempts ?? 400;
  const requireUnique = options.requireUnique ?? true;
  const maxNodes = options.maxNodes ?? 120_000;

  for (let i = 0; i < attempts; i++) {
    const level = generateCandidate(spec, rng, id);
    if (!level) continue;

    const { solutions, exhausted, nodesVisited } = solve(level, {
      limit: requireUnique ? 2 : 1,
      maxNodes,
    });
    if (exhausted || solutions.length === 0) continue;
    if (requireUnique && solutions.length !== 1) continue;
    if (nodesVisited < (options.minSearchNodes ?? 0)) continue;
    return level;
  }
  return null;
}
