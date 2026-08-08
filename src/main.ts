import "./style.css";
import { AudioEngine } from "./audio/audio";
import {
  CHAPTER_COUNT,
  DAILY_STAGES,
  STAGES_PER_CHAPTER,
  classicId,
  classicLevel,
  dailyId,
  dailyLevel,
  todayKey,
} from "./core/chapters";
import { Game } from "./core/game";
import type { CellIndex, Level } from "./core/types";
import { Progress } from "./progress";
import { ViewState } from "./render/animation";
import { DEFAULT_PALETTE, traceHubTick, traceShape } from "./render/palette";
import { Renderer, cellAt } from "./render/renderer";

/** The brand mark only ever uses the first two families. */
type ShapeIdLike = 0 | 1;

const $ = <T extends HTMLElement>(id: string): T =>
  document.getElementById(id) as T;

const canvas = $<HTMLCanvasElement>("board");
const renderer = new Renderer(canvas);
const view = new ViewState();
const audio = new AudioEngine();
const progress = new Progress();

type ScreenName = "menu" | "chapters" | "stages" | "game";
type Mode = "classic" | "daily";

interface Slot {
  mode: Mode;
  chapter: number;
  stage: number;
}

let slot: Slot = { mode: "classic", chapter: 1, stage: 1 };
let game: Game | null = null;
let announcedSolved = false;
const day = todayKey();

// --- screens ---------------------------------------------------------------

function showScreen(name: ScreenName): void {
  for (const screen of ["menu", "chapters", "stages", "game"] as ScreenName[]) {
    $(`screen-${screen}`).hidden = screen !== name;
  }
  if (name !== "game") stopLoop();
}

function levelIdFor(target: Slot): string {
  return target.mode === "classic"
    ? classicId(target.chapter, target.stage)
    : dailyId(day, target.stage);
}

function buildLevel(target: Slot): Level {
  return target.mode === "classic"
    ? classicLevel(target.chapter, target.stage)
    : dailyLevel(day, target.stage);
}

function stageCount(mode: Mode): number {
  return mode === "classic" ? STAGES_PER_CHAPTER : DAILY_STAGES;
}

function isUnlocked(target: Slot): boolean {
  return target.mode === "classic"
    ? progress.isStageUnlocked(target.chapter, target.stage)
    : progress.isDailyStageUnlocked(day, target.stage);
}

/**
 * The hardest boards take a moment to generate. Building the next stage while
 * the player is still on this one means the wait almost never lands during a
 * tap, since players move through stages in order.
 */
function prefetch(target: Slot): void {
  if (target.stage < 1 || target.stage > stageCount(target.mode)) return;
  const idle =
    window.requestIdleCallback ?? ((cb: () => void) => window.setTimeout(cb, 220));
  idle(() => {
    try {
      buildLevel(target);
    } catch {
      // A prefetch failure is harmless; the real load will report it.
    }
  });
}

function prefetchNext(target: Slot): void {
  prefetch({ ...target, stage: target.stage + 1 });
}

/** The stage a player opening this list is most likely to tap next. */
function prefetchLikely(mode: Mode, chapter: number): void {
  const total = stageCount(mode);
  for (let stage = 1; stage <= total; stage++) {
    const candidate: Slot = { mode, chapter, stage };
    if (!progress.isSolved(levelIdFor(candidate))) {
      prefetch(candidate);
      return;
    }
  }
}

// --- menu ------------------------------------------------------------------

/**
 * The menu mark, drawn in the game's own language rather than set as an icon:
 * two lines crossing at a hub, which is the core mechanic in miniature.
 */
