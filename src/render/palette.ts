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
  style: ThemeStyle;
}

/**
 * What separates a theme from a recolour.
 *
 * Swapping hex values alone reads as the same game with a filter over it, so a
 * theme also owns its silhouette, its line weight, whether the board sits on a
 * plate, how the empty grid is marked, and the slow wash of colour drifting
 * behind everything.
 */
export interface ThemeStyle {
  /** Corner rounding of the pieces: 0.05 is nearly sharp, 0.45 is a pebble. */
  cornerFactor: number;
  /** Multiplier on line weight, relative to the base of 0.1 cells. */
  lineScale: number;
  /** Whether the board sits on a raised plate or floats on the ground. */
  panel: "plate" | "none";
  /** How cells with no piece are marked. */
  lattice: "dots" | "rings" | "none";
  /** Soft blobs of colour drifting behind the board. */
  drift: {
    count: number;
    /** Cycles per minute, roughly. Kept low so it never draws the eye. */
    speed: number;
    /** Radius as a fraction of the smaller viewport dimension. */
    radius: number;
    alpha: number;
  };
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
   * Cleared chapters required before this theme can be used: 0, 1, 2, 3, 4, so
   * the set is complete by the time chapter 5 is reached. Auto mode only cycles
   * what has been earned, so an unlock visibly changes the game rather than
   * quietly adding a row to a settings list.
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
  style: ThemeStyle;
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
    style: spec.style,
  };
}

/**
 * Five moods, each its own material rather than its own hex values. Alongside
 * the ground and the accent triad, a theme owns the roundness of the pieces,
 * the weight of the lines, whether the board sits on a plate, how empty cells
 * are marked, and the slow wash drifting behind everything — so switching
 * changes what the game is made of, not just what colour it is.
 *
 * Accents stay spread widely around the wheel in every theme — never three
 * neighbours — so the families remain separable for colour-blind players.
 *
 * `themeForChapter` cycles them, so consecutive chapters never look alike.
 */
export const THEMES: ThemeSpec[] = [
  {
    // Warm desert. Round pebbles on a raised plate, slow low sun.
    id: "sandstone", name: "Sandstone", unlockChapters: 0, light: true,
    background: "#f2e9dd", backgroundLift: "#f9f2e9",
    panel: "#ebdecd", lattice: "#c9b69f", hubFill: "#e2d2bd", hubTick: "#b9a288",
    hubTickFull: "#544838", edge: "rgba(84, 72, 56, 0.14)",
    surface: "#e9dece", surfaceHi: "#f2eae0",
    ink: "#6b5e4e", inkDim: "#a08f79", inkBright: "#3d3527",
    accents: ["#c4714f", "#3f8a83", "#b8913c"],
    style: {
      cornerFactor: 0.42,
      lineScale: 1,
      panel: "plate",
      lattice: "dots",
      drift: { count: 3, speed: 0.5, radius: 0.85, alpha: 0.1 },
    },
  },
  {
    // Deep water. Heavy lines, few enormous slow currents.
    id: "harbour", name: "Harbour", unlockChapters: 1, light: false,
    background: "#1b2a33", backgroundLift: "#24363f", panel: "#1f2f39",
    lattice: "#3a5261", hubFill: "#16232b", hubTick: "#4f6d7d",
    hubTickFull: "#dceaef", edge: "rgba(255, 255, 255, 0.07)",
    surface: "#213139", surfaceHi: "#2a3d47",
    ink: "#9fb6c1", inkDim: "#647e8b", inkBright: "#dfeaf0",
    accents: ["#eb8f76", "#83c5be", "#e0c37f"],
    style: {
      cornerFactor: 0.3,
      lineScale: 1.22,
      panel: "plate",
      lattice: "dots",
      drift: { count: 2, speed: 0.3, radius: 1.15, alpha: 0.14 },
    },
  },
  {
    // Orchard morning. No plate at all — pieces sit straight on the ground,
    // with open rings for the empty cells.
    id: "orchard", name: "Orchard", unlockChapters: 2, light: true,
    background: "#e9eee4", backgroundLift: "#f2f6ee", panel: "#dde5d5",
    lattice: "#9fb094", hubFill: "#d5dfcc", hubTick: "#a3b296",
    hubTickFull: "#485240", edge: "rgba(72, 82, 64, 0.14)",
    surface: "#e0e8d9", surfaceHi: "#ebf0e6",
    ink: "#5d6a55", inkDim: "#93a189", inkBright: "#353d30",
    accents: ["#a2557d", "#4f8b58", "#c08a2e"],
    style: {
      cornerFactor: 0.36,
      lineScale: 0.92,
      panel: "none",
      lattice: "rings",
      drift: { count: 4, speed: 0.7, radius: 0.6, alpha: 0.11 },
    },
  },
  {
    // Midnight. Sharp facets, thin lines, many tiny slow lights.
    id: "ink", name: "Ink", unlockChapters: 3, light: false,
    background: "#1c1e33", backgroundLift: "#26283f", panel: "#202239",
    lattice: "#3c3f60", hubFill: "#16182a", hubTick: "#535780",
    hubTickFull: "#e4e5f4", edge: "rgba(255, 255, 255, 0.07)",
    surface: "#232540", surfaceHi: "#2c2f4c",
    ink: "#a6a8c8", inkDim: "#6b6e94", inkBright: "#e6e7f5",
    accents: ["#e58aa6", "#7fa6de", "#e0c878"],
    style: {
      cornerFactor: 0.1,
      lineScale: 0.86,
      panel: "none",
      lattice: "dots",
      drift: { count: 6, speed: 0.9, radius: 0.42, alpha: 0.1 },
    },
  },
  {
    // Hearth. Softened facets on a plate, no lattice at all, one warm ember.
    id: "ember", name: "Ember", unlockChapters: 4, light: false,
    background: "#2b211c", backgroundLift: "#372b23", panel: "#312620",
    lattice: "#4d3d33", hubFill: "#241b16", hubTick: "#6e5847",
    hubTickFull: "#f3e6d8", edge: "rgba(255, 255, 255, 0.07)",
    surface: "#332822", surfaceHi: "#3d3029",
    ink: "#bda893", inkDim: "#82705f", inkBright: "#f2e6d9",
    accents: ["#e08a52", "#5fa896", "#d9b74e"],
    style: {
      cornerFactor: 0.2,
      lineScale: 1.1,
      panel: "plate",
      lattice: "none",
      drift: { count: 2, speed: 0.42, radius: 0.95, alpha: 0.16 },
    },
  },
];

export const DEFAULT_PALETTE: Palette = paletteFor(THEMES[0]);

/**
 * The look a chapter wears when the player has not pinned a theme. Chapters
 * cycle through the set, so the game keeps changing as it is played rather
 * than looking identical for all 640 stages.
 */
export function themeForChapter(chapter: number, unlockedCount = THEMES.length): ThemeSpec {
  // Only cycle what has been earned, or reaching chapter 4 would hand over
  // every look for free and leave the unlocks meaningless.
  const pool = Math.max(1, Math.min(THEMES.length, unlockedCount));
  return THEMES[(Math.max(1, chapter) - 1) % pool];
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
  cornerFactor = 0.28,
): void {
  const { sides, rotation } = SHAPE_GEOMETRY[shape];
  traceRoundedPolygon(ctx, cx, cy, radius, sides, rotation + spin, cornerFactor);
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
