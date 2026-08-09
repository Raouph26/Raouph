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
import { type CellIndex, type Level, inBounds, xOf, yOf } from "./core/types";
import { AUTO_THEME, Progress } from "./progress";
import { ViewState, clamp01, easeInOutCubic } from "./render/animation";
import {
  type ThemeSpec,
  DEFAULT_PALETTE,
  THEMES,
  paletteFor,
  themeForChapter,
  traceHubTick,
  traceShape,
} from "./render/palette";
import { Renderer, cellAt, centerOf } from "./render/renderer";

const $ = <T extends HTMLElement>(id: string): T =>
  document.getElementById(id) as T;

const canvas = $<HTMLCanvasElement>("board");
const renderer = new Renderer(canvas);
const audio = new AudioEngine();
const progress = new Progress();

/** The brand mark only ever uses the first two families. */
type ShapeIdLike = 0 | 1;

type ScreenName = "menu" | "chapters" | "stages" | "themes" | "game";
type Mode = "classic" | "daily";

interface Slot {
  mode: Mode;
  chapter: number;
  stage: number;
}

/** How long the board takes to slide aside when a stage is finished. */
const SWIPE_MS = 460;
/** Pause after solving, so the spin and the chord land before moving on. */
const ADVANCE_DELAY_MS = 1500;

let slot: Slot = { mode: "classic", chapter: 1, stage: 1 };
let game: Game | null = null;
let view = new ViewState();
let announcedSolved = false;
let advanceTimer = 0;
const day = todayKey();

/** The outgoing board, still live, while it slides off screen. */
interface Transition {
  game: Game;
  view: ViewState;
  startedAt: number;
  direction: 1 | -1;
}
let transition: Transition | null = null;

// --- theme -----------------------------------------------------------------

/**
 * The theme in force: whatever the player pinned, otherwise the one belonging
 * to the chapter being played. Daily follows the date so it also changes.
 */
function currentTheme(): ThemeSpec {
  const pinned = progress.pinnedTheme();
  if (pinned) return pinned;
  if (slot.mode === "daily") {
    const dayNumber = Number(day.replaceAll("-", "")) || 0;
    return THEMES[dayNumber % THEMES.length];
  }
  return themeForChapter(slot.chapter);
}

/**
 * Themes drive the canvas and the interface from one definition, so the board
 * and the chrome around it can never drift apart.
 */
function applyTheme(): void {
  const theme = currentTheme();
  renderer.setPalette(paletteFor(theme));

  const root = document.documentElement.style;
  root.setProperty("--bg", theme.background);
  root.setProperty("--bg-lift", theme.backgroundLift);
  root.setProperty("--surface", theme.surface);
  root.setProperty("--surface-hi", theme.surfaceHi);
  root.setProperty("--ink", theme.ink);
  root.setProperty("--ink-dim", theme.inkDim);
  root.setProperty("--ink-bright", theme.inkBright);
  root.setProperty("--accent", theme.accents[1]);
  // "Solved" used to be a fixed mint green, which fought every palette it sat
  // in. It reads as the theme's own cool accent instead.
  root.setProperty("--good", theme.accents[1]);
  // A light ground needs dark hairlines and dark hover washes; white-on-white
  // simply vanishes. Both come from the theme's own edge colour.
  root.setProperty("--hairline", theme.edge);
  root.setProperty(
    "--hover",
    theme.light ? "rgba(0, 0, 0, 0.045)" : "rgba(255, 255, 255, 0.05)",
  );
  root.setProperty("--sunken", theme.light ? "rgba(0, 0, 0, 0.08)" : "rgba(255, 255, 255, 0.07)");
  document.documentElement.style.colorScheme = theme.light ? "light" : "dark";

  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute("content", theme.background);
  drawBrandMark();
}

// --- screens ---------------------------------------------------------------

