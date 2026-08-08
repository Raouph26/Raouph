import type { ShapeId } from "../core/types";

export interface Palette {
  background: string;
  shape: Record<ShapeId, string>;
  /** Drawn line colour, usually a touch softer than the node fill. */
  line: Record<ShapeId, string>;
  /** Dots marking empty cells, so the grid's diagonals are legible. */
  lattice: string;
  /** Faint plate behind the grid that frames the play area. */
  panel: string;
  panelEdge: string;
  hubStroke: string;
  /** Hub outline once its dot count is met. */
  hubStrokeFull: string;
  hubFill: string;
  dotFilled: string;
  dotEmpty: string;
  terminalRing: string;
}

/**
 * A single dark world rather than a themed page: the neutrals carry a blue
 * bias so the warm coral reads as the one warm thing on screen.
 */
export const DEFAULT_PALETTE: Palette = {
  background: "#10131a",
  shape: { 0: "#ff7a63", 1: "#54c7dd", 2: "#f2c661" },
  line: { 0: "#d95a47", 1: "#3ba3b8", 2: "#cda23f" },
  lattice: "#2f3648",
  panel: "#151924",
  panelEdge: "rgba(255, 255, 255, 0.045)",
  hubStroke: "#6d7689",
  hubStrokeFull: "#aab3c4",
  hubFill: "#171b24",
  dotFilled: "#e4e9f2",
  dotEmpty: "#3c4455",
  terminalRing: "#858ea1",
};

/** Number of sides and rotation that give each shape family its silhouette. */
const SHAPE_GEOMETRY: Record<ShapeId, { sides: number; rotation: number }> = {
  0: { sides: 3, rotation: -Math.PI / 2 },
  1: { sides: 4, rotation: -Math.PI / 2 },
  2: { sides: 4, rotation: -Math.PI / 4 },
};

export function tracePolygon(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  radius: number,
  sides: number,
  rotation: number,
): void {
  ctx.beginPath();
  for (let i = 0; i < sides; i++) {
    const angle = rotation + (i * 2 * Math.PI) / sides;
    const x = cx + Math.cos(angle) * radius;
    const y = cy + Math.sin(angle) * radius;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
}

export function traceShape(
  ctx: CanvasRenderingContext2D,
  shape: ShapeId,
  cx: number,
  cy: number,
  radius: number,
): void {
  const { sides, rotation } = SHAPE_GEOMETRY[shape];
  tracePolygon(ctx, cx, cy, radius, sides, rotation);
}

export function traceOctagon(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  radius: number,
): void {
  tracePolygon(ctx, cx, cy, radius, 8, Math.PI / 8);
}
