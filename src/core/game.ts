import { type CellIndex, type Level, type ShapeId } from "./types";
import { shapesIn } from "./level";
import {
  type Occupancy,
  type Paths,
  canExtend,
  computeOccupancy,
  emptyPaths,
  isShapeComplete,
  isSolved,
} from "./rules";

/** What a single input action changed, so the renderer/audio can react. */
export type MoveEffect = "none" | "start" | "extend" | "retract" | "truncate";

/**
 * Interactive state for one puzzle.
 *
 * Every mutation goes through the same legality rules the solver uses, so the
 * board can never reach a state the rules would reject — there is no separate
 * "validate at the end" pass, and therefore no way to draw an illegal line.
 */
export class Game {
  readonly level: Level;
  readonly shapes: ShapeId[];
  paths: Paths = emptyPaths();
  /** The line currently being dragged, if any. */
  activeShape: ShapeId | null = null;

  constructor(level: Level) {
    this.level = level;
    this.shapes = shapesIn(level);
  }

  reset(): void {
    this.paths = emptyPaths();
    this.activeShape = null;
  }

  pathFor(shape: ShapeId): CellIndex[] {
    return this.paths.get(shape) ?? [];
  }

  occupancy(): Occupancy {
    return computeOccupancy(this.level, this.paths);
  }

  isShapeComplete(shape: ShapeId): boolean {
    return isShapeComplete(this.level, this.paths, shape);
  }

  get solved(): boolean {
    return isSolved(this.level, this.paths);
  }

  /**
   * Press down on `cell`.
   *
   * Pressing a terminal starts that line over from there. Pressing a node
   * already on its own line grabs the line at that point and cuts everything
   * after it, which is how you unwind a wrong turn without clearing the whole
   * thing. Hubs are deliberately not grabbable: a shared hub belongs to more
   * than one line, so there is no unambiguous line to pick up.
   */
  beginAt(cell: CellIndex): MoveEffect {
    const target = this.level.cells[cell];
    if (target.kind !== "node") return "none";

    if (target.terminal) {
      this.activeShape = target.shape;
      this.paths.set(target.shape, [cell]);
      return "start";
    }

    const path = this.paths.get(target.shape);
    if (!path) return "none";
    const at = path.lastIndexOf(cell);
    if (at < 0) return "none";

    this.activeShape = target.shape;
    if (at === path.length - 1) return "none";
    path.length = at + 1;
    return "truncate";
  }

  /** Drag onto `cell`. Dragging back onto the previous cell retracts one step. */
  dragTo(cell: CellIndex): MoveEffect {
    const shape = this.activeShape;
    if (shape === null) return "none";

    const path = this.paths.get(shape);
    if (!path || path.length === 0) return "none";
    if (cell === path[path.length - 1]) return "none";

    if (path.length >= 2 && cell === path[path.length - 2]) {
      path.pop();
      return "retract";
    }

    if (canExtend(this.level, this.paths, shape, cell)) {
      path.push(cell);
      return "extend";
    }
    return "none";
  }

  release(): void {
    this.activeShape = null;
  }
}
