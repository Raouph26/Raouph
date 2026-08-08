import type { Game } from "../core/game";
import { type CellIndex, type Level, type ShapeId, xOf, yOf } from "../core/types";
import {
  type ViewState,
  clamp01,
  easeInOutSine,
  easeOutBack,
  easeOutCubic,
} from "./animation";
import {
  type Palette,
  DEFAULT_PALETTE,
  traceOctagon,
  traceShape,
} from "./palette";

export interface Layout {
  /** Side length of one grid cell in CSS pixels. */
  cell: number;
  /** Top-left corner of the board within the canvas. */
  ox: number;
  oy: number;
}

/**
 * Cap on cell size. Boards are at most 3 columns, so without a cap a short
 * puzzle would render with absurdly large pieces on a tall screen.
 */
export const MAX_CELL = 108;

export function computeLayout(
  level: Level,
  viewWidth: number,
  viewHeight: number,
  padding: number,
): Layout {
  const cell = Math.max(
    8,
    Math.min(
      MAX_CELL,
      (viewWidth - padding * 2) / level.width,
      (viewHeight - padding * 2) / level.height,
    ),
  );
  return {
    cell,
    ox: (viewWidth - cell * level.width) / 2,
    oy: (viewHeight - cell * level.height) / 2,
  };
}

export function centerOf(
  level: Level,
  layout: Layout,
  i: CellIndex,
): { x: number; y: number } {
  return {
    x: layout.ox + (xOf(level, i) + 0.5) * layout.cell,
    y: layout.oy + (yOf(level, i) + 0.5) * layout.cell,
  };
}

/** Which cell a screen point falls in, or null when outside the board. */
export function cellAt(
  level: Level,
  layout: Layout,
  px: number,
  py: number,
): CellIndex | null {
  const x = Math.floor((px - layout.ox) / layout.cell);
  const y = Math.floor((py - layout.oy) / layout.cell);
  if (x < 0 || y < 0 || x >= level.width || y >= level.height) return null;
  return y * level.width + x;
}

export class Renderer {
  private ctx: CanvasRenderingContext2D;
  private palette: Palette;
  padding = 34;

  constructor(
    private canvas: HTMLCanvasElement,
    palette: Palette = DEFAULT_PALETTE,
  ) {
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("2d canvas context unavailable");
    this.ctx = ctx;
    this.palette = palette;
  }

  private resize(): { width: number; height: number } {
    const dpr = window.devicePixelRatio || 1;
    const width = this.canvas.clientWidth;
    const height = this.canvas.clientHeight;
    const backingWidth = Math.round(width * dpr);
    const backingHeight = Math.round(height * dpr);
    if (this.canvas.width !== backingWidth || this.canvas.height !== backingHeight) {
      this.canvas.width = backingWidth;
      this.canvas.height = backingHeight;
    }
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { width, height };
  }

  layoutFor(level: Level): Layout {
    return computeLayout(
      level,
      this.canvas.clientWidth,
      this.canvas.clientHeight,
      this.padding,
    );
  }

  draw(game: Game, view: ViewState, now: number): void {
    const { ctx, palette } = this;
    const { level } = game;
    const size = this.resize();
    const layout = this.layoutFor(level);

    ctx.fillStyle = palette.background;
    ctx.fillRect(0, 0, size.width, size.height);

    // The plate frames the board, which is what makes an empty cell read as
    // part of a grid rather than as a stray speck on the background.
    this.drawPanel(level, layout, view, now);

    // Faint dots then show every cell a line could reach, including the
    // diagonals, which are otherwise invisible until a player tries them.
    this.drawLattice(level, layout, view, now);

    for (const shape of game.shapes) {
      this.drawLine(game, layout, view, shape, now);
    }

    const { hubPasses } = game.occupancy();
    for (const [i, cell] of level.cells.entries()) {
      if (cell.kind === "hub") {
        this.drawHub(level, layout, view, i, cell.capacity, hubPasses.get(i) ?? 0, now);
      }
    }
    for (const [i, cell] of level.cells.entries()) {
      if (cell.kind === "node") {
        this.drawNode(level, layout, view, i, cell.shape, cell.terminal, now);
      }
    }
  }

  private drawPanel(
    level: Level,
    layout: Layout,
    view: ViewState,
    now: number,
  ): void {
    const { ctx, palette } = this;
    // Timed off the centre cell so the plate settles with the pieces on it.
    const centre = Math.floor(level.cells.length / 2);
    const appear = easeOutCubic(view.cellAppear(level, centre, now));
    if (appear <= 0) return;

    const inset = layout.cell * 0.14;
    const x = layout.ox - inset;
    const y = layout.oy - inset;
    const width = layout.cell * level.width + inset * 2;
    const height = layout.cell * level.height + inset * 2;

    ctx.save();
    ctx.globalAlpha = appear;
    ctx.beginPath();
    ctx.roundRect(x, y, width, height, layout.cell * 0.42);
    ctx.fillStyle = palette.panel;
    ctx.fill();
    ctx.strokeStyle = palette.panelEdge;
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.restore();
  }