function showScreen(name: ScreenName): void {
  const screens: ScreenName[] = ["menu", "chapters", "stages", "themes", "game"];
  for (const screen of screens) $(`screen-${screen}`).hidden = screen !== name;
  if (name !== "game") {
    cancelAdvance();
    running = false;
  }
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

  const palette = paletteFor(currentTheme());
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
    ctx.strokeStyle = palette.line[shape];
    ctx.beginPath();
    ctx.moveTo(pair[0][0], pair[0][1]);
    ctx.lineTo(pair[1][0], pair[1][1]);
    ctx.stroke();
  }

  ctx.fillStyle = palette.hubFill;
  ctx.beginPath();
  ctx.arc(mid, mid, 15, 0, Math.PI * 2);
  ctx.fill();
  ctx.lineWidth = 5;
  ctx.strokeStyle = palette.hubTickFull;
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
    ctx.fillStyle = palette.shape[shape];
    traceShape(ctx, shape, point[0], point[1], 15);
    ctx.fill();
  }
}

/** The furthest classic stage still unsolved — where "Continue" resumes. */
function resumeSlot(): Slot {
  for (let chapter = 1; chapter <= CHAPTER_COUNT; chapter++) {
    if (!progress.isChapterUnlocked(chapter)) break;
    const stage = progress.furthestStage(chapter);
    if (!progress.isSolved(classicId(chapter, stage))) {
      return { mode: "classic", chapter, stage };
    }
  }
  return { mode: "classic", chapter: 1, stage: 1 };
}

function renderMenu(): void {
  const resume = resumeSlot();
  $("continue-meta").textContent =
    `Chapter ${resume.chapter}  ·  Stage ${resume.stage}`;

  const classicTotal = CHAPTER_COUNT * STAGES_PER_CHAPTER;
  $("classic-meta").textContent = `${progress.totalClassicSolved()} / ${classicTotal}`;
  const dailyDone = progress.dailySolvedCount(day);
  $("daily-meta").textContent =
    dailyDone === DAILY_STAGES ? "Complete" : `${dailyDone} / ${DAILY_STAGES}`;
  $("themes-meta-menu").textContent = progress.pinnedTheme()?.name ?? "By chapter";

  $("menu-mute").textContent = progress.muted ? "Sound off" : "Sound on";
}

function themeRow(options: {
  name: string;
  note: string;
  accents: readonly string[];
  background: string;
  selected: boolean;
  locked: boolean;
  onPick?: () => void;
}): HTMLButtonElement {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "theme";
  button.disabled = options.locked;
  button.classList.toggle("is-locked", options.locked);
  button.classList.toggle("is-active", options.selected);

  const swatches = document.createElement("span");
  swatches.className = "theme-swatches";
  swatches.style.background = options.background;
  for (const accent of options.accents) {
    const dot = document.createElement("span");
    dot.className = "theme-dot";
    dot.style.background = accent;
    swatches.append(dot);
  }

  const body = document.createElement("span");
  body.className = "theme-body";
  const name = document.createElement("span");
  name.className = "theme-name";
  name.textContent = options.name;
  const note = document.createElement("span");
  note.className = "theme-note";
  note.textContent = options.note;
  body.append(name, note);

  button.append(swatches, body);
  if (options.onPick) button.addEventListener("click", options.onPick);
  return button;
}