function drawBrandMark(): void {
  const mark = document.getElementById("brand-mark") as HTMLCanvasElement | null;
  const ctx = mark?.getContext("2d");
  if (!mark || !ctx) return;

  const dpr = window.devicePixelRatio || 1;
  const size = 132;
  mark.width = size * dpr;
  mark.height = size * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, size, size);

  const mid = size / 2;
  const reach = size * 0.32;
  const corners: [number, number][] = [
    [mid - reach, mid - reach],
    [mid + reach, mid + reach],
    [mid + reach, mid - reach],
    [mid - reach, mid + reach],
  ];

  ctx.lineCap = "round";
  ctx.lineWidth = 6;
  for (const [shape, pair] of [
    [0, [corners[0], corners[1]]],
    [1, [corners[2], corners[3]]],
  ] as [ShapeIdLike, [number, number][]][]) {
    ctx.strokeStyle = DEFAULT_PALETTE.line[shape];
    ctx.beginPath();
    ctx.moveTo(pair[0][0], pair[0][1]);
    ctx.lineTo(pair[1][0], pair[1][1]);
    ctx.stroke();
  }

  // Hub face, matching the board: a clear centre with arcs around the rim.
  ctx.fillStyle = DEFAULT_PALETTE.hubFill;
  ctx.beginPath();
  ctx.arc(mid, mid, 15, 0, Math.PI * 2);
  ctx.fill();
  ctx.lineWidth = 5;
  ctx.strokeStyle = DEFAULT_PALETTE.hubTickFull;
  for (let d = 0; d < 2; d++) {
    traceHubTick(ctx, mid, mid, 17, d, 2);
    ctx.stroke();
  }

  for (const [shape, point] of [
    [0, corners[0]],
    [0, corners[1]],
    [1, corners[2]],
    [1, corners[3]],
  ] as [ShapeIdLike, [number, number]][]) {
    ctx.fillStyle = DEFAULT_PALETTE.shape[shape];
    traceShape(ctx, shape, point[0], point[1], 15);
    ctx.fill();
  }
}

function renderMenu(): void {
  const classicTotal = CHAPTER_COUNT * STAGES_PER_CHAPTER;
  const solvedTotal = progress.totalClassicSolved();
  $("classic-meta").textContent = `${solvedTotal} of ${classicTotal} solved`;
  $("classic-fill").style.width = `${(solvedTotal / classicTotal) * 100}%`;

  const dailyDone = progress.dailySolvedCount(day);
  $("daily-meta").textContent =
    dailyDone === DAILY_STAGES
      ? "Today complete"
      : `${dailyDone} of ${DAILY_STAGES} today`;
  $("daily-fill").style.width = `${(dailyDone / DAILY_STAGES) * 100}%`;

  $("menu-mute").textContent = progress.muted ? "Sound off" : "Sound on";
}

function renderChapters(): void {
  const list = $("chapter-list");
  list.replaceChildren();

  let unlockedCount = 0;
  for (let chapter = 1; chapter <= CHAPTER_COUNT; chapter++) {
    const unlocked = progress.isChapterUnlocked(chapter);
    if (unlocked) unlockedCount++;
    const done = progress.chapterSolvedCount(chapter);

    const button = document.createElement("button");
    button.type = "button";
    button.className = "chapter";
    button.disabled = !unlocked;
    button.classList.toggle("is-locked", !unlocked);
    button.classList.toggle("is-complete", done === STAGES_PER_CHAPTER);

    const index = document.createElement("span");
    index.className = "chapter-index";
    index.textContent = String(chapter).padStart(2, "0");

    const body = document.createElement("span");
    body.className = "chapter-body";
    // Named even when locked: a wall of "Locked" tells the player nothing and
    // makes the game look shut rather than long.
    const name = document.createElement("span");
    name.className = "chapter-name";
    name.textContent = `Chapter ${chapter}`;
    const meter = document.createElement("span");
    meter.className = "meter";
    const fill = document.createElement("span");
    fill.className = "meter-fill";
    fill.style.width = `${(done / STAGES_PER_CHAPTER) * 100}%`;
    meter.append(fill);
    body.append(name, meter);

    const count = document.createElement("span");
    count.className = "chapter-count";
    count.textContent = unlocked ? `${done}/${STAGES_PER_CHAPTER}` : "Locked";

    button.append(index, body, count);
    if (unlocked) {
      button.addEventListener("click", () => openStages("classic", chapter));
    }
    list.append(button);
  }

  $("chapters-meta").textContent = `${unlockedCount} open`;
}

