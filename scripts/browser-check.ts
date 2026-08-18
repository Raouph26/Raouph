/**
 * End-to-end check: launches the real app in Chromium and solves levels with
 * simulated finger drags, then asserts the game reports them solved.
 *
 * This exercises what unit tests cannot reach — canvas layout, hit testing,
 * pointer capture, fast-drag interpolation and screen navigation. It speaks the
 * DevTools protocol directly so it needs no browser-automation dependency.
 */
import { type ChildProcess, spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { classicLevel, dailyLevel, todayKey } from "../src/core/chapters";
import { solve } from "../src/core/solver";
import { THEMES } from "../src/render/palette";
import { computeLayout } from "../src/render/renderer";
import type { Level, ShapeId } from "../src/core/types";

const CHROME = "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const PORT = 5178;
const CDP_PORT = 9222;
const URL_BASE = `http://127.0.0.1:${PORT}/`;
const OUT_DIR = new URL("../.artifacts/", import.meta.url);
/** Matches Renderer.padding; the test recomputes layout to find cell centres. */
const BOARD_PADDING = 30;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitFor(
  label: string,
  probe: () => Promise<boolean>,
  timeoutMs = 45_000,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await probe().catch(() => false)) return;
    await delay(200);
  }
  throw new Error(`timed out waiting for ${label}`);
}

class Cdp {
  private socket!: WebSocket;
  private nextId = 1;
  private pending = new Map<
    number,
    { resolve: (value: any) => void; reject: (err: Error) => void }
  >();
  readonly pageErrors: string[] = [];

  async connect(wsUrl: string): Promise<void> {
    this.socket = new WebSocket(wsUrl);
    this.socket.addEventListener("message", (event) => {
      // A throw in this listener escapes to the socket internals and takes the
      // whole process down, so nothing in here may be allowed to fail.
      let message: any;
      try {
        message = JSON.parse(String(event.data));
      } catch {
        return;
      }

      if (message.method === "Runtime.exceptionThrown") {
        const details = message.params?.exceptionDetails;
        this.pageErrors.push(
          details?.exception?.description ?? details?.text ?? "unknown exception",
        );
        return;
      }
      if (
        message.method === "Runtime.consoleAPICalled" &&
        message.params?.type === "error"
      ) {
        const text = (message.params.args ?? [])
          .map((a: any) => a.value ?? a.description ?? "")
          .join(" ");
        this.pageErrors.push(`console.error: ${text}`);
        return;
      }

      const entry = this.pending.get(message.id);
      if (!entry) return;
      this.pending.delete(message.id);
      if (message.error) entry.reject(new Error(JSON.stringify(message.error)));
      else entry.resolve(message.result);
    });
    await new Promise<void>((resolve, reject) => {
      this.socket.addEventListener("open", () => resolve(), { once: true });
      this.socket.addEventListener("error", () => reject(new Error("cdp socket")), {
        once: true,
      });
    });
  }

  send(method: string, params: Record<string, unknown> = {}): Promise<any> {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.socket.send(JSON.stringify({ id, method, params }));
    });
  }

  async evaluate<T>(expression: string): Promise<T> {
    const result = await this.send("Runtime.evaluate", {
      expression,
      returnByValue: true,
      awaitPromise: true,
    });
    if (result.exceptionDetails) {
      throw new Error(
        `page error: ${result.exceptionDetails.exception?.description ?? "unknown"}`,
      );
    }
    return result.result.value as T;
  }

  async mouse(type: string, x: number, y: number): Promise<void> {
    await this.send("Input.dispatchMouseEvent", {
      type,
      x,
      y,
      button: "left",
      buttons: type === "mouseReleased" ? 0 : 1,
      clickCount: 1,
      pointerType: "mouse",
    });
  }

  async screenshot(name: string): Promise<void> {
    const shot = await this.send("Page.captureScreenshot", { format: "png" });
    writeFileSync(new URL(name, OUT_DIR), Buffer.from(shot.data, "base64"));
  }
}