  private drawLattice(
    level: Level,
    layout: Layout,
    view: ViewState,
    now: number,
  ): void {
    const { ctx, palette } = this;
    for (const [i, cell] of level.cells.entries()) {
      if (cell.kind !== "empty") continue;
      const appear = view.cellAppear(level, i, now);
      if (appear <= 0) continue;

      const { x, y } = centerOf(level, layout, i);
      ctx.globalAlpha = appear * 0.55;
      ctx.fillStyle = palette.lattice;
      ctx.beginPath();
      ctx.arc(x, y, Math.max(1, layout.cell * 0.022), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  private drawLine(
    game: Game,
    layout: Layout,
    view: ViewState,
    shape: ShapeId,
    now: number,
  ): void {
    const path = game.pathFor(shape);
    if (path.length < 1) return;

    const { ctx, palette } = this;
    const { level } = game;
    const drawn = view.lineLength(shape, path.length);
    const whole = Math.floor(drawn);
    const fraction = drawn - whole;

    const points: { x: number; y: number }[] = [];
    for (let i = 0; i < Math.min(whole, path.length); i++) {
      points.push(centerOf(level, layout, path[i]));
    }
    // The head glides partway into the next cell rather than jumping to it.
    if (fraction > 0 && whole >= 1 && whole < path.length) {
      const from = centerOf(level, layout, path[whole - 1]);
      const to = centerOf(level, layout, path[whole]);
      points.push({
        x: from.x + (to.x - from.x) * fraction,
        y: from.y + (to.y - from.y) * fraction,
      });
    }
    if (points.length < 2) return;

    const complete = game.isShapeComplete(shape);
    const solve = view.solveProgress(now);
    // A solved board breathes: a slow swell that reads as settled, not idle.
    const breath = view.isSolvedLatched
      ? 0.72 + 0.28 * easeInOutSine((Math.sin(now / 1750) + 1) / 2)
      : 1;

    ctx.save();
    // Deliberately narrower than the pieces: at this cell size a heavier line
    // swallows the triangles and they stop reading as their own shape.
    ctx.lineWidth = layout.cell * 0.088;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = complete ? palette.shape[shape] : palette.line[shape];
    if (complete) {
      ctx.shadowColor = palette.shape[shape];
      ctx.shadowBlur = layout.cell * (0.22 + 0.34 * easeOutCubic(solve)) * breath;
    }

    ctx.beginPath();
    for (const [i, point] of points.entries()) {
      if (i === 0) ctx.moveTo(point.x, point.y);
      else ctx.lineTo(point.x, point.y);
    }
    ctx.stroke();
    ctx.restore();
  }

  private drawNode(
    level: Level,
    layout: Layout,
    view: ViewState,
    i: CellIndex,
    shape: ShapeId,
    terminal: boolean,
    now: number,
  ): void {
    const { ctx, palette } = this;
    const appear = view.cellAppear(level, i, now);
    if (appear <= 0) return;

    const { x, y } = centerOf(level, layout, i);
    const pulse = view.pulseAt(i, now);
    const scale = easeOutBack(appear) * (1 + 0.3 * pulse * pulse);

    // A ripple leaving the piece the moment a line arrives on it.
    if (pulse > 0) {
      ctx.save();
      ctx.globalAlpha = pulse * 0.4;
      ctx.strokeStyle = palette.shape[shape];
      ctx.lineWidth = Math.max(1, layout.cell * 0.02);
      ctx.beginPath();
      ctx.arc(x, y, layout.cell * (0.24 + 0.34 * (1 - pulse)), 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    ctx.save();
    ctx.globalAlpha = clamp01(appear);

    if (terminal) {
      ctx.strokeStyle = palette.terminalRing;
      ctx.lineWidth = Math.max(1.5, layout.cell * 0.032);
      ctx.beginPath();
      ctx.arc(x, y, layout.cell * 0.38 * scale, 0, Math.PI * 2);
      ctx.stroke();
    }

    ctx.fillStyle = palette.shape[shape];
    traceShape(ctx, shape, x, y, layout.cell * (terminal ? 0.26 : 0.22) * scale);
    ctx.fill();
    ctx.restore();
  }

  private drawHub(
    level: Level,
    layout: Layout,
    view: ViewState,
    i: CellIndex,
    capacity: number,
    used: number,
    now: number,
  ): void {
    const { ctx, palette } = this;
    const appear = view.cellAppear(level, i, now);
    if (appear <= 0) return;

    const { x, y } = centerOf(level, layout, i);
    const pulse = view.pulseAt(i, now);
    const scale = easeOutBack(appear) * (1 + 0.18 * pulse * pulse);
    const radius = layout.cell * 0.32 * scale;

    ctx.save();
    ctx.globalAlpha = clamp01(appear);

    // Opaque backing keeps the dot count readable under crossing lines.
    ctx.fillStyle = palette.hubFill;
    traceOctagon(ctx, x, y, radius);
    ctx.fill();

    ctx.strokeStyle = used === capacity ? palette.hubStrokeFull : palette.hubStroke;
    ctx.lineWidth = Math.max(1.5, layout.cell * 0.028);
    traceOctagon(ctx, x, y, radius);
    ctx.stroke();

    const dotRadius = Math.max(1.5, layout.cell * 0.045);
    const ring = layout.cell * 0.13;
    for (let d = 0; d < capacity; d++) {
      let dx = 0;
      let dy = 0;
      if (capacity > 1) {
        const angle = -Math.PI / 2 + (d * 2 * Math.PI) / capacity;
        dx = Math.cos(angle) * ring;
        dy = Math.sin(angle) * ring;
      }
      const filled = d < used;
      ctx.fillStyle = filled ? palette.dotFilled : palette.dotEmpty;
      ctx.beginPath();
      ctx.arc(x + dx, y + dy, dotRadius * (filled ? 1 + 0.25 * pulse : 1), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }
}
