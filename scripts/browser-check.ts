/**
 * End-to-end check: launches the real app in Chromium and solves levels with
 * simulated finger drags, then asserts the game reports them solved.
 *
 * This exercises the parts unit tests cannot reach — canvas layout, hit
 * testing, pointer capture and the fast-drag interpolation. It speaks the
 * DevTools protocol directly so it needs no browser-automation dependency.
 */
import { type ChildProcess, spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { ALL_LEVELS } from "../src/levels";
import { solve } from "../src/core/solver";
import { computeLayout } from "../src/render/renderer";
import type { ShapeId } from "../src/core/types";

const CHROME = "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const PORT = 5178;
const CDP_PORT = 9222;
const URL_BASE = `http://127.0.0.1:${PORT}/`;
const OUT_DIR = new URL("../.artifacts/", import.meta.url);
/** Matches Renderer.padding; the test recomputes layout to find cell centres. */
const BOARD_PADDING = 28;

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
    await delay(250);
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
  /** Anything the page threw or logged as an error, collected for the report. */
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

  /** Evaluates an expression in the page and returns its value. */
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
}

let server: ChildProcess | undefined;
let browser: ChildProcess | undefined;
const failures: string[] = [];

async function main(): Promise<void> {
  mkdirSync(OUT_DIR, { recursive: true });

  // TARGET_URL lets this run against a built single-file bundle (file://...)
  // instead of the dev server, which is how the published page is verified.
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
  await waitFor(
    "app boot",
    async () => (await cdp.evaluate<boolean>("typeof window.__game === 'function'")),
  );

  // A spread of levels: both tutorials and generated boards with 1-3 lines.
  const targets = [0, 1, 2, 3, 8, 14, 20, ALL_LEVELS.length - 1];

  for (const levelIndex of targets) {
    const level = ALL_LEVELS[levelIndex];
    await cdp.evaluate(`window.__loadLevel(${levelIndex})`);
    await delay(60);

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
    const screen = (cell: number) => ({
      x: rect.left + layout.ox + ((cell % level.width) + 0.5) * layout.cell,
      y: rect.top + layout.oy + (Math.floor(cell / level.width) + 0.5) * layout.cell,
    });

    const [solution] = solve(level, { limit: 1 }).solutions;
    if (!solution) {
      failures.push(`level ${level.id}: solver found no solution`);
      continue;
    }

    for (const [shape, path] of solution as Map<ShapeId, number[]>) {
      void shape;
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
    const label = `level ${level.id} (index ${levelIndex}, ${level.width}x${level.height})`;
    if (solved) {
      console.log(`  ok   ${label}`);
    } else {
      failures.push(label);
      console.log(`  FAIL ${label}`);
    }

    if ([0, 3, 20].includes(levelIndex)) {
      // Let the win animation reach its settled state before capturing.
      await delay(1400);
      const shot = await cdp.send("Page.captureScreenshot", { format: "png" });
      writeFileSync(
        new URL(`level-${level.id}-solved.png`, OUT_DIR),
        Buffer.from(shot.data, "base64"),
      );
    }
  }

  // Also capture an untouched board so the default look can be reviewed.
  await cdp.evaluate("window.__loadLevel(20)");
  // Long enough for the staggered entrance to finish blooming in.
  await delay(1200);
  const fresh = await cdp.send("Page.captureScreenshot", { format: "png" });
  writeFileSync(new URL("level-fresh.png", OUT_DIR), Buffer.from(fresh.data, "base64"));

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
