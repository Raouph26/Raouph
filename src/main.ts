import "./style.css";
import { AudioEngine } from "./audio/audio";
import { Game } from "./core/game";
import type { CellIndex } from "./core/types";
import { ALL_LEVELS } from "./levels";
import { ViewState } from "./render/animation";
import { Renderer, cellAt } from "./render/renderer";

const canvas = document.querySelector<HTMLCanvasElement>("#board")!;
const levelName = document.querySelector<HTMLElement>("#level-name")!;
const levelStatus = document.querySelector<HTMLElement>("#level-status")!;
const progressLabel = document.querySelector<HTMLElement>("#progress")!;
const prevButton = document.querySelector<HTMLButtonElement>("#prev")!;
const nextButton = document.querySelector<HTMLButtonElement>("#next")!;
const resetButton = document.querySelector<HTMLButtonElement>("#reset")!;
const muteButton = document.querySelector<HTMLButtonElement>("#mute")!;

const renderer = new Renderer(canvas);
const view = new ViewState();
const audio = new AudioEngine();

const PROGRESS_KEY = "lyne-like.solved";
const INDEX_KEY = "lyne-like.index";
const MUTED_KEY = "lyne-like.muted";

function readStored<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw === null ? fallback : (JSON.parse(raw) as T);
  } catch {
    return fallback;
  }
}

const solved = new Set(readStored<string[]>(PROGRESS_KEY, []));
let index = clampIndex(readStored<number>(INDEX_KEY, 0));
let game = new Game(ALL_LEVELS[index]);
let announcedSolved = false;

function clampIndex(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(ALL_LEVELS.length - 1, Math.max(0, Math.floor(value)));
}

function persist(): void {
  try {
    localStorage.setItem(PROGRESS_KEY, JSON.stringify([...solved]));
    localStorage.setItem(INDEX_KEY, String(index));
    localStorage.setItem(MUTED_KEY, JSON.stringify(audio.isMuted));
  } catch {
    // Private-mode storage failures are not worth interrupting play for.
  }
}

// --- frame loop ------------------------------------------------------------

let running = false;
let lastFrame = 0;

function frame(now: number): void {
  const dt = lastFrame === 0 ? 16 : Math.min(64, now - lastFrame);
  lastFrame = now;

  view.update(game, now, dt);
  renderer.draw(game, view, now);
  syncChrome();

  // Idle out once everything has settled, so a static board costs nothing.
  if (view.isAnimating(game, now) || game.activeShape !== null) {
    requestAnimationFrame(frame);
  } else {
    running = false;
  }
}

/** Starts the loop if it has idled out. Safe to call on every interaction. */
function kick(): void {
  if (running) return;
  running = true;
  lastFrame = 0;
  requestAnimationFrame(frame);
}

function syncChrome(): void {
  const done = game.solved;
  levelName.textContent = game.level.id;
  levelStatus.textContent = done
    ? "solved"
    : solved.has(game.level.id)
      ? "cleared"
      : "";
  levelStatus.classList.toggle("is-solved", done);
  progressLabel.textContent = `${index + 1} / ${ALL_LEVELS.length}`;
  prevButton.disabled = index === 0;
  nextButton.disabled = index === ALL_LEVELS.length - 1;
}

function loadLevel(next: number): void {
  index = clampIndex(next);
  game = new Game(ALL_LEVELS[index]);
  announcedSolved = false;
  view.reset(performance.now());
  persist();
  kick();
}

/** Called after any move; fires the win moment exactly once. */
function checkSolved(): void {
  if (!game.solved || announcedSolved) return;
  announcedSolved = true;
  solved.add(game.level.id);
  view.markSolved(performance.now());
  audio.solved();
  persist();
}

// --- input -----------------------------------------------------------------

let lastPoint: { x: number; y: number } | null = null;

function pointOf(event: PointerEvent): { x: number; y: number } {
  const rect = canvas.getBoundingClientRect();
  return { x: event.clientX - rect.left, y: event.clientY - rect.top };
}

