/** A puzzle uses at most three shape families. */
export type ShapeId = 0 | 1 | 2;

export const SHAPE_IDS: readonly ShapeId[] = [0, 1, 2];

/** Cells are addressed by a flat row-major index into the board. */
export type CellIndex = number;

export type Cell =
  | { kind: "empty" }
  /** A stop on one shape's path. `terminal` marks the two endpoints. */
  | { kind: "node"; shape: ShapeId; terminal: boolean }
  /** Neutral crossing point. Exactly `capacity` passes must run through it. */
  | { kind: "hub"; capacity: number };

export interface Level {
  id: string;
  width: number;
  height: number;
  /** Row-major, length === width * height. */
  cells: Cell[];
}

export const EMPTY: Cell = { kind: "empty" };

/**
 * Geometry only depends on the board's dimensions, so these helpers accept a
 * bare size. That lets the generator do coordinate math before it has decided
 * what any of the cells actually contain.
 */
export interface GridSize {
  width: number;
  height: number;
}

export function xOf(grid: GridSize, i: CellIndex): number {
  return i % grid.width;
}

export function yOf(grid: GridSize, i: CellIndex): number {
  return Math.floor(i / grid.width);
}

export function indexOf(grid: GridSize, x: number, y: number): CellIndex {
  return y * grid.width + x;
}

export function inBounds(grid: GridSize, x: number, y: number): boolean {
  return x >= 0 && y >= 0 && x < grid.width && y < grid.height;
}
