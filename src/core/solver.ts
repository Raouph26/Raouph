import { type CellIndex, type Level, type ShapeId } from "./types";
import { shapesIn, terminalsOf } from "./level";
import {
  type Paths,
  clonePaths,
  computeOccupancy,
  isShapeComplete,
  legalMoves,
} from "./rules";

export interface SolveOptions {
  /** Stop once this many solutions are found. Use 2 to test uniqueness cheaply. */
  limit?: number;
  /** Safety valve so a pathological board can never hang the generator. */
  maxNodes?: number;
}

export interface SolveResult {
  solutions: Paths[];
  /** True when the search hit `maxNodes` and the result may be incomplete. */
  exhausted: boolean;
  nodesVisited: number;
}

/**
 * Exhaustive backtracking search over one line at a time.
 *
 * Each line is searched from its lower-indexed terminal only: a path and its
 * reverse are the same solution, so fixing the direction keeps the solution
 * count honest instead of inflating it by 2^lines.
 */
export function solve(level: Level, options: SolveOptions = {}): SolveResult {
  const limit = options.limit ?? Infinity;
  const maxNodes = options.maxNodes ?? 2_000_000;

  const shapes = shapesIn(level);
  const endpoints = new Map<ShapeId, [CellIndex, CellIndex]>();
  for (const shape of shapes) {
    const ends = terminalsOf(level, shape);
    if (ends.length !== 2) {
      throw new Error(
        `level ${level.id}: shape ${shape} has ${ends.length} terminals, expected 2`,
      );
    }
    const [a, b] = ends;
    endpoints.set(shape, a < b ? [a, b] : [b, a]);
  }

  const hubs = level.cells
    .map((cell, i) => (cell.kind === "hub" ? i : -1))
    .filter((i) => i >= 0);

  const solutions: Paths[] = [];
  const paths: Paths = new Map();
  let nodesVisited = 0;
  let exhausted = false;

  function hubsSatisfied(): boolean {
    const { hubPasses } = computeOccupancy(level, paths);
    return hubs.every((i) => {
      const cell = level.cells[i];
      return cell.kind === "hub" && (hubPasses.get(i) ?? 0) === cell.capacity;
    });
  }

  function searchShape(shapeIdx: number): void {
    if (solutions.length >= limit || exhausted) return;

    if (shapeIdx === shapes.length) {
      if (hubsSatisfied()) solutions.push(clonePaths(paths));
      return;
    }

    const shape = shapes[shapeIdx];
    const [start, goal] = endpoints.get(shape)!;
    paths.set(shape, [start]);
    extend(shapeIdx, shape, goal);
    paths.delete(shape);
  }

  function extend(shapeIdx: number, shape: ShapeId, goal: CellIndex): void {
    if (solutions.length >= limit || exhausted) return;
    if (++nodesVisited > maxNodes) {
      exhausted = true;
      return;
    }

    const path = paths.get(shape)!;
    const head = path[path.length - 1];

    if (head === goal) {
      // Terminals close a line, so this branch either solves the shape or dies.
      if (isShapeComplete(level, paths, shape)) searchShape(shapeIdx + 1);
      return;
    }

    for (const to of legalMoves(level, paths, shape)) {
      path.push(to);
      extend(shapeIdx, shape, goal);
      path.pop();
      if (solutions.length >= limit || exhausted) return;
    }
  }

  searchShape(0);
  return { solutions, exhausted, nodesVisited };
}

/** Convenience wrapper: does exactly one distinct solution exist? */
export function hasUniqueSolution(level: Level): boolean {
  const { solutions, exhausted } = solve(level, { limit: 2 });
  return !exhausted && solutions.length === 1;
}
