import type { Game } from "../core/game";
import type { CellIndex, Level, ShapeId } from "../core/types";
import { xOf, yOf } from "../core/types";

export const REDUCED_MOTION =
  typeof window !== "undefined" &&
  window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;

/** Milliseconds. Scaled to zero when the viewer asks for reduced motion. */
function duration(ms: number): number {
  return REDUCED_MOTION ? 0 : ms;
}

const APPEAR_MS = duration(460);
/** Delay per cell of distance from the board's centre, giving a radial bloom. */
const APPEAR_STAGGER_MS = duration(58);
const PULSE_MS = duration(620);
const SOLVE_MS = duration(1500);
/** One piece's full turn when its line closes. */
const SPIN_MS = duration(560);
/** Delay per piece along the line, so the turn travels rather than snapping. */
const SPIN_STAGGER_MS = duration(46);
/**
 * Time constant for the line catching up to the finger. Small enough to feel
 * immediate, large enough that the head glides instead of snapping.
 */
const LINE_TAU_MS = 52;

export function clamp01(t: number): number {
  return t < 0 ? 0 : t > 1 ? 1 : t;
}

export function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

export function easeOutBack(t: number): number {
  const c = 1.7;
  return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2);
}

export function easeInOutSine(t: number): number {
  return -(Math.cos(Math.PI * t) - 1) / 2;
}

export function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

/**
 * All animation state, kept entirely separate from the rules.
 *
 * Nothing here can affect whether a move is legal or a puzzle is solved — the
 * game is already correct the instant a move lands, and this layer only decides
 * how that truth is eased onto the screen.
 */
export class ViewState {
  private appearAt = 0;
  /** Animated point-count per line, chasing the real path length. */
  private lengths = new Map<ShapeId, number>();
  /** Detects a line being restarted, so its length resets instead of easing. */
  private firstCells = new Map<ShapeId, CellIndex>();
  /** Cell -> timestamp it was last reached, driving the ripple. */
  private pulses = new Map<CellIndex, number>();
  /** Shape -> timestamp its line closed, driving the confirmation spin. */
  private completions = new Map<ShapeId, number>();
  private solvedAt: number | null = null;

  reset(now: number): void {
    this.appearAt = now;
    this.lengths.clear();
    this.firstCells.clear();
    this.pulses.clear();
    this.completions.clear();
    this.solvedAt = null;
  }

  pulse(cell: CellIndex, now: number): void {
    this.pulses.set(cell, now);
  }

  markSolved(now: number): void {
    this.solvedAt ??= now;
  }

  clearSolved(): void {
    this.solvedAt = null;
  }

  /**
   * Eases every animated value toward the game's actual state, and reports any
   * line that closed this frame so the caller can sound it.
   */
  update(game: Game, now: number, dtMs: number): ShapeId[] {
    const justCompleted: ShapeId[] = [];

    for (const shape of game.shapes) {
      const complete = game.isShapeComplete(shape);
      if (complete && !this.completions.has(shape)) {
        this.completions.set(shape, now);
        justCompleted.push(shape);
      } else if (!complete && this.completions.has(shape)) {
        // Broken again by an edit; the spin should re-fire if it re-closes.
        this.completions.delete(shape);
      }
    }

    for (const shape of game.shapes) {
      const path = game.pathFor(shape);
      const target = path.length;
      const first = path[0];

      if (this.firstCells.get(shape) !== first) {
        // A restarted line should not sweep across the board from its old head.
        this.firstCells.set(shape, first);
        this.lengths.set(shape, Math.min(target, 1));
      }

      const current = this.lengths.get(shape) ?? target;
      if (REDUCED_MOTION) {
        this.lengths.set(shape, target);
        continue;
      }
      // Exponential approach: frame-rate independent, and never overshoots.
      const blend = 1 - Math.exp(-dtMs / LINE_TAU_MS);
      const next = current + (target - current) * blend;
      this.lengths.set(shape, Math.abs(target - next) < 0.002 ? target : next);
    }

    for (const [cell, at] of this.pulses) {
      if (now - at > PULSE_MS) this.pulses.delete(cell);
    }

    return justCompleted;
  }

  /**
   * Rotation in radians for a piece on a closed line. The turn travels from the
   * line's start to its end, so the confirmation reads as the line itself
   * acknowledging the connection rather than every piece twitching at once.
   */
  spinFor(shape: ShapeId, orderIndex: number, now: number): number {
    const at = this.completions.get(shape);
    if (at === undefined || SPIN_MS === 0) return 0;
    const elapsed = now - at - orderIndex * SPIN_STAGGER_MS;
    if (elapsed <= 0) return 0;
    const t = clamp01(elapsed / SPIN_MS);
    return easeInOutCubic(t) * Math.PI * 2;
  }

  private spinActive(game: Game, now: number): boolean {
    for (const [shape, at] of this.completions) {
      const span = SPIN_MS + game.pathFor(shape).length * SPIN_STAGGER_MS;
      if (now - at < span) return true;
    }
    return false;
  }

  /** Animated point count for a line, where the fraction is a partial segment. */
  lineLength(shape: ShapeId, pathLength: number): number {
    const value = this.lengths.get(shape);
    return value === undefined ? pathLength : Math.min(value, pathLength);
  }

  /** 0 to 1 as a cell blooms in, staggered by its distance from the centre. */
  cellAppear(level: Level, cell: CellIndex, now: number): number {
    if (APPEAR_MS === 0) return 1;
    const cx = (level.width - 1) / 2;
    const cy = (level.height - 1) / 2;
    const distance = Math.hypot(xOf(level, cell) - cx, yOf(level, cell) - cy);
    const elapsed = now - this.appearAt - distance * APPEAR_STAGGER_MS;
    return clamp01(elapsed / APPEAR_MS);
  }

  /** 1 immediately after a cell is reached, fading to 0. */
  pulseAt(cell: CellIndex, now: number): number {
    const at = this.pulses.get(cell);
    if (at === undefined || PULSE_MS === 0) return 0;
    return clamp01(1 - (now - at) / PULSE_MS);
  }

  solveProgress(now: number): number {
    if (this.solvedAt === null) return 0;
    if (SOLVE_MS === 0) return 1;
    return clamp01((now - this.solvedAt) / SOLVE_MS);
  }

  get isSolvedLatched(): boolean {
    return this.solvedAt !== null;
  }

  /** Lets the frame loop idle instead of burning battery on a static board. */
  isAnimating(game: Game, now: number): boolean {
    if (this.pulses.size > 0) return true;
    if (this.spinActive(game, now)) return true;
    if (now - this.appearAt < APPEAR_MS + APPEAR_STAGGER_MS * 6) return true;
    if (this.solvedAt !== null && now - this.solvedAt < SOLVE_MS) return true;
    // A solved board keeps breathing, so it is never fully idle.
    if (this.solvedAt !== null) return true;
    for (const shape of game.shapes) {
      const target = game.pathFor(shape).length;
      if (Math.abs((this.lengths.get(shape) ?? target) - target) > 0.002) return true;
    }
    return false;
  }
}
