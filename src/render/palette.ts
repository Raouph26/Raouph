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
  /** Soft glow behind a terminal. */
  terminalHalo: Record<ShapeId, string>;
  /** Hard ring around a terminal — what actually makes an endpoint findable. */
  terminalRing: Record<ShapeId, string>;
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

function lighten(hex: string, amount: number): string {
  const [r, g, b] = rgbOf(hex);
  const channel = (c: number) =>
    Math.round(c + (255 - c) * amount)
      .toString(16)
      .padStart(2, "0");
  return `#${channel(r)}${channel(g)}${channel(b)}`;
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
  /**
   * Cleared chapters required before this theme can be pinned. All zero for
   * now: gating them made the feature look broken, because on a new save every
   * option a player could tap resolved to the same palette. Raise these to
   * re-introduce progression once the look is settled.
   */
  unlockChapters: number;
  /** Light grounds need dark ink and dark hairlines; the interface asks. */
  light: boolean;
  background: string;
  backgroundLift: string;
  panel: string;
  lattice: string;
  hubFill: string;
  hubTick: string;
  hubTickFull: string;
  /** Hairline on the board plate, and on interface surfaces. */
  edge: string;
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
    terminalRing: {
      0: withAlpha(a, 0.85),
      1: withAlpha(b, 0.85),
      2: withAlpha(c, 0.85),
    },
    lattice: spec.lattice,
    panel: spec.panel,
    panelEdge: spec.edge,
    hubRing: spec.hubTick,
    hubRingFull: spec.hubTickFull,
    // Lifted off the ground the theme specifies: an unmet hub still has to be
    // countable, and on the warmer themes the raw value sank into the board.
    hubFill: lighten(spec.hubFill, 0.06),
    hubTick: lighten(spec.hubTick, 0.26),
    hubTickFull: spec.hubTickFull,
  };
}

/**
 * Four moods, kept deliberately few and far apart. Ten near-neighbours read as
 * one palette with the tint nudged; these change the ground *and* the accent
 * triad, so switching is obvious rather than subtle — two on light grounds, two
 * on dark, and no two sharing a colour scheme.
 *
 * Accents stay spread widely around the wheel in every theme — never three
 * neighbours — so the families remain separable for colour-blind players.
 *
 * `themeForChapter` cycles them, so consecutive chapters never look alike.
 */
export const THEMES: ThemeSpec[] = [
  {
    // Warm desert. Terracotta, deep teal, ochre on cream.
    id: "sandstone", name: "Sandstone", unlockChapters: 0, light: true,
    background: "#f2e9dd", backgroundLift: "#f9f2e9",
    panel: "#ebdecd", lattice: "#c9b69f", hubFill: "#e2d2bd", hubTick: "#b9a288",
    hubTickFull: "#544838", edge: "rgba(84, 72, 56, 0.14)",
    surface: "#e9dece", surfaceHi: "#f2eae0",
    ink: "#6b5e4e", inkDim: "#a08f79", inkBright: "#3d3527",
    accents: ["#c4714f", "#3f8a83", "#b8913c"],
  },
  {
    // Deep sea night. Coral, pale teal, sand on navy.
    id: "harbour", name: "Harbour", unlockChapters: 0, light: false,
    background: "#1b2a33", backgroundLift: "#24363f", panel: "#1f2f39",
    lattice: "#3a5261", hubFill: "#16232b", hubTick: "#4f6d7d",
    hubTickFull: "#dceaef", edge: "rgba(255, 255, 255, 0.07)",
    surface: "#213139", surfaceHi: "#2a3d47",
    ink: "#9fb6c1", inkDim: "#647e8b", inkBright: "#dfeaf0",
    accents: ["#eb8f76", "#83c5be", "#e0c37f"],
  },
  {
    // Orchard morning. Plum, leaf green, amber on pale sage.
    id: "orchard", name: "Orchard", unlockChapters: 0, light: true,
    background: "#e9eee4", backgroundLift: "#f2f6ee", panel: "#dde5d5",
    lattice: "#b3c0a7", hubFill: "#d5dfcc", hubTick: "#a3b296",
    hubTickFull: "#485240", edge: "rgba(72, 82, 64, 0.14)",
    surface: "#e0e8d9", surfaceHi: "#ebf0e6",
    ink: "#5d6a55", inkDim: "#93a189", inkBright: "#353d30",
    accents: ["#a2557d", "#4f8b58", "#c08a2e"],
  },
  {
    // Midnight. Rose, cornflower, butter on deep indigo.
    id: "ink", name: "Ink", unlockChapters: 0, light: false,
    background: "#1c1e33", backgroundLift: "#26283f", panel: "#202239",
    lattice: "#3c3f60", hubFill: "#16182a", hubTick: "#535780",
    hubTickFull: "#e4e5f4", edge: "rgba(255, 255, 255, 0.07)",
    surface: "#232540", surfaceHi: "#2c2f4c",
    ink: "#a6a8c8", inkDim: "#6b6e94", inkBright: "#e6e7f5",
    accents: ["#e58aa6", "#7fa6de", "#e0c878"],
  },
];

export const DEFAULT_PALETTE: Palette = paletteFor(THEMES[0]);

/**
 * The look a chapter wears when the player has not pinned a theme. Chapters
 * cycle through the set, so the game keeps changing as it is played rather
 * than looking identical for all 640 stages.
 */
export function themeForChapter(chapter: number): ThemeSpec {
  const index = (Math.max(1, chapter) - 1) % THEMES.length;
  return THEMES[index];
}

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