/** Reacts to a cell being added to a line: ripple plus a rising note. */
function onReached(cell: CellIndex): void {
  const shape = game.activeShape;
  if (shape === null) return;
  view.pulse(cell, performance.now());
  audio.note(game.pathFor(shape).length - 1);
}

/**
 * A fast swipe reports a pointer position several cells from the last sample.
 * Walking the straight line between them and feeding every crossed cell keeps
 * the line with the finger, since the game only accepts single-step moves.
 */
function dragAlong(from: { x: number; y: number }, to: { x: number; y: number }): void {
  const layout = renderer.layoutFor(game.level);
  const distance = Math.hypot(to.x - from.x, to.y - from.y);
  const steps = Math.max(1, Math.ceil((distance / layout.cell) * 2));

  for (let s = 1; s <= steps; s++) {
    const t = s / steps;
    const cell = cellAt(
      game.level,
      layout,
      from.x + (to.x - from.x) * t,
      from.y + (to.y - from.y) * t,
    );
    if (cell === null) continue;

    const shape = game.activeShape;
    const effect = game.dragTo(cell);
    if (effect === "extend") onReached(cell);
    else if (effect === "retract" && shape !== null) {
      audio.retract(game.pathFor(shape).length);
    }
  }
}

canvas.addEventListener("pointerdown", (event) => {
  event.preventDefault();
  canvas.setPointerCapture(event.pointerId);
  // Browsers only allow audio to start inside a gesture.
  audio.unlock();

  const point = pointOf(event);
  lastPoint = point;
  const cell = cellAt(game.level, renderer.layoutFor(game.level), point.x, point.y);
  if (cell === null) return;

  const effect = game.beginAt(cell);
  if (effect === "start") {
    // Restarting a line un-solves the board, so the win can fire again.
    announcedSolved = game.solved;
    if (!game.solved) view.clearSolved();
    view.pulse(cell, performance.now());
    audio.note(0, { gain: 0.07, duration: 0.9 });
  } else if (effect === "truncate") {
    announcedSolved = game.solved;
    if (!game.solved) view.clearSolved();
    audio.note(0, { gain: 0.05, duration: 0.7 });
  }
  if (effect !== "none") kick();
});

canvas.addEventListener("pointermove", (event) => {
  if (game.activeShape === null || !lastPoint) return;
  event.preventDefault();
  const point = pointOf(event);
  dragAlong(lastPoint, point);
  lastPoint = point;
  checkSolved();
  kick();
});

function endDrag(event: PointerEvent): void {
  if (canvas.hasPointerCapture(event.pointerId)) {
    canvas.releasePointerCapture(event.pointerId);
  }
  game.release();
  lastPoint = null;
  checkSolved();
  kick();
}

canvas.addEventListener("pointerup", endDrag);
canvas.addEventListener("pointercancel", endDrag);

// --- chrome ----------------------------------------------------------------

function resetLevel(): void {
  game.reset();
  announcedSolved = false;
  view.reset(performance.now());
  kick();
}

prevButton.addEventListener("click", () => loadLevel(index - 1));
nextButton.addEventListener("click", () => loadLevel(index + 1));
resetButton.addEventListener("click", resetLevel);

muteButton.addEventListener("click", () => {
  audio.unlock();
  const muted = !audio.isMuted;
  audio.setMuted(muted);
  muteButton.classList.toggle("is-muted", muted);
  muteButton.setAttribute("aria-label", muted ? "Unmute sound" : "Mute sound");
  persist();
});

window.addEventListener("keydown", (event) => {
  if (event.key === "ArrowLeft") loadLevel(index - 1);
  else if (event.key === "ArrowRight") loadLevel(index + 1);
  else if (event.key === "r" || event.key === "R") resetLevel();
});

if (readStored<boolean>(MUTED_KEY, false)) {
  audio.setMuted(true);
  muteButton.classList.add("is-muted");
}

new ResizeObserver(() => kick()).observe(canvas);
view.reset(performance.now());
kick();

// Exposed so the browser-driven smoke test can drive real games.
Object.assign(window, {
  __game: () => game,
  __loadLevel: loadLevel,
  __checkSolved: checkSolved,
  __renderer: renderer,
});