function renderThemes(): void {
  const list = $("theme-list");
  list.replaceChildren();
  const cleared = progress.clearedChapters();
  const pinned = progress.pinnedTheme();

  const following = themeForChapter(slot.chapter);
  list.append(
    themeRow({
      name: "By chapter",
      note: pinned ? "Tap to use" : `Following ${following.name}`,
      accents: following.accents,
      background: following.background,
      selected: pinned === null,
      locked: false,
      onPick: () => {
        progress.themeId = AUTO_THEME;
        progress.save();
        applyTheme();
        renderThemes();
      },
    }),
  );

  for (const theme of THEMES) {
    const unlocked = progress.isThemeUnlocked(theme.id);
    const needed = theme.unlockChapters;
    list.append(
      themeRow({
        name: theme.name,
        note: unlocked
          ? pinned?.id === theme.id
            ? "Selected"
            : "Tap to use"
          : `Clear ${needed} chapter${needed === 1 ? "" : "s"} — ${cleared} done`,
        accents: theme.accents,
        background: theme.background,
        selected: pinned?.id === theme.id,
        locked: !unlocked,
        onPick: unlocked
          ? () => {
              progress.themeId = theme.id;
              progress.save();
              applyTheme();
              renderThemes();
            }
          : undefined,
      }),
    );
  }

  const unlockedCount = THEMES.filter((t) => progress.isThemeUnlocked(t.id)).length;
  $("themes-meta").textContent = `${unlockedCount}/${THEMES.length}`;
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

    const chevron = document.createElement("span");
    chevron.className = "chevron";
    chevron.setAttribute("aria-hidden", "true");

    button.append(index, body, count, chevron);
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
    const unlocked = isUnlocked(target);
    const done = progress.isSolved(levelIdFor(target));

    const button = document.createElement("button");
    button.type = "button";
    button.className = "stage";
    button.disabled = !unlocked;
    button.classList.toggle("is-solved", done);
    button.classList.toggle("is-locked", !unlocked);
    // Exactly one tile is ringed: the first playable stage not yet solved.
    button.classList.toggle("is-current", unlocked && !done);
    // Locked stages still show their number. A grid of blank tiles reads as
    // broken rather than as content waiting to be earned.
    button.textContent = String(stage);
    button.setAttribute(
      "aria-label",
      unlocked ? `Stage ${stage}` : `Stage ${stage}, locked`,
    );
    if (unlocked) button.addEventListener("click", () => startLevel(target, 0));
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
  applyTheme();
  renderStages(mode, chapter);
  showScreen("stages");
  prefetchLikely(mode, chapter);
}

// --- game ------------------------------------------------------------------

