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
  traceHubTick,
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
export const MAX_CELL = 124;

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

  setPalette(palette: Palette): void {
    this.palette = palette;
  }

  /** Resizes and paints the ground. Call once per frame, before any board. */
  beginFrame(): { width: number; height: number } {
    const { ctx, palette } = this;
    const size = this.resize();

    // A soft wash lifts the centre so the ground has depth instead of reading
    // as flat black behind the board.
    const wash = ctx.createRadialGradient(
      size.width / 2,
      size.height * 0.46,
      0,
      size.width / 2,
      size.height * 0.46,
      Math.max(size.width, size.height) * 0.75,
    );
    wash.addColorStop(0, palette.backgroundLift);
    wash.addColorStop(1, palette.background);
    ctx.fillStyle = wash;
    ctx.fillRect(0, 0, size.width, size.height);
    return size;
  }

  draw(game: Game, view: ViewState, now: number): void {
    this.beginFrame();
    this.drawBoard(game, view, now);
  }

  /**
   * Draws one board, optionally shifted sideways. Two boards drawn at opposing
   * offsets in the same frame give the swipe between stages, with both still
   * live rather than one being a frozen snapshot.
   */
  drawBoard(game: Game, view: ViewState, now: number, offsetX = 0): void {
    const { ctx } = this;
    const { level } = game;
    const layout = this.layoutFor(level);

    ctx.save();
    ctx.translate(offsetX, 0);

    // Pieces on a closed line spin in the order they were drawn, so the spin
    // needs each piece's position along its own path.
    const order = new Map<CellIndex, { shape: ShapeId; index: number }>();
    for (const shape of game.shapes) {
      if (!game.isShapeComplete(shape)) continue;
      for (const [i, cell] of game.pathFor(shape).entries()) {
        if (!order.has(cell)) order.set(cell, { shape, index: i });
      }
    }

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
    // Which pieces a line already runs through. Everything else is still to do,
    // and is drawn hollow so the remaining work reads at a glance.
    const covered = new Set<CellIndex>();
    for (const shape of game.shapes) {
      for (const cell of game.pathFor(shape)) covered.add(cell);
    }

    for (const [i, cell] of level.cells.entries()) {
      if (cell.kind !== "node") continue;
      const seat = order.get(i);
      const spin = seat ? view.spinFor(seat.shape, seat.index, now) : 0;
      this.drawNode(
        level,
        layout,
        view,
        i,
        cell.shape,
        cell.terminal,
        now,
        spin,
        covered.has(i),
      );
    }

    ctx.restore();
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
    spin: number,
    connected: boolean,
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

    // Terminals get both a glow and a hard ring. The glow alone was not enough
    // to pick a line's two ends out of a dense board — a definite edge is what
    // makes them findable at a glance, so the ring carries the meaning and the
    // halo just softens it.
    if (terminal) {
      const outer = layout.cell * 0.46 * scale;
      const halo = ctx.createRadialGradient(x, y, outer * 0.3, x, y, outer);
      halo.addColorStop(0, palette.terminalHalo[shape]);
      halo.addColorStop(1, "rgba(0, 0, 0, 0)");
      ctx.fillStyle = halo;
      ctx.beginPath();
      ctx.arc(x, y, outer, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = palette.terminalRing[shape];
      ctx.lineWidth = Math.max(2, layout.cell * 0.032);
      ctx.beginPath();
      ctx.arc(x, y, layout.cell * 0.4 * scale, 0, Math.PI * 2);
      ctx.stroke();
    }

    // Outline means "still to connect", solid means "done". This is the main
    // way a player reads what is left without tracing every line by eye.
    const radius = layout.cell * (terminal ? 0.3 : 0.27) * scale;
    traceShape(ctx, shape, x, y, radius, spin);

    if (connected) {
      ctx.fillStyle = palette.shape[shape];
      ctx.fill();
    } else {
      ctx.fillStyle = palette.shapeHollow[shape];
      ctx.fill();
      ctx.strokeStyle = palette.shape[shape];
      ctx.lineWidth = Math.max(2, layout.cell * 0.038);
      ctx.stroke();
    }
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

    // Solid centre so crossing lines pass behind rather than through the face.
    ctx.fillStyle = palette.hubFill;
    ctx.beginPath();
    ctx.arc(x, y, radius * 0.72, 0, Math.PI * 2);
    ctx.fill();

    // The count lives as one arc per required pass, around the rim. Reading it
    // on the edge keeps the middle clear no matter how many lines cross, and
    // there is deliberately no ring behind the arcs — an outline the same
    // weight as the marks makes them impossible to count at a glance.
    ctx.lineCap = "round";
    ctx.lineWidth = Math.max(2.5, layout.cell * 0.072) * (1 + 0.12 * pulse);
    for (let d = 0; d < capacity; d++) {
      ctx.strokeStyle = d < used ? palette.hubTickFull : palette.hubTick;
      traceHubTick(ctx, x, y, radius * 0.82, d, capacity);
      ctx.stroke();
    }
    ctx.restore();
  }
}
