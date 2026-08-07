import "./style.css";
import { Game } from "./core/game";
import { ALL_LEVELS } from "./levels";
import { Renderer, cellAt } from "./render/renderer";

const canvas = document.querySelector<HTMLCanvasElement>("#board")!;
const levelName = document.querySelector<HTMLElement>("#level-name")!;
const levelStatus = document.querySelector<HTMLElement>("#level-status")!;
const prevButton = document.querySelector<HTMLButtonElement>("#prev")!;
const nextButton = document.querySelector<HTMLButtonElement>("#next")!;
const resetButton = document.querySelector<HTMLButtonElement>("#reset")!;

const renderer = new Renderer(canvas);

const PROGRESS_KEY = "lyne-like.solved";
const INDEX_KEY = "lyne-like.index";

function loadSolved(): Set<string> {
  try {
    const raw = localStorage.getItem(PROGRESS_KEY);
    return new Set(raw ? (JSON.parse(raw) as string[]) : []);
  } catch {
    return new Set();
  }
}

const solved = loadSolved();
let index = clampIndex(Number(localStorage.getItem(INDEX_KEY) ?? 0));
let game = new Game(ALL_LEVELS[index]);
/** Latched so the win chime/label fires once per solve, not once per frame. */
let announcedSolved = false;

function clampIndex(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(ALL_LEVELS.length - 1, Math.max(0, Math.floor(value)));
}

function persist(): void {
  try {
    localStorage.setItem(PROGRESS_KEY, JSON.stringify([...solved]));
    localStorage.setItem(INDEX_KEY, String(index));
  } catch {
    // Private-mode storage failures are not worth interrupting play for.
  }
}

function loadLevel(next: number): void {
  index = clampIndex(next);
  game = new Game(ALL_LEVELS[index]);
  announcedSolved = false;
  persist();
  render();
}

function render(): void {
  renderer.draw(game);

  const done = game.solved;
  if (done && !announcedSolved) {
    announcedSolved = true;
    solved.add(game.level.id);
    persist();
  }

  levelName.textContent = `${game.level.id}  ·  ${index + 1}/${ALL_LEVELS.length}`;
  levelStatus.textContent = done
    ? "solved"
    : solved.has(game.level.id)
      ? "cleared before"
      : "";
  levelStatus.classList.toggle("solved", done);
  prevButton.disabled = index === 0;
  nextButton.disabled = index === ALL_LEVELS.length - 1;
}

// --- input -----------------------------------------------------------------

/** Where the pointer was last frame, so fast drags can be filled in. */
let lastPoint: { x: number; y: number } | null = null;

function pointOf(event: PointerEvent): { x: number; y: number } {
  const rect = canvas.getBoundingClientRect();
  return { x: event.clientX - rect.left, y: event.clientY - rect.top };
}

/**
 * A fast swipe reports a pointer position several cells away from the last one.
 * Walking the straight line between the two samples and feeding every cell it
 * crosses keeps the line following the finger instead of stalling, since the
 * game itself only ever accepts single-step moves.
 */
function dragAlong(from: { x: number; y: number }, to: { x: number; y: number }): boolean {
  const layout = renderer.layoutFor(game.level);
  const distance = Math.hypot(to.x - from.x, to.y - from.y);
  const steps = Math.max(1, Math.ceil((distance / layout.cell) * 2));

  let changed = false;
  for (let s = 1; s <= steps; s++) {
    const t = s / steps;
    const px = from.x + (to.x - from.x) * t;
    const py = from.y + (to.y - from.y) * t;
    const cell = cellAt(game.level, layout, px, py);
    if (cell === null) continue;
    if (game.dragTo(cell) !== "none") changed = true;
  }
  return changed;
}

canvas.addEventListener("pointerdown", (event) => {
  event.preventDefault();
  canvas.setPointerCapture(event.pointerId);

  const point = pointOf(event);
  lastPoint = point;
  const cell = cellAt(game.level, renderer.layoutFor(game.level), point.x, point.y);
  if (cell === null) return;
  if (game.beginAt(cell) !== "none") render();
});

canvas.addEventListener("pointermove", (event) => {
  if (game.activeShape === null || !lastPoint) return;
  event.preventDefault();

  const point = pointOf(event);
  const changed = dragAlong(lastPoint, point);
  lastPoint = point;
  if (changed) render();
});

function endDrag(event: PointerEvent): void {
  if (canvas.hasPointerCapture(event.pointerId)) {
    canvas.releasePointerCapture(event.pointerId);
  }
  game.release();
  lastPoint = null;
  render();
}

canvas.addEventListener("pointerup", endDrag);
canvas.addEventListener("pointercancel", endDrag);

// --- chrome ----------------------------------------------------------------

prevButton.addEventListener("click", () => loadLevel(index - 1));
nextButton.addEventListener("click", () => loadLevel(index + 1));
resetButton.addEventListener("click", () => {
  game.reset();
  announcedSolved = false;
  render();
});

window.addEventListener("keydown", (event) => {
  if (event.key === "ArrowLeft") loadLevel(index - 1);
  else if (event.key === "ArrowRight") loadLevel(index + 1);
  else if (event.key === "r" || event.key === "R") {
    game.reset();
    announcedSolved = false;
    render();
  }
});

new ResizeObserver(() => render()).observe(canvas);
render();

// Exposed so the browser-driven smoke test can drive real games.
Object.assign(window, {
  __game: () => game,
  __loadLevel: loadLevel,
  __renderer: renderer,
});
