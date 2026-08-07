import type { Game } from "../core/game";
import { type CellIndex, type Level, type ShapeId, xOf, yOf } from "../core/types";
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
 * Cap on cell size. Without it a 3x3 board on a phone renders with enormous
 * pieces; LYNE-style boards want to sit as a compact object on screen.
 */
export const MAX_CELL = 92;

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
  /** Board padding in CSS pixels; larger on big screens so play stays thumb-sized. */
  padding = 28;

  constructor(
    private canvas: HTMLCanvasElement,
    palette: Palette = DEFAULT_PALETTE,
  ) {
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("2d canvas context unavailable");
    this.ctx = ctx;
    this.palette = palette;
  }

  /** Resizes the backing store for the device pixel ratio. Returns CSS size. */
  resize(): { width: number; height: number } {
    const dpr = window.devicePixelRatio || 1;
    const width = this.canvas.clientWidth;
    const height = this.canvas.clientHeight;
    this.canvas.width = Math.round(width * dpr);
    this.canvas.height = Math.round(height * dpr);
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

  draw(game: Game): void {
    const { ctx, palette } = this;
    const { level } = game;
    const size = this.resize();
    const layout = this.layoutFor(level);

    ctx.fillStyle = palette.background;
    ctx.fillRect(0, 0, size.width, size.height);

    // Lines sit under the pieces so nodes stay legible where a line runs through.
    for (const shape of game.shapes) this.drawLine(game, layout, shape);

    const { hubPasses } = game.occupancy();
    for (const [i, cell] of level.cells.entries()) {
      if (cell.kind === "hub") {
        this.drawHub(level, layout, i, cell.capacity, hubPasses.get(i) ?? 0);
      }
    }
    for (const [i, cell] of level.cells.entries()) {
      if (cell.kind === "node") {
        this.drawNode(level, layout, i, cell.shape, cell.terminal);
      }
    }
  }

  private drawLine(game: Game, layout: Layout, shape: ShapeId): void {
    const path = game.pathFor(shape);
    if (path.length < 2) return;

    const { ctx, palette } = this;
    const complete = game.isShapeComplete(shape);

    ctx.save();
    // Kept clearly narrower than the pieces so nodes stay readable underneath.
    ctx.lineWidth = layout.cell * 0.105;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = complete ? palette.shape[shape] : palette.line[shape];
    if (complete) {
      // A finished line gets a soft bloom — the main "you got it" feedback.
      ctx.shadowColor = palette.shape[shape];
      ctx.shadowBlur = layout.cell * 0.35;
    }

    ctx.beginPath();
    for (const [i, cell] of path.entries()) {
      const p = centerOf(game.level, layout, cell);
      if (i === 0) ctx.moveTo(p.x, p.y);
      else ctx.lineTo(p.x, p.y);
    }
    ctx.stroke();
    ctx.restore();
  }

  private drawNode(
    level: Level,
    layout: Layout,
    i: CellIndex,
    shape: ShapeId,
    terminal: boolean,
  ): void {
    const { ctx, palette } = this;
    const { x, y } = centerOf(level, layout, i);

    if (terminal) {
      // Terminals wear a ring so the two ends of a line read at a glance.
      ctx.strokeStyle = palette.terminalRing;
      ctx.lineWidth = Math.max(1.5, layout.cell * 0.035);
      ctx.beginPath();
      ctx.arc(x, y, layout.cell * 0.38, 0, Math.PI * 2);
      ctx.stroke();
    }

    ctx.fillStyle = palette.shape[shape];
    traceShape(ctx, shape, x, y, layout.cell * (terminal ? 0.26 : 0.22));
    ctx.fill();
  }

  private drawHub(
    level: Level,
    layout: Layout,
    i: CellIndex,
    capacity: number,
    used: number,
  ): void {
    const { ctx, palette } = this;
    const { x, y } = centerOf(level, layout, i);
    const radius = layout.cell * 0.32;

    // Opaque backing keeps the dot count readable under crossing lines.
    ctx.fillStyle = palette.hubFill;
    traceOctagon(ctx, x, y, radius);
    ctx.fill();

    ctx.strokeStyle = palette.hubStroke;
    ctx.lineWidth = Math.max(1.5, layout.cell * 0.03);
    traceOctagon(ctx, x, y, radius);
    ctx.stroke();

    const dotRadius = Math.max(1.5, layout.cell * 0.045);
    const ring = layout.cell * 0.13;
    for (let d = 0; d < capacity; d++) {
      let dx = 0;
      let dy = 0;
      if (capacity > 1) {
        // Spread dots evenly around a small circle: pairs read horizontally,
        // threes as a triangle, fours as a square.
        const angle = -Math.PI / 2 + (d * 2 * Math.PI) / capacity;
        dx = Math.cos(angle) * ring;
        dy = Math.sin(angle) * ring;
      }
      ctx.fillStyle = d < used ? palette.dotFilled : palette.dotEmpty;
      ctx.beginPath();
      ctx.arc(x + dx, y + dy, dotRadius, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}
