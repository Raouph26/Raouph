import { type Cell, type Level, type ShapeId, EMPTY } from "./types";

/**
 * Levels are authored as ASCII art so they stay readable in source:
 *
 *   `.`      empty cell
 *   `a b c`  plain node of shape 0 / 1 / 2
 *   `A B C`  terminal (endpoint) of shape 0 / 1 / 2
 *   `1`-`9`  hub that must be crossed exactly N times
 *
 * Whitespace between cells is optional, so both "Aa.b" and "A a . b" parse.
 */
export function parseLevel(id: string, rows: string[]): Level {
  const grids = rows.map((r) => [...r.replace(/\s+/g, "")]);
  const width = grids[0]?.length ?? 0;
  if (width === 0) throw new Error(`level ${id}: empty`);
  for (const [y, row] of grids.entries()) {
    if (row.length !== width) {
      throw new Error(
        `level ${id}: row ${y} has ${row.length} cells, expected ${width}`,
      );
    }
  }

  const cells: Cell[] = [];
  for (const row of grids) {
    for (const ch of row) cells.push(parseCell(id, ch));
  }

  const level: Level = { id, width, height: grids.length, cells };
  assertWellFormed(level);
  return level;
}

function parseCell(id: string, ch: string): Cell {
  if (ch === ".") return EMPTY;

  const lower = "abc".indexOf(ch);
  if (lower >= 0) return { kind: "node", shape: lower as ShapeId, terminal: false };

  const upper = "ABC".indexOf(ch);
  if (upper >= 0) return { kind: "node", shape: upper as ShapeId, terminal: true };

  if (ch >= "1" && ch <= "9") return { kind: "hub", capacity: Number(ch) };

  throw new Error(`level ${id}: unknown cell character ${JSON.stringify(ch)}`);
}

/** Render a level back to ASCII — used by the generator and by test failures. */
export function formatLevel(level: Level): string[] {
  const rows: string[] = [];
  for (let y = 0; y < level.height; y++) {
    let row = "";
    for (let x = 0; x < level.width; x++) {
      const cell = level.cells[y * level.width + x];
      if (cell.kind === "empty") row += ".";
      else if (cell.kind === "hub") row += String(cell.capacity);
      else row += (cell.terminal ? "ABC" : "abc")[cell.shape];
    }
    rows.push(row);
  }
  return rows;
}

/** Every shape present must have exactly two terminals. */
export function assertWellFormed(level: Level): void {
  const terminals = new Map<ShapeId, number>();
  const nodes = new Map<ShapeId, number>();

  for (const cell of level.cells) {
    if (cell.kind !== "node") continue;
    nodes.set(cell.shape, (nodes.get(cell.shape) ?? 0) + 1);
    if (cell.terminal) terminals.set(cell.shape, (terminals.get(cell.shape) ?? 0) + 1);
  }

  for (const shape of nodes.keys()) {
    const count = terminals.get(shape) ?? 0;
    if (count !== 2) {
      throw new Error(
        `level ${level.id}: shape ${shape} has ${count} terminals, expected 2`,
      );
    }
  }
}

/** Shapes that actually appear on the board, ascending. */
export function shapesIn(level: Level): ShapeId[] {
  const seen = new Set<ShapeId>();
  for (const cell of level.cells) {
    if (cell.kind === "node") seen.add(cell.shape);
  }
  return [...seen].sort((a, b) => a - b);
}

export function terminalsOf(level: Level, shape: ShapeId): number[] {
  const out: number[] = [];
  level.cells.forEach((cell, i) => {
    if (cell.kind === "node" && cell.shape === shape && cell.terminal) out.push(i);
  });
  return out;
}

export function nodeCount(level: Level, shape: ShapeId): number {
  let n = 0;
  for (const cell of level.cells) {
    if (cell.kind === "node" && cell.shape === shape) n++;
  }
  return n;
}
