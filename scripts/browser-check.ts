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
      const message = JSON.parse(String(event.data));

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
  // Picking a theme must actually repaint. This is exactly the bug that shipped
  // once: every option a new save could tap resolved to the same palette, so
  // the feature looked broken while behaving exactly as written.
  const themeRows = await cdp.evaluate<number>(
    "document.querySelectorAll('#theme-list .theme').length",
  );
  if (themeRows !== THEMES.length + 1) {
    failures.push(
      `expected ${THEMES.length + 1} theme rows (auto plus each), saw ${themeRows}`,
    );
  }

  const beforeTheme = await cdp.evaluate<string>("window.__themeBackground()");
  const beforeCss = await cdp.evaluate<string>(
    "getComputedStyle(document.documentElement).getPropertyValue('--bg').trim()",
  );
  // Row 0 is "By chapter"; row 3 is a distinctly different palette.
  await cdp.evaluate("document.querySelectorAll('#theme-list .theme')[3].click()");
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
    console.log(`  ok   theme switch repaints board and interface`);
  }
  await cdp.screenshot("screen-themes.png");

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
