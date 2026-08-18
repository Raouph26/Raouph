import { type CellIndex, xOf, yOf } from "../core/types";
import { parseLevel } from "../core/level";
import { solve } from "../core/solver";
import { type paletteFor, traceHubTick, traceShape } from "./palette";

/**
 * The board the mark shows: a real 3x3 level, not a drawing of one.
 *
 * Three colours, six terminals around the edge, and a hub in the middle
 * crossed three times — the smallest board that can hold everything the game
 * does at once. Every route is forced, since no two terminals of a colour touch
 * and the only cell they share is the hub, so it has exactly one solution and
 * `test/rules.test.ts` checks that it still does.
 */
export const MARK_BOARD = ["ABC", ".3A", "BC."];
/**
 * Harbour rather than the opening theme: on the cream ground the hub's arcs and
 * the terminal halos are nearly invisible, and the hub is the whole point of
 * the mark. A dark tile also holds its own on a home screen. The menu mark
 * still follows whatever theme is in force — only the icon is pinned.
 */
export const MARK_THEME = 1;

/**
 * The menu mark and the app icon, painted by one routine so the two can never
 * drift apart.
 *
 * It is the board above, solved — drawn with the same shapes, halos, rings and
 * hub arcs the game itself uses, from the same palette, at the same
 * proportions. Nothing here is a stylisation of the game; it is a small
 * instance of it. Earlier marks were abstractions — crossing lines, then a
 * single turning path — and both ended up saying less about the game than one
 * genuine board does.
 *
 * The solver supplies the lines rather than a hand-written path list, so a mark
 * that disagreed with the rules could not be drawn at all.
 */
export function paintMark(
  ctx: CanvasRenderingContext2D,
  size: number,
  palette: ReturnType<typeof paletteFor>,
  scale = 1,
): void {
  const level = parseLevel("mark", MARK_BOARD);
  const solution = solve(level, { limit: 1 }).solutions[0];

  // The plate the game stands its boards on. Without it the hub's face is the
  // same value as the ground and its three arcs float on nothing, which is the
  // one thing the mark most needs to show.
  const plate = size * 0.96 * scale;
  ctx.fillStyle = palette.panel;
  ctx.beginPath();
  ctx.roundRect(
    (size - plate) / 2,
    (size - plate) / 2,
    plate,
    plate,
    plate * 0.14,
  );
  ctx.fill();

  // Three cells across the icon's side, inset so the outer halos have room.
  const cell = (size / 3) * 0.94 * scale;
  const originX = size / 2 - (cell * level.width) / 2;
  const originY = size / 2 - (cell * level.height) / 2;
  const at = (index: CellIndex): [number, number] => [
    originX + (xOf(level, index) + 0.5) * cell,
    originY + (yOf(level, index) + 0.5) * cell,
  ];

  // Hub faces first, so the lines that cross them pass over the face and stop
  // short of nothing — exactly as they do on the board.
  for (let i = 0; i < level.cells.length; i++) {
    const target = level.cells[i];
    if (target.kind !== "hub") continue;
    const [x, y] = at(i);
    ctx.fillStyle = palette.hubFill;
    ctx.beginPath();
    ctx.arc(x, y, cell * 0.38 * 0.72, 0, Math.PI * 2);
    ctx.fill();
  }

  for (let i = 0; i < level.cells.length; i++) {
    const target = level.cells[i];
    if (target.kind !== "node" || !target.terminal) continue;
    const [x, y] = at(i);
    const outer = cell * 0.48;
    const halo = ctx.createRadialGradient(x, y, outer * 0.3, x, y, outer);
    halo.addColorStop(0, palette.terminalHalo[target.shape]);
    halo.addColorStop(1, "rgba(0, 0, 0, 0)");
    ctx.fillStyle = halo;
    ctx.beginPath();
    ctx.arc(x, y, outer, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.lineWidth = cell * 0.16;
  for (const [shape, path] of solution) {
    ctx.strokeStyle = palette.line[shape];
    ctx.beginPath();
    path.forEach((index, step) => {
      const [x, y] = at(index);
      if (step === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();
  }

  // Every piece here is on its line, so all of them are solid: hollow means
  // "still to connect", and a solved board has none left.
  for (let i = 0; i < level.cells.length; i++) {
    const target = level.cells[i];
    if (target.kind !== "node") continue;
    const [x, y] = at(i);
    ctx.fillStyle = palette.shape[target.shape];
    traceShape(ctx, target.shape, x, y, cell * 0.28, 0, palette.style.cornerFactor);
    ctx.fill();

    if (!target.terminal) continue;
    ctx.strokeStyle = palette.terminalRing[target.shape];
    ctx.lineWidth = Math.max(1.8, cell * 0.05);
    ctx.beginPath();
    ctx.arc(x, y, cell * 0.42, 0, Math.PI * 2);
    ctx.stroke();
  }

  // Hub arcs last, on the rim, so crossing lines never obscure the count.
  for (let i = 0; i < level.cells.length; i++) {
    const target = level.cells[i];
    if (target.kind !== "hub") continue;
    const [x, y] = at(i);
    ctx.lineCap = "round";
    ctx.lineWidth = Math.max(2.5, cell * 0.085);
    ctx.strokeStyle = palette.hubTickFull;
    for (let d = 0; d < target.capacity; d++) {
      traceHubTick(ctx, x, y, cell * 0.38 * 0.82, d, target.capacity);
      ctx.stroke();
    }
  }
}
