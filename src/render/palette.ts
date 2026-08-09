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
 * Ten moods, each committing to one ground. Accents are always spread widely
 * around the wheel — never three neighbours — so the families stay separable
 * for colour-blind players in every theme, not just the first.
 *
 * One unlocks per chapter cleared, and `themeForChapter` gives each chapter its
 * own look so the game keeps changing as it is played.
 */
export const THEMES: ThemeSpec[] = [
  {
    id: "sandstone", name: "Sandstone", unlockChapters: 0, light: true,
    background: "#f2e9dd", backgroundLift: "#f8f1e8", panel: "#ece0d1",
    lattice: "#cbb9a4", hubFill: "#e3d4c1", hubTick: "#bda88f",
    hubTickFull: "#5d5044", edge: "rgba(93, 80, 68, 0.13)",
    surface: "#eae0d2", surfaceHi: "#f2ebe0",
    ink: "#6f6355", inkDim: "#a2937f", inkBright: "#41382a",
    accents: ["#c9836a", "#6fa79f", "#c0a061"],
  },
  {
    id: "harbour", name: "Harbour", unlockChapters: 0, light: false,
    background: "#242e35", backgroundLift: "#2d3941", panel: "#28333b",
    lattice: "#41505a", hubFill: "#1f282e", hubTick: "#5b6d78",
    hubTickFull: "#dfe7ea", edge: "rgba(255, 255, 255, 0.06)",
    surface: "#2a353d", surfaceHi: "#334049",
    ink: "#a7b5bd", inkDim: "#6d7d87", inkBright: "#e2eaee",
    accents: ["#d2907c", "#83c5be", "#c9b183"],
  },
  {
    id: "blossom", name: "Blossom", unlockChapters: 0, light: true,
    background: "#f5eae7", backgroundLift: "#faf2f0", panel: "#efdedb",
    lattice: "#d3b8b4", hubFill: "#e8d6d3", hubTick: "#c4a7a3",
    hubTickFull: "#5f4f4d", edge: "rgba(95, 79, 77, 0.13)",
    surface: "#eee1de", surfaceHi: "#f5ebe9",
    ink: "#726160", inkDim: "#a89392", inkBright: "#453a39",
    accents: ["#c8827f", "#7fa89b", "#c3a065"],
  },
  {
    id: "pine", name: "Pine", unlockChapters: 0, light: false,
    background: "#232c29", backgroundLift: "#2c3733", panel: "#27312e",
    lattice: "#3e4f49", hubFill: "#1e2624", hubTick: "#586b64",
    hubTickFull: "#dfe8e4", edge: "rgba(255, 255, 255, 0.06)",
    surface: "#293430", surfaceHi: "#323e3a",
    ink: "#a5b6ae", inkDim: "#6c7e77", inkBright: "#e0eae5",
    accents: ["#d1907a", "#7fb8ae", "#c7b184"],
  },
  {
    id: "fog", name: "Fog", unlockChapters: 0, light: true,
    background: "#eceef0", backgroundLift: "#f4f6f7", panel: "#e2e5e8",
    lattice: "#b9c0c6", hubFill: "#dadee1", hubTick: "#a9b2b9",
    hubTickFull: "#4e565c", edge: "rgba(78, 86, 92, 0.13)",
    surface: "#e5e8ea", surfaceHi: "#eef0f2",
    ink: "#616a70", inkDim: "#98a1a8", inkBright: "#394045",
    accents: ["#c07f78", "#6ea3a2", "#b99b5f"],
  },
  {
    id: "dusk", name: "Dusk", unlockChapters: 0, light: false,
    background: "#2a2833", backgroundLift: "#34313f", panel: "#2f2c39",
    lattice: "#4b4759", hubFill: "#232130", hubTick: "#655f77",
    hubTickFull: "#e6e2ee", edge: "rgba(255, 255, 255, 0.06)",
    surface: "#312e3c", surfaceHi: "#3a3747",
    ink: "#b0a9be", inkDim: "#77708a", inkBright: "#e8e4f0",
    accents: ["#cd8f8c", "#83b8b0", "#c6a97e"],
  },
  {
    id: "clay", name: "Clay", unlockChapters: 0, light: false,
    background: "#2e2723", backgroundLift: "#39312b", panel: "#332b26",
    lattice: "#4f453d", hubFill: "#262019", hubTick: "#6b5d51",
    hubTickFull: "#efe6dc", edge: "rgba(255, 255, 255, 0.06)",
    surface: "#352d27", surfaceHi: "#3f3630",
    ink: "#b8a99b", inkDim: "#7f7264", inkBright: "#eee3d8",
    accents: ["#cf8b6d", "#7fada3", "#c6a86e"],
  },
  {
    id: "linen", name: "Linen", unlockChapters: 0, light: true,
    background: "#eef0e9", backgroundLift: "#f5f7f1", panel: "#e3e7dc",
    lattice: "#bcc4b2", hubFill: "#dce1d5", hubTick: "#adb5a4",
    hubTickFull: "#4f564a", edge: "rgba(79, 86, 74, 0.13)",
    surface: "#e6eae0", surfaceHi: "#eff2ea",
    ink: "#636b5d", inkDim: "#99a292", inkBright: "#3b4137",
    accents: ["#c1806c", "#6fa392", "#b79a58"],
  },
  {
    id: "slate", name: "Slate", unlockChapters: 0, light: false,
    background: "#282c30", backgroundLift: "#31363b", panel: "#2c3135",
    lattice: "#464d53", hubFill: "#22262a", hubTick: "#606870",
    hubTickFull: "#e3e7ea", edge: "rgba(255, 255, 255, 0.06)",
    surface: "#2e3338", surfaceHi: "#373d43",
    ink: "#a9b0b7", inkDim: "#727a82", inkBright: "#e4e8ec",
    accents: ["#cb8f87", "#84b0b3", "#c2ab80"],
  },
  {
    id: "ink", name: "Ink", unlockChapters: 0, light: false,
    background: "#222a35", backgroundLift: "#2b3441", panel: "#262f3a",
    lattice: "#3f4c5c", hubFill: "#1c232c", hubTick: "#586679",
    hubTickFull: "#dfe5ed", edge: "rgba(255, 255, 255, 0.06)",
    surface: "#28313d", surfaceHi: "#313c4a",
    ink: "#a5b0be", inkDim: "#6d798a", inkBright: "#e1e7ef",
    accents: ["#cb8f84", "#7db1b8", "#c3ab7d"],
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