function renderStages(mode: Mode, chapter: number): void {
  const grid = $("stage-grid");
  grid.replaceChildren();

  const total = stageCount(mode);
  for (let stage = 1; stage <= total; stage++) {
    const target: Slot = { mode, chapter, stage };
    const id = levelIdFor(target);
    const unlocked = isUnlocked(target);
    const done = progress.isSolved(id);

    const button = document.createElement("button");
    button.type = "button";
    button.className = "stage";
    button.disabled = !unlocked;
    button.classList.toggle("is-solved", done);
    button.classList.toggle("is-locked", !unlocked);
    button.textContent = unlocked ? String(stage) : "";
    button.setAttribute("aria-label", `Stage ${stage}`);
    if (unlocked) button.addEventListener("click", () => startLevel(target));
    grid.append(button);
  }

  const solvedHere =
    mode === "classic"
      ? progress.chapterSolvedCount(chapter)
      : progress.dailySolvedCount(day);
  $("stages-title").textContent = mode === "classic" ? `Chapter ${chapter}` : "Daily";
  $("stages-meta").textContent = `${solvedHere}/${total}`;
}

function openStages(mode: Mode, chapter: number): void {
  slot = { mode, chapter, stage: slot.stage };
  renderStages(mode, chapter);
  showScreen("stages");
  // Build the likely next tap while the player is still reading the grid.
  prefetchLikely(mode, chapter);
}

// --- game ------------------------------------------------------------------

function startLevel(target: Slot): void {
  slot = target;
  showScreen("game");

  // Yield a frame before generating so the screen swap paints first; the
  // hardest boards take long enough that a tap would otherwise feel stuck.
  $("level-name").textContent = "…";
  $("level-status").textContent = "";
  window.setTimeout(() => {
    game = new Game(buildLevel(target));
    announcedSolved = false;
    view.reset(performance.now());
    syncChrome();
    kick();
    prefetchNext(target);
  }, 0);
}

let running = false;
let lastFrame = 0;

function frame(now: number): void {
  if (!game) {
    running = false;
    return;
  }
  const dt = lastFrame === 0 ? 16 : Math.min(64, now - lastFrame);
  lastFrame = now;

  for (const shape of view.update(game, now, dt)) {
    audio.lineComplete(game.pathFor(shape).length);
  }
  renderer.draw(game, view, now);

  if (view.isAnimating(game, now) || game.activeShape !== null) {
    requestAnimationFrame(frame);
  } else {
    running = false;
  }
}

function kick(): void {
  if (running || !game) return;
  running = true;
  lastFrame = 0;
  requestAnimationFrame(frame);
}

function stopLoop(): void {
  running = false;
}

function syncChrome(): void {
  if (!game) return;
  const total = stageCount(slot.mode);
  const done = game.solved;
  $("level-name").textContent =
    slot.mode === "classic" ? `${slot.chapter} — ${slot.stage}` : `Daily ${slot.stage}`;
  const status = $("level-status");
  status.textContent = done
    ? "solved"
    : progress.isSolved(levelIdFor(slot))
      ? "cleared"
      : "";
  status.classList.toggle("is-solved", done);
  $("progress").textContent = `${slot.stage} / ${total}`;
  ($("prev") as HTMLButtonElement).disabled = slot.stage <= 1;
  ($("next") as HTMLButtonElement).disabled =
    slot.stage >= total || !isUnlocked({ ...slot, stage: slot.stage + 1 });
}

function checkSolved(): void {
  if (!game || !game.solved || announcedSolved) return;
  announcedSolved = true;
  progress.markSolved(levelIdFor(slot));
  view.markSolved(performance.now());
  audio.solved();
  syncChrome();
  prefetchNext(slot);
}

