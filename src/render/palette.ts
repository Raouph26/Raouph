import type { ShapeId } from "../core/types";

export interface Palette {
  /** Board ground, and the slightly lifted centre of the backdrop wash. */
  background: string;
  backgroundLift: string;
  shape: Record<ShapeId, string>;
  /** Drawn line colour, a touch deeper than the piece it belongs to. */
  line: Record<ShapeId, string>;
  /** Soft disc behind a terminal, replacing a hard ring. */
  terminalHalo: Record<ShapeId, string>;
  lattice: string;
  panel: string;
  panelEdge: string;
  hubRing: string;
  hubRingFull: string;
  hubFill: string;
  hubTick: string;
  hubTickFull: string;
}

/**
 * A dusk palette: deep indigo ground rather than near-black, with rose, seafoam
 * and sand spread widely around the wheel so the three families stay separable
 * for colour-blind players — the hues differ in warmth as well as position.
 */
export const DEFAULT_PALETTE: Palette = {
  background: "#191828",
  backgroundLift: "#232134",
  shape: { 0: "#e78d88", 1: "#5fc4b8", 2: "#dcb173" },
  line: { 0: "#c9736f", 1: "#4aa79c", 2: "#c0965b" },
  terminalHalo: {
    0: "rgba(231, 141, 136, 0.26)",
    1: "rgba(95, 196, 184, 0.26)",
    2: "rgba(220, 177, 115, 0.26)",
  },
  lattice: "#3a3750",
  panel: "#1f1e30",
  panelEdge: "rgba(255, 255, 255, 0.05)",
  hubRing: "#6b6785",
  hubRingFull: "#b0abc8",
  hubFill: "#141322",
  hubTick: "#605b80",
  hubTickFull: "#f0edfa",
};

/**
 * Sides and rotation per family. Silhouettes are picked to be unmistakable at
 * a glance and — unlike a circle — to visibly turn, since a completed line
 * spins its pieces as confirmation.
 */
const SHAPE_GEOMETRY: Record<ShapeId, { sides: number; rotation: number }> = {
  0: { sides: 3, rotation: -Math.PI / 2 },
  1: { sides: 4, rotation: -Math.PI / 4 },
  2: { sides: 6, rotation: -Math.PI / 2 },
};

/**
 * Regular polygon with rounded corners. Softening every vertex is what keeps
 * the board feeling calm rather than sharp.
 */
export function traceRoundedPolygon(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  radius: number,
  sides: number,
  rotation: number,
  cornerFactor = 0.28,
): void {
  const points: [number, number][] = [];
  for (let i = 0; i < sides; i++) {
    const angle = rotation + (i * 2 * Math.PI) / sides;
    points.push([cx + Math.cos(angle) * radius, cy + Math.sin(angle) * radius]);
  }

  const mid = (a: [number, number], b: [number, number]): [number, number] => [
    (a[0] + b[0]) / 2,
    (a[1] + b[1]) / 2,
  ];
  const corner = radius * cornerFactor;

  ctx.beginPath();
  const start = mid(points[sides - 1], points[0]);
  ctx.moveTo(start[0], start[1]);
  for (let i = 0; i < sides; i++) {
    const next = mid(points[i], points[(i + 1) % sides]);
    ctx.arcTo(points[i][0], points[i][1], next[0], next[1], corner);
  }
  ctx.closePath();
}

export function traceShape(
  ctx: CanvasRenderingContext2D,
  shape: ShapeId,
  cx: number,
  cy: number,
  radius: number,
  spin = 0,
): void {
  const { sides, rotation } = SHAPE_GEOMETRY[shape];
  traceRoundedPolygon(ctx, cx, cy, radius, sides, rotation + spin);
}

/**
 * Hub face: a ring carrying one tick per required pass, filling as they are
 * used. Reading the count around the rim leaves the middle clear, so crossing
 * lines never obscure it.
 */
export function traceHubTick(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  radius: number,
  index: number,
  total: number,
): void {
  // Wide gaps so the arcs read as separate marks to be counted, not as a
  // broken ring. A single pass draws most of the circle.
  const gap = total === 1 ? 1.1 : 0.52;
  const sweep = (2 * Math.PI) / total - gap;
  const start = -Math.PI / 2 + index * ((2 * Math.PI) / total) - sweep / 2;
  ctx.beginPath();
  ctx.arc(cx, cy, radius, start, start + sweep);
}
