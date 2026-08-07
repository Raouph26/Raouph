import type { ShapeId } from "../core/types";

export interface Palette {
  background: string;
  shape: Record<ShapeId, string>;
  /** Drawn line colour, usually a touch softer than the node fill. */
  line: Record<ShapeId, string>;
  hubStroke: string;
  hubFill: string;
  dotFilled: string;
  dotEmpty: string;
  terminalRing: string;
}

export const DEFAULT_PALETTE: Palette = {
  background: "#12151c",
  shape: { 0: "#ff7a63", 1: "#54c7dd", 2: "#f2c661" },
  line: { 0: "#e0604c", 1: "#3fa9be", 2: "#d3a844" },
  hubStroke: "#737d92",
  hubFill: "#1a1e27",
  dotFilled: "#dfe5f0",
  dotEmpty: "#414a5c",
  terminalRing: "#8d96a8",
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