// --- input -----------------------------------------------------------------

let lastPoint: { x: number; y: number } | null = null;

function pointOf(event: PointerEvent): { x: number; y: number } {
  const rect = canvas.getBoundingClientRect();
  return { x: event.clientX - rect.left, y: event.clientY - rect.top };
}

function onReached(cell: CellIndex): void {
  if (!game || game.activeShape === null) return;
  view.pulse(cell, performance.now());
  audio.note(game.pathFor(game.activeShape).length - 1);
}

/**
 * A fast swipe reports a pointer position several cells from the last sample.
 * Walking the straight line between them keeps the drawn line with the finger,
 * since the game only ever accepts single-step moves.
 */
function dragAlong(from: { x: number; y: number }, to: { x: number; y: number }): void {
  if (!game) return;
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
  if (!game) return;
  event.preventDefault();
  canvas.setPointerCapture(event.pointerId);
  audio.unlock();

  const point = pointOf(event);
  lastPoint = point;
  const cell = cellAt(game.level, renderer.layoutFor(game.level), point.x, point.y);
  if (cell === null) return;

  const effect = game.beginAt(cell);
  if (effect === "start" || effect === "truncate") {
    announcedSolved = game.solved;
    if (!game.solved) view.clearSolved();
    if (effect === "start") view.pulse(cell, performance.now());
    audio.note(0, { gain: 0.05, duration: 1.1 });
  }
  if (effect !== "none") kick();
});

canvas.addEventListener("pointermove", (event) => {
  if (!game || game.activeShape === null || !lastPoint) return;
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
  game?.release();
  lastPoint = null;
  checkSolved();
  kick();
}

canvas.addEventListener("pointerup", endDrag);
canvas.addEventListener("pointercancel", endDrag);

// --- chrome ----------------------------------------------------------------

$("go-classic").addEventListener("click", () => {
  audio.unlock();
  renderChapters();
  showScreen("chapters");
});

$("go-daily").addEventListener("click", () => {
  audio.unlock();
  openStages("daily", 1);
});

$("chapters-back").addEventListener("click", () => {
  renderMenu();
  showScreen("menu");
});

$("stages-back").addEventListener("click", () => {
  if (slot.mode === "classic") {
    renderChapters();
    showScreen("chapters");
  } else {
    renderMenu();
    showScreen("menu");
  }
});

$("game-back").addEventListener("click", () => {
  renderStages(slot.mode, slot.chapter);
  showScreen("stages");
});

$("reset").addEventListener("click", () => {
  if (!game) return;
  game.reset();
  announcedSolved = false;
  view.reset(performance.now());
  syncChrome();
  kick();
});

$("prev").addEventListener("click", () => {
  if (slot.stage > 1) startLevel({ ...slot, stage: slot.stage - 1 });
});

$("next").addEventListener("click", () => {
  const next = { ...slot, stage: slot.stage + 1 };
  if (next.stage <= stageCount(slot.mode) && isUnlocked(next)) startLevel(next);
});

$("menu-mute").addEventListener("click", () => {
  audio.unlock();
  progress.muted = !progress.muted;
  audio.setMuted(progress.muted);
  progress.save();
  renderMenu();
});

window.addEventListener("keydown", (event) => {
  if ($("screen-game").hidden) return;
  if (event.key === "ArrowLeft") $("prev").click();
  else if (event.key === "ArrowRight") $("next").click();
  else if (event.key === "r" || event.key === "R") $("reset").click();
});

new ResizeObserver(() => {
  if (!$("screen-game").hidden) kick();
}).observe(canvas);

if (progress.muted) audio.setMuted(true);
drawBrandMark();
renderMenu();
showScreen("menu");

// Exposed so the browser-driven smoke test can drive real games.
Object.assign(window, {
  __game: () => game,
  __startLevel: (mode: Mode, chapter: number, stage: number) =>
    startLevel({ mode, chapter, stage }),
  __showScreen: showScreen,
  __renderer: renderer,
});
