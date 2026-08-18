/**
 * Generates every store and PWA asset from the game itself.
 *
 * Icons are painted by the same routine that draws the menu mark, so the icon
 * and the game can never drift apart. Screenshots are captured from the real
 * running build at Play's phone size, so they can never show a version that no
 * longer exists.
 *
 * Everything lands in public/, which Vite copies verbatim into dist/, and is
 * then mirrored into store-assets/ — the same files, gathered in one folder to
 * upload to the Play Console. Mirroring rather than generating twice is what
 * stops the two from ever disagreeing.
 */
import { type ChildProcess, spawn } from "node:child_process";
import { copyFileSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";

const CHROME = "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const PORT = 5179;
const CDP_PORT = 9223;
const URL_BASE = `http://127.0.0.1:${PORT}/`;
const PUBLIC = new URL("../public/", import.meta.url);
const STORE = new URL("../store-assets/", import.meta.url);

/** Play wants 1080x1920 phone screenshots; 540x960 at 2x gives exactly that. */
const SHOT_WIDTH = 540;
const SHOT_HEIGHT = 960;

const ICONS: { name: string; size: number; maskable: boolean }[] = [
  { name: "icon-192.png", size: 192, maskable: false },
  { name: "icon-512.png", size: 512, maskable: false },
  // Maskable icons may be cropped to a circle, squircle or rounded square by
  // the launcher, so the mark is inset into the safe zone.
  { name: "icon-maskable-512.png", size: 512, maskable: true },
];

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitFor(label: string, probe: () => Promise<boolean>): Promise<void> {
  const deadline = Date.now() + 45_000;
  while (Date.now() < deadline) {
    if (await probe().catch(() => false)) return;
    await delay(200);
  }
  throw new Error(`timed out waiting for ${label}`);
}

class Cdp {
  private socket!: WebSocket;
  private nextId = 1;
  private pending = new Map<number, (value: any) => void>();

  async connect(wsUrl: string): Promise<void> {
    this.socket = new WebSocket(wsUrl);
    this.socket.addEventListener("message", (event) => {
      let message: any;
      try {
        message = JSON.parse(String(event.data));
      } catch {
        return;
      }
      const resolve = this.pending.get(message.id);
      if (!resolve) return;
      this.pending.delete(message.id);
      resolve(message.result);
    });
    await new Promise<void>((resolve, reject) => {
      this.socket.addEventListener("open", () => resolve(), { once: true });
      this.socket.addEventListener("error", () => reject(new Error("cdp")), {
        once: true,
      });
    });
  }

  send(method: string, params: Record<string, unknown> = {}): Promise<any> {
    const id = this.nextId++;
    return new Promise((resolve) => {
      this.pending.set(id, resolve);
      this.socket.send(JSON.stringify({ id, method, params }));
    });
  }

  async evaluate<T>(expression: string): Promise<T> {
    const result = await this.send("Runtime.evaluate", {
      expression,
      returnByValue: true,
      awaitPromise: true,
    });
    return result?.result?.value as T;
  }

  async shot(path: URL): Promise<void> {
    const result = await this.send("Page.captureScreenshot", { format: "png" });
    writeFileSync(path, Buffer.from(result.data, "base64"));
  }
}

/** Copy one generated folder into store-assets/, so nothing is hand-assembled. */
function mirror(folder: string): void {
  const from = new URL(`${folder}/`, PUBLIC);
  const to = new URL(`${folder}/`, STORE);
  mkdirSync(to, { recursive: true });
  for (const name of readdirSync(from).sort()) {
    copyFileSync(new URL(name, from), new URL(name, to));
    console.log(`  store   ${folder}/${name}`);
  }
}

let server: ChildProcess | undefined;
let browser: ChildProcess | undefined;

async function main(): Promise<void> {
  mkdirSync(new URL("icons/", PUBLIC), { recursive: true });
  mkdirSync(new URL("screenshots/", PUBLIC), { recursive: true });

  server = spawn(
    "npx",
    ["vite", "--port", String(PORT), "--host", "127.0.0.1", "--strictPort"],
    { cwd: new URL("..", import.meta.url).pathname, stdio: "ignore" },
  );
  await waitFor("dev server", async () => (await fetch(URL_BASE)).ok);

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
      "about:blank",
    ],
    { stdio: "ignore" },
  );

  let wsUrl = "";
  await waitFor("devtools", async () => {
    const response = await fetch(`http://127.0.0.1:${CDP_PORT}/json/list`);
    const page = ((await response.json()) as any[]).find((t) => t.type === "page");
    if (!page?.webSocketDebuggerUrl) return false;
    wsUrl = page.webSocketDebuggerUrl;
    return true;
  });

  const cdp = new Cdp();
  await cdp.connect(wsUrl);
  await cdp.send("Page.enable");
  await cdp.send("Runtime.enable");

  // --- icons ---------------------------------------------------------------

  for (const icon of ICONS) {
    await cdp.send("Emulation.setDeviceMetricsOverride", {
      width: icon.size,
      height: icon.size,
      deviceScaleFactor: 1,
      mobile: false,
    });
    await cdp.send("Page.navigate", { url: URL_BASE });
    await waitFor("app boot", async () =>
      cdp.evaluate<boolean>("typeof window.__renderIcon === 'function'"),
    );
    await cdp.evaluate(`window.__renderIcon(${icon.size}, ${icon.maskable})`);
    await delay(120);
    await cdp.shot(new URL(`icons/${icon.name}`, PUBLIC));
    console.log(`  icon    ${icon.name}  ${icon.size}x${icon.size}`);
  }

  // --- screenshots ---------------------------------------------------------

  await cdp.send("Emulation.setDeviceMetricsOverride", {
    width: SHOT_WIDTH,
    height: SHOT_HEIGHT,
    deviceScaleFactor: 2,
    mobile: true,
  });
  await cdp.send("Page.navigate", { url: URL_BASE });
  await waitFor("app boot", async () =>
    cdp.evaluate<boolean>("typeof window.__startLevel === 'function'"),
  );

  // A save with some progress: locked rows and an empty menu photograph badly.
  const solved = [
    ...Array.from({ length: 32 }, (_, i) => `c1-s${i + 1}`),
    ...Array.from({ length: 19 }, (_, i) => `c2-s${i + 1}`),
  ];
  await cdp.evaluate(
    `localStorage.setItem('quiet-lines.solved', ${JSON.stringify(JSON.stringify(solved))})`,
  );
  await cdp.send("Page.navigate", { url: URL_BASE });
  await waitFor("app reboot", async () =>
    cdp.evaluate<boolean>("typeof window.__startLevel === 'function'"),
  );
  await cdp.evaluate("window.__setAds(false)");
  await delay(700);

  await cdp.shot(new URL("screenshots/play-1-menu.png", PUBLIC));
  console.log("  shot    play-1-menu.png");

  // A puzzle part-solved, which shows the mechanic better than an empty board.
  await cdp.evaluate("window.__startLevel('classic', 2, 20)");
  await waitFor("level", async () => cdp.evaluate<boolean>("window.__game() !== null"));
  await delay(900);
  await cdp.evaluate(`(() => {
    const game = window.__game();
    const solution = window.__solutionFor(game.level);
    if (!solution) return;
    // Draw the first line and part of the second, so the board reads as
    // mid-thought rather than untouched or finished.
    let index = 0;
    for (const [shape, path] of solution) {
      const take = index === 0 ? path.length : Math.ceil(path.length / 2);
      game.paths.set(shape, path.slice(0, take));
      index++;
    }
  })()`);
  await cdp.evaluate("window.__repaint()");
  await delay(600);
  await cdp.shot(new URL("screenshots/play-2-puzzle.png", PUBLIC));
  console.log("  shot    play-2-puzzle.png");

  // A solved board, glowing.
  await cdp.evaluate("window.__startLevel('classic', 4, 12)");
  await waitFor("level", async () => cdp.evaluate<boolean>("window.__game() !== null"));
  await delay(600);
  await cdp.evaluate(`(() => {
    const game = window.__game();
    const solution = window.__solutionFor(game.level);
    if (solution) for (const [shape, path] of solution) game.paths.set(shape, path);
  })()`);
  await cdp.evaluate("window.__repaint()");
  await delay(1400);
  await cdp.shot(new URL("screenshots/play-3-solved.png", PUBLIC));
  console.log("  shot    play-3-solved.png");

  await cdp.evaluate("document.getElementById('go-classic').click()");
  await delay(500);
  await cdp.shot(new URL("screenshots/play-4-chapters.png", PUBLIC));
  console.log("  shot    play-4-chapters.png");

  await cdp.evaluate("window.__showScreen('menu')");
  await cdp.evaluate("document.getElementById('go-themes').click()");
  await delay(500);
  await cdp.shot(new URL("screenshots/play-5-themes.png", PUBLIC));
  console.log("  shot    play-5-themes.png");

  // --- one folder to upload from --------------------------------------------

  mirror("icons");
  mirror("screenshots");
}

main()
  .catch((error) => {
    console.error(`asset generation failed: ${(error as Error).message}`);
    process.exitCode = 1;
  })
  .finally(async () => {
    browser?.kill("SIGKILL");
    server?.kill("SIGKILL");
    await delay(200);
    process.exit(process.exitCode ?? 0);
  });
