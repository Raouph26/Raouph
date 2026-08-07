import {
  type CellIndex,
  type GridSize,
  type Level,
  type ShapeId,
  inBounds,
  xOf,
  yOf,
} from "./types";
import { nodeCount, shapesIn } from "./level";

/** One drawn line per shape, as an ordered list of cells from terminal to terminal. */
export type Paths = Map<ShapeId, CellIndex[]>;

export function emptyPaths(): Paths {
  return new Map();
}

export function clonePaths(paths: Paths): Paths {
  return new Map([...paths].map(([shape, path]) => [shape, [...path]]));
}

/**
 * Segments are undirected, so both traversal orders must hash the same.
 * Boards stay far below 2^16 cells, so this packs into a plain number.
 */
export function segKey(a: CellIndex, b: CellIndex): number {
  return a < b ? a * 65536 + b : b * 65536 + a;
}

export function isDiagonal(grid: GridSize, a: CellIndex, b: CellIndex): boolean {
  return xOf(grid, a) !== xOf(grid, b) && yOf(grid, a) !== yOf(grid, b);
}

export function areAdjacent(grid: GridSize, a: CellIndex, b: CellIndex): boolean {
  const dx = Math.abs(xOf(grid, a) - xOf(grid, b));
  const dy = Math.abs(yOf(grid, a) - yOf(grid, b));
  return dx <= 1 && dy <= 1 && dx + dy > 0;
}

/**
 * The diagonal that would visually cross `a`-`b`. Two lines may never cross
 * except at a hub, so a diagonal move is blocked when its twin is already drawn.
 * Returns null for orthogonal moves, which can never cross anything.
 */
export function crossingSegment(
  grid: GridSize,
  a: CellIndex,
  b: CellIndex,
): number | null {
  if (!isDiagonal(grid, a, b)) return null;
  const ax = xOf(grid, a);
  const ay = yOf(grid, a);
  const bx = xOf(grid, b);
  const by = yOf(grid, b);
  // The other two corners of the 2x2 block a and b span.
  if (!inBounds(grid, ax, by) || !inBounds(grid, bx, ay)) return null;
  return segKey(by * grid.width + ax, ay * grid.width + bx);
}

export interface Occupancy {
  /** Every segment drawn by any path. */
  segments: Set<number>;
  /** How many times each hub cell has been crossed so far. */
  hubPasses: Map<CellIndex, number>;
}

/**
 * Recomputed from scratch after each move. Boards are tiny, and a derived
 * snapshot is far harder to desync than incrementally maintained counters.
 */
export function computeOccupancy(level: Level, paths: Paths): Occupancy {
  const segments = new Set<number>();
  const hubPasses = new Map<CellIndex, number>();

  for (const path of paths.values()) {
    for (const [i, cell] of path.entries()) {
      if (i > 0) segments.add(segKey(path[i - 1], cell));
      if (level.cells[cell].kind === "hub") {
        hubPasses.set(cell, (hubPasses.get(cell) ?? 0) + 1);
      }
    }
  }
  return { segments, hubPasses };
}

/** True when this path can accept no further cells, i.e. it reached its far terminal. */
export function isPathClosed(level: Level, path: CellIndex[]): boolean {
  if (path.length < 2) return false;
  const head = level.cells[path[path.length - 1]];
  return head.kind === "node" && head.terminal;
}

/**
 * Whether the line for `shape` may be extended from its current head to `to`.
 * Every LYNE constraint that can be enforced *while drawing* lives here, so an
 * illegal board state is simply unreachable through play.
 */
export function canExtend(
  level: Level,
  paths: Paths,
  shape: ShapeId,
  to: CellIndex,
  occupancy = computeOccupancy(level, paths),
): boolean {
  const path = paths.get(shape);
  if (!path || path.length === 0) return false;
  if (isPathClosed(level, path)) return false;

  const from = path[path.length - 1];
  if (to === from) return false;
  if (to < 0 || to >= level.cells.length) return false;
  if (!areAdjacent(level, from, to)) return false;

  const target = level.cells[to];

  if (target.kind === "empty") return false;

  if (target.kind === "hub") {
    const used = occupancy.hubPasses.get(to) ?? 0;
    if (used >= target.capacity) return false;
  } else {
    // A line may only run through nodes of its own shape, each at most once.
    if (target.shape !== shape) return false;
    if (path.includes(to)) return false;
  }

  // No segment is ever drawn twice, by this line or any other.
  if (occupancy.segments.has(segKey(from, to))) return false;

  // Diagonals may not cross each other.
  const crossing = crossingSegment(level, from, to);
  if (crossing !== null && occupancy.segments.has(crossing)) return false;

  return true;
}

/** Cells the line for `shape` could legally move to right now. */
export function legalMoves(
  level: Level,
  paths: Paths,
  shape: ShapeId,
): CellIndex[] {
  const occupancy = computeOccupancy(level, paths);
  const path = paths.get(shape);
  if (!path || path.length === 0) return [];

  const from = path[path.length - 1];
  const fx = xOf(level, from);
  const fy = yOf(level, from);
  const out: CellIndex[] = [];

  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (dx === 0 && dy === 0) continue;
      const x = fx + dx;
      const y = fy + dy;
      if (!inBounds(level, x, y)) continue;
      const to = y * level.width + x;
      if (canExtend(level, paths, shape, to, occupancy)) out.push(to);
    }
  }
  return out;
}

/** A line is solved when it runs terminal-to-terminal over every node of its shape. */
export function isShapeComplete(
  level: Level,
  paths: Paths,
  shape: ShapeId,
): boolean {
  const path = paths.get(shape);
  if (!path || path.length < 2) return false;

  const start = level.cells[path[0]];
  const end = level.cells[path[path.length - 1]];
  if (start.kind !== "node" || !start.terminal) return false;
  if (end.kind !== "node" || !end.terminal) return false;
  if (path[0] === path[path.length - 1]) return false;

  const visited = new Set<CellIndex>();
  for (const cell of path) {
    if (level.cells[cell].kind === "node") visited.add(cell);
  }
  return visited.size === nodeCount(level, shape);
}

/** Every line solved and every hub crossed exactly as many times as its dots demand. */
export function isSolved(level: Level, paths: Paths): boolean {
  for (const shape of shapesIn(level)) {
    if (!isShapeComplete(level, paths, shape)) return false;
  }

  const { hubPasses } = computeOccupancy(level, paths);
  for (const [i, cell] of level.cells.entries()) {
    if (cell.kind !== "hub") continue;
    if ((hubPasses.get(i) ?? 0) !== cell.capacity) return false;
  }
  return true;
}