function startLevel(target: Slot, direction: 0 | 1 | -1): void {
  cancelAdvance();
  const outgoing = direction !== 0 && game ? { game, view } : null;
  slot = target;
  // Each chapter wears its own look, so the theme is re-resolved on entry.
  applyTheme();
  showScreen("game");

  if (!outgoing) {
    // Yield a frame before generating so the screen swap paints first; the
    // hardest boards take long enough that a tap would otherwise feel stuck.
    $("level-name").textContent = "…";
    $("level-status").textContent = "";
  }

  window.setTimeout(() => {
    game = new Game(buildLevel(target));
    view = new ViewState();
    view.reset(performance.now());
    announcedSolved = false;

    if (outgoing) {
      transition = {
        game: outgoing.game,
        view: outgoing.view,
        startedAt: performance.now(),
        direction: direction === -1 ? -1 : 1,
      };
    }

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

  if (transition) {
    const width = canvas.clientWidth;
    const eased = easeInOutCubic(clamp01((now - transition.startedAt) / SWIPE_MS));
    const dir = transition.direction;

    // Both boards stay live through the slide — the outgoing one keeps its win
    // glow breathing instead of freezing into a snapshot.
    transition.view.update(transition.game, now, dt);
    renderer.beginFrame();
    renderer.drawBoard(transition.game, transition.view, now, -eased * width * dir);
    renderer.drawBoard(game, view, now, (1 - eased) * width * dir);
    if (eased >= 1) transition = null;
    requestAnimationFrame(frame);
    return;
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

function cancelAdvance(): void {
  if (advanceTimer) {
    window.clearTimeout(advanceTimer);
    advanceTimer = 0;
  }
}

/** Move on by itself, so a finished puzzle never needs a tap to leave. */
function scheduleAdvance(): void {
  cancelAdvance();
  advanceTimer = window.setTimeout(() => {
    advanceTimer = 0;
    const next: Slot = { ...slot, stage: slot.stage + 1 };
    if (next.stage <= stageCount(slot.mode)) {
      startLevel(next, 1);
    } else {
      renderStages(slot.mode, slot.chapter);
      showScreen("stages");
    }
  }, ADVANCE_DELAY_MS);
}

function checkSolved(): void {
  if (!game || !game.solved || announcedSolved) return;
  announcedSolved = true;
  progress.markSolved(levelIdFor(slot));
  view.markSolved(performance.now());
  audio.solved();
  syncChrome();
  prefetchNext(slot);
  scheduleAdvance();
}

// --- input -----------------------------------------------------------------

function pointOf(event: PointerEvent): { x: number; y: number } {
  const rect = canvas.getBoundingClientRect();
  return { x: event.clientX - rect.left, y: event.clientY - rect.top };
}

/**
 * The cell a drag is actually asking for.
 *
 * Committing as soon as the pointer crosses a cell boundary makes diagonals
 * nearly impossible: travelling from one cell to its diagonal neighbour, a
 * finger inevitably clips the corner of an orthogonal neighbour on the way, so
 * the line commits sideways and the diagonal is gone before the finger arrives.
 *
 * Requiring the pointer to reach the neighbourhood of a cell's centre fixes it.
 * A straight diagonal drag passes about 0.7 cells from the orthogonal centres —
 * comfortably outside this radius — while landing exactly on the diagonal one.
 */
const COMMIT_RADIUS = 0.42;

function dragTargetFor(point: { x: number; y: number }): CellIndex | null {
  if (!game) return null;
  const level = game.level;
  const layout = renderer.layoutFor(level);

  let best: CellIndex | null = null;
  let bestDistance = layout.cell * COMMIT_RADIUS;
  for (let i = 0; i < level.cells.length; i++) {
    const centre = centerOf(level, layout, i);
    const distance = Math.hypot(centre.x - point.x, centre.y - point.y);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = i;
    }
  }
  return best;
}

/**
 * Where a press should grab. A press landing just outside a piece snaps to the
 * nearest one, so starting a line does not demand precision that a fingertip
 * cannot deliver. Only presses snap — dragging still follows the grid exactly.
 */
function pickStartCell(point: { x: number; y: number }): CellIndex | null {
  if (!game) return null;
  const level = game.level;
  const layout = renderer.layoutFor(level);

  const raw = cellAt(level, layout, point.x, point.y);
  if (raw !== null && level.cells[raw].kind === "node") return raw;

  let best: CellIndex | null = null;
  let bestDistance = layout.cell * 0.7;
  for (const [i, cell] of level.cells.entries()) {
    if (cell.kind !== "node") continue;
    const centre = centerOf(level, layout, i);
    const distance = Math.hypot(centre.x - point.x, centre.y - point.y);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = i;
    }
  }
  return best ?? raw;
}

function onReached(cell: CellIndex): void {
  if (!game || game.activeShape === null) return;
  view.pulse(cell, performance.now());
  audio.note(game.pathFor(game.activeShape).length - 1);
}

/**
 * Walks the line from its head towards `target`, one cell at a time.
 *
 * The obvious approach — sampling points along the straight screen path between
 * two pointer events — is subtly broken: as soon as one sample lands on a cell
 * that is not adjacent to the head, the game rejects it, and every later sample
 * sits even further away, so the line stays stuck until the finger happens to
 * come back beside the head. Stepping through the grid instead means every move
 * attempted is adjacent by construction, so the line always keeps up.
 */
function stepToward(target: CellIndex): void {
  if (!game) return;
  const level = game.level;

  // Bounded purely as a guard; a board is never this wide.
  for (let guard = 0; guard < 64; guard++) {
    const shape = game.activeShape;
    if (shape === null) return;
    const path = game.pathFor(shape);
    if (path.length === 0) return;

    const head = path[path.length - 1];
    if (head === target) return;

    const hx = xOf(level, head);
    const hy = yOf(level, head);
    const dx = Math.sign(xOf(level, target) - hx);
    const dy = Math.sign(yOf(level, target) - hy);

    // Prefer the direct step. Going round a blocked corner is only offered
    // while catching up over distance: when the finger is on the very next
    // cell, a diagonal it asked for must not quietly become an L instead.
    const chebyshev = Math.max(
      Math.abs(xOf(level, target) - hx),
      Math.abs(yOf(level, target) - hy),
    );
    const candidates: [number, number][] = [[dx, dy]];
    if (dx !== 0 && dy !== 0 && chebyshev > 1) candidates.push([dx, 0], [0, dy]);

    let moved = false;
    for (const [sx, sy] of candidates) {
      if (sx === 0 && sy === 0) continue;
      const nx = hx + sx;
      const ny = hy + sy;
      if (!inBounds(level, nx, ny)) continue;

      const next = ny * level.width + nx;
      const effect = game.dragTo(next);
      if (effect === "none") continue;
      if (effect === "extend") onReached(next);
      else if (effect === "retract") audio.retract(game.pathFor(shape).length);
      moved = true;
      break;
    }
    if (!moved) return;
  }
}

canvas.addEventListener("pointerdown", (event) => {
  // Ignore taps mid-slide, or they would land on the board arriving behind.
  if (!game || transition) return;
  event.preventDefault();
  canvas.setPointerCapture(event.pointerId);
  audio.unlock();

  const cell = pickStartCell(pointOf(event));
  if (cell === null) return;

  const effect = game.beginAt(cell);
  if (effect === "start" || effect === "truncate") {
    // Editing a solved board means the player wants to keep playing with it.
    cancelAdvance();
    announcedSolved = game.solved;
    if (!game.solved) view.clearSolved();
    if (effect === "start") view.pulse(cell, performance.now());
    audio.note(0, { gain: 0.05, duration: 1.1 });
  }
  if (effect !== "none") kick();
});

canvas.addEventListener("pointermove", (event) => {
  if (!game || game.activeShape === null) return;
  event.preventDefault();

  const cell = dragTargetFor(pointOf(event));
  if (cell !== null) stepToward(cell);
  checkSolved();
  kick();
});

function endDrag(event: PointerEvent): void {
  if (canvas.hasPointerCapture(event.pointerId)) {
    canvas.releasePointerCapture(event.pointerId);
  }
  game?.release();
  checkSolved();
  kick();
}

canvas.addEventListener("pointerup", endDrag);
canvas.addEventListener("pointercancel", endDrag);

// --- chrome ----------------------------------------------------------------

function setMuted(muted: boolean): void {
  progress.muted = muted;
  audio.setMuted(muted);
  progress.save();
  $("menu-mute").textContent = muted ? "Sound off" : "Sound on";
  $("game-mute").classList.toggle("is-muted", muted);
  $("game-mute").setAttribute("aria-label", muted ? "Unmute sound" : "Mute sound");
}

$("go-continue").addEventListener("click", () => {
  audio.unlock();
  startLevel(resumeSlot(), 0);
});

$("go-classic").addEventListener("click", () => {
  audio.unlock();
  renderChapters();
  showScreen("chapters");
});

$("go-daily").addEventListener("click", () => {
  audio.unlock();
  openStages("daily", 1);
});

$("go-themes").addEventListener("click", () => {
  renderThemes();
  showScreen("themes");
});

$("themes-back").addEventListener("click", () => {
  renderMenu();
  showScreen("menu");
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

$("game-mute").addEventListener("click", () => {
  audio.unlock();
  setMuted(!progress.muted);
});

$("reset").addEventListener("click", () => {
  if (!game) return;
  cancelAdvance();
  game.reset();
  announcedSolved = false;
  view = new ViewState();
  view.reset(performance.now());
  syncChrome();
  kick();
});

$("prev").addEventListener("click", () => {
  if (slot.stage > 1) startLevel({ ...slot, stage: slot.stage - 1 }, -1);
});

$("next").addEventListener("click", () => {
  const next = { ...slot, stage: slot.stage + 1 };
  if (next.stage <= stageCount(slot.mode) && isUnlocked(next)) startLevel(next, 1);
});

$("menu-mute").addEventListener("click", () => {
  audio.unlock();
  setMuted(!progress.muted);
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

renderer.setPalette(DEFAULT_PALETTE);
applyTheme();
setMuted(progress.muted);
renderMenu();
showScreen("menu");

// Exposed so the browser-driven smoke test can drive real games.
Object.assign(window, {
  __game: () => game,
  __startLevel: (mode: Mode, chapter: number, stage: number) =>
    startLevel({ mode, chapter, stage }, 0),
  __showScreen: showScreen,
  __cancelAdvance: cancelAdvance,
  __stage: () => slot.stage,
  __isSwiping: () => transition !== null,
  __themeBackground: () => currentTheme().background,
  __renderer: renderer,
});