let server: ChildProcess | undefined;
let browser: ChildProcess | undefined;
const failures: string[] = [];

interface Target {
  label: string;
  mode: "classic" | "daily";
  chapter: number;
  stage: number;
  level: Level;
  shot?: string;
}

async function main(): Promise<void> {
  mkdirSync(OUT_DIR, { recursive: true });

  const target = process.env.TARGET_URL;
  if (target) {
    console.log(`checking ${target}`);
  } else {
    server = spawn(
      "npx",
      ["vite", "--port", String(PORT), "--host", "127.0.0.1", "--strictPort"],
      { cwd: new URL("..", import.meta.url).pathname, stdio: "ignore" },
    );
    await waitFor("vite dev server", async () => (await fetch(URL_BASE)).ok);
  }

  browser = spawn(
    CHROME,
    [
      "--headless=new",
      `--remote-debugging-port=${CDP_PORT}`,
      "--remote-debugging-address=127.0.0.1",
      "--no-sandbox",
      "--disable-gpu",
      "--disable-dev-shm-usage",
      "--hide-scrollbars",
      "--window-size=420,860",
      "about:blank",
    ],
    { stdio: "ignore" },
  );

  let wsUrl = "";
  await waitFor("chromium devtools", async () => {
    const response = await fetch(`http://127.0.0.1:${CDP_PORT}/json/list`);
    const targets = (await response.json()) as any[];
    const page = targets.find((t) => t.type === "page");
    if (!page?.webSocketDebuggerUrl) return false;
    wsUrl = page.webSocketDebuggerUrl;
    return true;
  });

  const cdp = new Cdp();
  await cdp.connect(wsUrl);
  await cdp.send("Page.enable");
  await cdp.send("Runtime.enable");
  await cdp.send("Emulation.setDeviceMetricsOverride", {
    width: 420,
    height: 860,
    deviceScaleFactor: 2,
    mobile: true,
  });

  await cdp.send("Page.navigate", { url: target ?? URL_BASE });
  await waitFor("app boot", async () =>
    cdp.evaluate<boolean>("typeof window.__startLevel === 'function'"),
  );

  // Start from a clean save. The browser profile persists between runs, so a
  // previous run's progress would otherwise decide what is unlocked here.
  await cdp.evaluate("localStorage.clear()");
  await cdp.send("Page.navigate", { url: target ?? URL_BASE });
  await waitFor("reload with a clean save", async () =>
    cdp.evaluate<boolean>("typeof window.__startLevel === 'function'"),
  );

  // Solving dozens of stages in a row would trip the interstitial cadence and
  // cover the board. Ads are exercised deliberately below and unit-tested for
  // pacing; here they only get in the way.
  await cdp.evaluate("window.__setAds(false)");

  // The menu screens are chrome, not canvas, so capture them for review.
  await delay(400);
  await cdp.screenshot("screen-menu.png");
  await cdp.evaluate("document.getElementById('go-classic').click()");
  await delay(300);
  await cdp.screenshot("screen-chapters.png");
  await cdp.evaluate("document.querySelector('.chapter').click()");
  await delay(300);
  await cdp.screenshot("screen-stages.png");

  const day = todayKey();
  const targets: Target[] = [
    { label: "c1-s1", mode: "classic", chapter: 1, stage: 1, level: classicLevel(1, 1), shot: "level-tutorial-1.png" },
    { label: "c1-s9", mode: "classic", chapter: 1, stage: 9, level: classicLevel(1, 9), shot: "level-tutorial-hub.png" },
    { label: "c1-s12", mode: "classic", chapter: 1, stage: 12, level: classicLevel(1, 12), shot: "level-3x5.png" },
    { label: "c6-s8", mode: "classic", chapter: 6, stage: 8, level: classicLevel(6, 8), shot: "level-three-colours.png" },
    { label: "c11-s4", mode: "classic", chapter: 11, stage: 4, level: classicLevel(11, 4) },
    { label: "c17-s9", mode: "classic", chapter: 17, stage: 9, level: classicLevel(17, 9) },
    { label: "c20-s1", mode: "classic", chapter: 20, stage: 1, level: classicLevel(20, 1), shot: "level-late.png" },
    { label: "daily-s28", mode: "daily", chapter: 1, stage: 28, level: dailyLevel(day, 28), shot: "level-daily.png" },
  ];

  for (const item of targets) {
    await cdp.evaluate(
      `window.__startLevel(${JSON.stringify(item.mode)}, ${item.chapter}, ${item.stage})`,
    );
    // startLevel yields a frame before generating so the screen can paint.
    await waitFor(`${item.label} to load`, async () =>
      cdp.evaluate<boolean>("window.__game() !== null"),
    );

    const rect = await cdp.evaluate<{
      left: number;
      top: number;
      width: number;
      height: number;
    }>(
      `(() => { const r = document.querySelector('#board').getBoundingClientRect();
        return { left: r.left, top: r.top, width: r.width, height: r.height }; })()`,
    );

    const level = item.level;
    const layout = computeLayout(level, rect.width, rect.height, BOARD_PADDING);
    const screen = (cell: number) => ({
      x: rect.left + layout.ox + ((cell % level.width) + 0.5) * layout.cell,
      y: rect.top + layout.oy + (Math.floor(cell / level.width) + 0.5) * layout.cell,
    });

    const [solution] = solve(level, { limit: 1 }).solutions;
    if (!solution) {
      failures.push(`${item.label}: solver found no solution`);
      continue;
    }

    for (const [, path] of solution as Map<ShapeId, number[]>) {
      const start = screen(path[0]);
      await cdp.mouse("mousePressed", start.x, start.y);
      for (const cell of path.slice(1)) {
        const point = screen(cell);
        await cdp.mouse("mouseMoved", point.x, point.y);
      }
      const last = screen(path[path.length - 1]);
      await cdp.mouse("mouseReleased", last.x, last.y);
    }

    await delay(60);
    const solved = await cdp.evaluate<boolean>("window.__game().solved");
    // Solving now auto-advances; stop it so the next assertion and any
    // screenshot still refer to the level under test.
    await cdp.evaluate("window.__cancelAdvance()");
    const label = `${item.label} (${level.width}x${level.height})`;
    if (solved) console.log(`  ok   ${label}`);
    else {
      failures.push(label);
      console.log(`  FAIL ${label}`);
    }

    if (item.shot) {
      // Let the completion spin and win swell settle before capturing.
      await delay(1500);
      await cdp.screenshot(item.shot);
    }
  }

  // A fresh board, for reviewing the resting state.
  await cdp.evaluate("window.__startLevel('classic', 12, 5)");
  await delay(1400);
  await cdp.screenshot("level-fresh.png");

  // The themes screen, and that a locked theme cannot be chosen.
  await cdp.evaluate("window.__showScreen('themes')");
  await cdp.evaluate("document.getElementById('go-themes').click()");
  await delay(350);
  await cdp.screenshot("screen-themes.png");
  // Themes unlock one per cleared chapter, so a fresh save has exactly one and
  // nothing to switch to. Grant chapter 1 and reload: this exercises the unlock
  // rule and the repaint together.
  const themeRows = await cdp.evaluate<number>(
    "document.querySelectorAll('#theme-list .theme').length",
  );
  if (themeRows !== THEMES.length + 1) {
    failures.push(
      `expected ${THEMES.length + 1} theme rows (auto plus each), saw ${themeRows}`,
    );
  }
  const lockedAtStart = await cdp.evaluate<number>(
    "document.querySelectorAll('#theme-list .theme.is-locked').length",
  );
  if (lockedAtStart !== THEMES.length - 1) {
    failures.push(
      `expected ${THEMES.length - 1} themes locked on a fresh save, saw ${lockedAtStart}`,
    );
  }

  const clearedChapterOne = JSON.stringify(
    Array.from({ length: 32 }, (_, i) => `c1-s${i + 1}`),
  );
  await cdp.evaluate(
    `localStorage.setItem('thrum.solved', ${JSON.stringify(clearedChapterOne)})`,
  );
  await cdp.send("Page.navigate", { url: target ?? URL_BASE });
  await waitFor("reload after granting chapter 1", async () =>
    cdp.evaluate<boolean>("typeof window.__startLevel === 'function'"),
  );
  await delay(300);
  await cdp.evaluate("document.getElementById('go-themes').click()");
  await delay(300);

  const lockedAfter = await cdp.evaluate<number>(
    "document.querySelectorAll('#theme-list .theme.is-locked').length",
  );
  if (lockedAfter !== THEMES.length - 2) {
    failures.push(
      `clearing a chapter should unlock one theme; ${lockedAfter} still locked`,
    );
  }

  const beforeTheme = await cdp.evaluate<string>("window.__themeBackground()");
  const beforeCss = await cdp.evaluate<string>(
    "getComputedStyle(document.documentElement).getPropertyValue('--bg').trim()",
  );
  // Row 0 is "By chapter", row 1 the starter theme, row 2 the one just earned.
  await cdp.evaluate("document.querySelectorAll('#theme-list .theme')[2].click()");
  await delay(250);
  const afterTheme = await cdp.evaluate<string>("window.__themeBackground()");
  const afterCss = await cdp.evaluate<string>(
    "getComputedStyle(document.documentElement).getPropertyValue('--bg').trim()",
  );

  if (afterTheme === beforeTheme) {
    failures.push(`picking a theme did not change the board palette (${afterTheme})`);
  } else if (afterCss === beforeCss) {
    failures.push(`picking a theme did not change the interface (${afterCss})`);
  } else {
    console.log("  ok   a cleared chapter unlocks a theme, and it repaints");
  }
  await cdp.screenshot("screen-themes.png");

  // The hint button spends a free hint and marks a real next move on the board.
  await cdp.evaluate("window.__startLevel('classic', 1, 12)");
  await waitFor("hint level to load", async () =>
    cdp.evaluate<boolean>("window.__game() !== null"),
  );
  const hintsBefore = await cdp.evaluate<number>("window.__freeHints()");
  await cdp.evaluate("document.getElementById('hint').click()");
  await delay(300);
  const hintShown = await cdp.evaluate<boolean>("window.__hint() !== null");
  const hintsAfter = await cdp.evaluate<number>("window.__freeHints()");

  if (!hintShown) failures.push("pressing hint produced no hint");
  else if (hintsAfter !== hintsBefore - 1) {
    failures.push(`hint did not spend a free hint (${hintsBefore} -> ${hintsAfter})`);
  } else {
    console.log("  ok   hint spends a free hint and marks a move");
  }
  await cdp.screenshot("level-hint.png");

  // The stand-in ad itself: it must take the screen and refuse to be dismissed
  // before its timer runs out, exactly as a real one would.
  void cdp.evaluate("window.__previewAd()");
  await delay(400);
  const adVisible = await cdp.evaluate<boolean>(
    "document.querySelector('.ad-overlay') !== null",
  );
  const adLocked = await cdp.evaluate<boolean>(
    "document.querySelector('.ad-action')?.disabled === true",
  );
  if (adVisible && adLocked) {
    console.log("  ok   ad overlay takes the screen and holds it");
  } else {
    failures.push(
      `ad overlay did not behave (visible=${adVisible}, locked=${adLocked})`,
    );
  }
  await cdp.screenshot("screen-ad.png");
  await cdp.evaluate("document.querySelector('.ad-overlay')?.remove()");

  // A real finger sweeps continuously and wobbles; it does not teleport between
  // cell centres the way the checks above do. That difference hid a bug where
  // diagonal moves were near-impossible, because clipping the corner of an
  // orthogonal neighbour committed the line sideways first.
  //
  // The boards here are deliberately dense: on a sparse one the mis-commit
  // lands on an empty cell and is rejected anyway, so the bug stays hidden.
  const wobbleTargets: [number, number][] = [
    [1, 12],
    [11, 4],
    [17, 9],
    [20, 1],
  ];

  for (const [chapter, stage] of wobbleTargets) {
    // Any lingering overlay would swallow every pointer event below.
    await cdp.evaluate(
      "window.__cancelAdvance(); document.querySelector('.ad-overlay')?.remove()",
    );
    await cdp.evaluate(`window.__startLevel('classic', ${chapter}, ${stage})`);
    await waitFor(`c${chapter}-s${stage} to load`, async () =>
      cdp.evaluate<boolean>("window.__game() !== null"),
    );
    const level = classicLevel(chapter, stage);
    const rect = await cdp.evaluate<{
      left: number;
      top: number;
      width: number;
      height: number;
    }>(
      `(() => { const r = document.querySelector('#board').getBoundingClientRect();
        return { left: r.left, top: r.top, width: r.width, height: r.height }; })()`,
    );
    const layout = computeLayout(level, rect.width, rect.height, BOARD_PADDING);
    const at = (cell: number) => ({
      x: rect.left + layout.ox + ((cell % level.width) + 0.5) * layout.cell,
      y: rect.top + layout.oy + (Math.floor(cell / level.width) + 0.5) * layout.cell,
    });

    for (const [, path] of solve(level, { limit: 1 })
      .solutions[0] as Map<ShapeId, number[]>) {
      const first = at(path[0]);
      await cdp.mouse("mousePressed", first.x, first.y);
      let previous = first;
      for (const cell of path.slice(1)) {
        const next = at(cell);
        const steps = 8;
        for (let i = 1; i <= steps; i++) {
          const t = i / steps;
          // Perpendicular wobble of about a tenth of a cell, as a thumb does.
          const wobble = Math.sin(t * Math.PI) * layout.cell * 0.13;
          await cdp.mouse(
            "mouseMoved",
            previous.x + (next.x - previous.x) * t + wobble,
            previous.y + (next.y - previous.y) * t - wobble,
          );
        }
        previous = next;
      }
      await cdp.mouse("mouseReleased", previous.x, previous.y);
    }

    await delay(60);
    const solved = await cdp.evaluate<boolean>("window.__game().solved");
    await cdp.evaluate("window.__cancelAdvance()");
    if (!solved) {
      failures.push(`wobbling drag failed to solve c${chapter}-s${stage}`);
    }
  }
  if (!failures.some((f) => f.startsWith("wobbling drag"))) {
    console.log("  ok   diagonals survive continuous, wobbling drags");
  }

  // Lifting a finger mid-line and putting it back down must carry on from where
  // it stopped. This broke because a hub could never be grabbed, so any line
  // resting on one was stranded — and lines rest on hubs constantly.
  let resumedOnHub = false;
  for (const [chapter, stage] of [
    [6, 8],
    [11, 4],
    [17, 9],
  ] as [number, number][]) {
    await cdp.evaluate(
      "window.__cancelAdvance(); document.querySelector('.ad-overlay')?.remove()",
    );
    await cdp.evaluate(`window.__startLevel('classic', ${chapter}, ${stage})`);
    await waitFor(`c${chapter}-s${stage} to load`, async () =>
      cdp.evaluate<boolean>("window.__game() !== null"),
    );
    const level = classicLevel(chapter, stage);
    const rect = await cdp.evaluate<{
      left: number;
      top: number;
      width: number;
      height: number;
    }>(
      `(() => { const r = document.querySelector('#board').getBoundingClientRect();
        return { left: r.left, top: r.top, width: r.width, height: r.height }; })()`,
    );
    const layout = computeLayout(level, rect.width, rect.height, BOARD_PADDING);
    const at = (cell: number) => ({
      x: rect.left + layout.ox + ((cell % level.width) + 0.5) * layout.cell,
      y: rect.top + layout.oy + (Math.floor(cell / level.width) + 0.5) * layout.cell,
    });
    const draw = async (path: number[]) => {
      const start = at(path[0]);
      await cdp.mouse("mousePressed", start.x, start.y);
      let last = start;
      for (const cell of path.slice(1)) {
        last = at(cell);
        await cdp.mouse("mouseMoved", last.x, last.y);
      }
      await cdp.mouse("mouseReleased", last.x, last.y);
    };

    for (const [, path] of solve(level, { limit: 1 })
      .solutions[0] as Map<ShapeId, number[]>) {
      // Stop on a hub where the line offers one, since that was the broken
      // case; otherwise stop halfway.
      let stop = path.findIndex(
        (cell, i) => i > 0 && i < path.length - 1 && level.cells[cell].kind === "hub",
      );
      if (stop < 0) stop = Math.max(1, Math.floor(path.length / 2));
      else resumedOnHub = true;

      await draw(path.slice(0, stop + 1));
      // Finger up. Now press the head again and finish the line.
      await draw(path.slice(stop));
    }

    await delay(60);
    const solved = await cdp.evaluate<boolean>("window.__game().solved");
    await cdp.evaluate("window.__cancelAdvance()");
    if (!solved) {
      failures.push(`a line could not be resumed on c${chapter}-s${stage}`);
    }
  }
  if (!resumedOnHub) failures.push("no resume test actually stopped on a hub");
  if (!failures.some((f) => f.startsWith("a line could not") || f.startsWith("no resume"))) {
    console.log("  ok   a line put down mid-draw can be picked up and finished");
  }

  // Solving should carry the player onward by itself, with a slide between.
  await cdp.evaluate("window.__startLevel('classic', 1, 2)");
  await waitFor("advance level to load", async () =>
    cdp.evaluate<boolean>("window.__game() !== null"),
  );
  const advanceLevel = classicLevel(1, 2);
  const advanceRect = await cdp.evaluate<{
    left: number;
    top: number;
    width: number;
    height: number;
  }>(
    `(() => { const r = document.querySelector('#board').getBoundingClientRect();
      return { left: r.left, top: r.top, width: r.width, height: r.height }; })()`,
  );
  const advanceLayout = computeLayout(
    advanceLevel,
    advanceRect.width,
    advanceRect.height,
    BOARD_PADDING,
  );
  const advanceScreen = (cell: number) => ({
    x:
      advanceRect.left +
      advanceLayout.ox +
      ((cell % advanceLevel.width) + 0.5) * advanceLayout.cell,
    y:
      advanceRect.top +
      advanceLayout.oy +
      (Math.floor(cell / advanceLevel.width) + 0.5) * advanceLayout.cell,
  });
  for (const [, path] of solve(advanceLevel, { limit: 1 })
    .solutions[0] as Map<ShapeId, number[]>) {
    const start = advanceScreen(path[0]);
    await cdp.mouse("mousePressed", start.x, start.y);
    for (const cell of path.slice(1)) {
      const point = advanceScreen(cell);
      await cdp.mouse("mouseMoved", point.x, point.y);
    }
    const last = advanceScreen(path[path.length - 1]);
    await cdp.mouse("mouseReleased", last.x, last.y);
  }

  // Catch the slide in flight, then confirm where it landed.
  await delay(1650);
  if (await cdp.evaluate<boolean>("window.__isSwiping()")) {
    await cdp.screenshot("swipe-mid.png");
  } else {
    failures.push("no swipe was in flight shortly after the advance fired");
  }
  await delay(900);
  const landedOn = await cdp.evaluate<number>("window.__stage()");
  if (landedOn === 3) console.log("  ok   auto-advance moved to the next stage");
  else failures.push(`auto-advance landed on stage ${landedOn}, expected 3`);

  // Audio starts inside the simulated press, so a synthesis error surfaces here.
  for (const error of cdp.pageErrors) failures.push(`page error: ${error}`);
}

main()
  .catch((err) => {
    failures.push(`harness error: ${(err as Error).message}`);
  })
  .finally(async () => {
    browser?.kill("SIGKILL");
    server?.kill("SIGKILL");
    await delay(200);
    if (failures.length > 0) {
      console.error(`\n${failures.length} failure(s):`);
      for (const f of failures) console.error(`  - ${f}`);
      process.exit(1);
    }
    console.log("\nAll browser checks passed.");
    process.exit(0);
  });
