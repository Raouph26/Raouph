import type { ShapeId } from "../core/types";

export interface Palette {
  /** Board ground, and the slightly lifted centre of the backdrop wash. */
  background: string;
  backgroundLift: string;
  shape: Record<ShapeId, string>;
  /** Fill for a piece no line reaches yet, sitting behind its outline. */
  shapeHollow: Record<ShapeId, string>;
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

function rgbOf(hex: string): [number, number, number] {
  const value = hex.replace("#", "");
  return [
    parseInt(value.slice(0, 2), 16),
    parseInt(value.slice(2, 4), 16),
    parseInt(value.slice(4, 6), 16),
  ];
}

function withAlpha(hex: string, alpha: number): string {
  const [r, g, b] = rgbOf(hex);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function darken(hex: string, amount: number): string {
  const [r, g, b] = rgbOf(hex);
  const scale = 1 - amount;
  const channel = (c: number) =>
    Math.round(Math.max(0, Math.min(255, c * scale)))
      .toString(16)
      .padStart(2, "0");
  return `#${channel(r)}${channel(g)}${channel(b)}`;
}

/**
 * A theme is written as a handful of grounds plus three accents; every derived
 * value — hollow fills, halos, line colours — is computed from those. Hand
 * tuning sixty hex values per theme would drift out of step almost immediately.
 */
export interface ThemeSpec {
  id: string;
  name: string;
  /** Fully-cleared chapters required before this theme can be chosen. */
  unlockChapters: number;
  background: string;
  backgroundLift: string;
  panel: string;
  lattice: string;
  hubFill: string;
  hubTick: string;
  hubTickFull: string;
  /** Interface greys, applied as CSS custom properties. */
  surface: string;
  surfaceHi: string;
  ink: string;
  inkDim: string;
  inkBright: string;
  accents: [string, string, string];
}

export function paletteFor(spec: ThemeSpec): Palette {
  const [a, b, c] = spec.accents;
  return {
    background: spec.background,
    backgroundLift: spec.backgroundLift,
    shape: { 0: a, 1: b, 2: c },
    shapeHollow: {
      0: withAlpha(a, 0.16),
      1: withAlpha(b, 0.16),
      2: withAlpha(c, 0.16),
    },
    line: { 0: darken(a, 0.14), 1: darken(b, 0.14), 2: darken(c, 0.14) },
    terminalHalo: {
      0: withAlpha(a, 0.26),
      1: withAlpha(b, 0.26),
      2: withAlpha(c, 0.26),
    },
    lattice: spec.lattice,
    panel: spec.panel,
    panelEdge: "rgba(255, 255, 255, 0.05)",
    hubRing: spec.hubTick,
    hubRingFull: spec.hubTickFull,
    hubFill: spec.hubFill,
    hubTick: spec.hubTick,
    hubTickFull: spec.hubTickFull,
  };
}

/**
 * Five moods, each committing to one ground. Accents are always spread widely
 * around the wheel — never three neighbours — so the families stay separable
 * for colour-blind players in every theme, not just the first.
 */
export const THEMES: ThemeSpec[] = [
  {
    id: "dusk",
    name: "Dusk",
    unlockChapters: 0,
    background: "#191828",
    backgroundLift: "#232134",
    panel: "#1f1e30",
    lattice: "#3a3750",
    hubFill: "#141322",
    hubTick: "#605b80",
    hubTickFull: "#f0edfa",
    surface: "#221f33",
    surfaceHi: "#2a2740",
    ink: "#b8b2d0",
    inkDim: "#6f6a8c",
    inkBright: "#ece9f6",
    accents: ["#e78d88", "#5fc4b8", "#dcb173"],
  },
  {
    id: "ember",
    name: "Ember",
    unlockChapters: 5,
    background: "#1d1815",
    backgroundLift: "#2a221d",
    panel: "#241e1a",
    lattice: "#463a31",
    hubFill: "#171310",
    hubTick: "#6f5c4c",
    hubTickFull: "#f6ede3",
    surface: "#28211c",
    surfaceHi: "#332a23",
    ink: "#c9b8a6",
    inkDim: "#7d6b5c",
    inkBright: "#f4ece3",
    accents: ["#e8895f", "#7fb8a4", "#e6c46a"],
  },
  {
    id: "tide",
    name: "Tide",
    unlockChapters: 10,
    background: "#101d24",
    backgroundLift: "#182a33",
    panel: "#14232b",
    lattice: "#2c4550",
    hubFill: "#0c171d",
    hubTick: "#4d6d7a",
    hubTickFull: "#e6f2f5",
    surface: "#17272f",
    surfaceHi: "#1f333d",
    ink: "#a4bfc9",
    inkDim: "#5f7d88",
    inkBright: "#e4f0f4",
    accents: ["#ef8d7a", "#5fbcd4", "#cfd47a"],
  },
  {
    id: "orchid",
    name: "Orchid",
    unlockChapters: 15,
    background: "#1e1526",
    backgroundLift: "#2a1d34",
    panel: "#241a2d",
    lattice: "#453055",
    hubFill: "#170f1e",
    hubTick: "#6b5080",
    hubTickFull: "#f3eafa",
    surface: "#281c33",
    surfaceHi: "#33243f",
    ink: "#c0acce",
    inkDim: "#7a6288",
    inkBright: "#efe6f6",
    accents: ["#e888b4", "#68c6b0", "#e3bd76"],
  },
  {
    id: "slate",
    name: "Slate",
    unlockChapters: 20,
    background: "#16191d",
    backgroundLift: "#1f242a",
    panel: "#1a1e23",
    lattice: "#343c45",
    hubFill: "#111417",
    hubTick: "#5a646f",
    hubTickFull: "#eef1f4",
    surface: "#1e2329",
    surfaceHi: "#262c33",
    ink: "#aeb6bf",
    inkDim: "#6a737d",
    inkBright: "#eaeef2",
    accents: ["#d98a80", "#7fb4bf", "#cbb787"],
  },
];

export const DEFAULT_PALETTE: Palette = paletteFor(THEMES[0]);

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
  // Each tick is a short arc of fixed length, spaced evenly around the rim.
  // Dividing the whole circle instead would make two passes read as a ring
  // with two notches; short marks are countable at a glance.
  const sweep = Math.min(0.95, (2 * Math.PI) / total - 0.55);
  const start = -Math.PI / 2 + index * ((2 * Math.PI) / total) - sweep / 2;
  ctx.beginPath();
  ctx.arc(cx, cy, radius, start, start + sweep);
}
