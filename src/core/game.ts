import type { CellIndex, Level, ShapeId } from "./types";
import { shapesIn } from "./level";
import {
  type Occupancy,
  type Paths,
  canExtend,
  computeOccupancy,
  emptyPaths,
  isPathClosed,
  isShapeComplete,
  isSolved,
} from "./rules";

/** What a single input action changed, so the renderer/audio can react. */
export type MoveEffect =
  | "none"
  | "start"
  | "extend"
  | "retract"
  | "truncate"
  /** Picked an unfinished line back up at its head to carry on drawing. */
  | "resume";

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
   * thing. Pressing the head of an unfinished line — piece or hub — simply
   * resumes it, so a line put down mid-draw can always be continued.
   */
  beginAt(cell: CellIndex): MoveEffect {
    const target = this.level.cells[cell];
    if (target.kind === "empty") return "none";

    // A line left resting on a hub can be picked up again from it. Only the
    // head is unambiguous: a hub in the middle of a line, or shared by two,
    // gives no way to tell which line was meant, so those stay ungrabbable.
    if (target.kind === "hub") {
      const resting = this.restingShapeAt(cell);
      if (resting === null) return "none";
      this.activeShape = resting;
      return "resume";
    }

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
    // Pressing the head resumes rather than truncates: there is nothing after
    // it to cut, and the player is asking to carry on from where they stopped.
    if (at === path.length - 1) return "resume";
    path.length = at + 1;
    return "truncate";
  }

  /** The one unfinished line whose head rests here, if exactly one does. */
  private restingShapeAt(cell: CellIndex): ShapeId | null {
    let found: ShapeId | null = null;
    for (const shape of this.shapes) {
      const path = this.paths.get(shape);
      if (!path || path.length === 0) continue;
      if (path[path.length - 1] !== cell) continue;
      if (isPathClosed(this.level, path)) continue;
      if (found !== null) return null;
      found = shape;
    }
    return found;
  }

  /**
   * Whether a press here would pick anything up. Used to snap a press to the
   * nearest thing that can actually be grabbed, rather than to the nearest
   * piece — which may be one the player cannot start from at all.
   */
  canGrabAt(cell: CellIndex): boolean {
    const target = this.level.cells[cell];
    if (target.kind === "empty") return false;
    if (target.kind === "hub") return this.restingShapeAt(cell) !== null;
    if (target.terminal) return true;
    return this.paths.get(target.shape)?.includes(cell) ?? false;
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
