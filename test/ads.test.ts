import { describe, expect, it } from "vitest";
import { AD_POLICY, AdManager } from "../src/ads/manager";
import type { AdKind, AdProvider } from "../src/ads/provider";
import { nextHint } from "../src/core/hint";
import { parseLevel } from "../src/core/level";
import { Game } from "../src/core/game";
import { indexOf } from "../src/core/types";

class FakeAds implements AdProvider {
  readonly name = "fake";
  interstitials = 0;
  rewarded = 0;
  constructor(
    private ready = true,
    private rewardEarned = true,
  ) {}
  async initialise(): Promise<void> {}
  isReady(_kind: AdKind): boolean {
    return this.ready;
  }
  async showInterstitial(): Promise<void> {
    this.interstitials++;
  }
  async showRewarded(): Promise<boolean> {
    this.rewarded++;
    return this.rewardEarned;
  }
}

/** Solves count from a clean slate; localStorage is absent under vitest. */
function solveTimes(manager: AdManager, count: number, startAt = 0): number[] {
  const shown: number[] = [];
  for (let i = 0; i < count; i++) {
    // Far apart in time, so only the stage cadence can gate anything.
    const now = startAt + i * AD_POLICY.minimumGapMs * 2;
    if (manager.recordSolve(now)) shown.push(i + 1);
  }
  return shown;
}

describe("ad pacing", () => {
  it("shows nothing during the grace period", () => {
    const manager = new AdManager(new FakeAds());
    const shown = solveTimes(manager, AD_POLICY.gracePeriodStages);
    expect(shown).toEqual([]);
  });

  it("shows on the cadence once the grace period is over", () => {
    const manager = new AdManager(new FakeAds());
    const shown = solveTimes(manager, 24);
    expect(shown.length).toBeGreaterThan(0);
    expect(shown[0]).toBeGreaterThan(AD_POLICY.gracePeriodStages);

    for (let i = 1; i < shown.length; i++) {
      expect(shown[i] - shown[i - 1]).toBe(AD_POLICY.interstitialEveryStages);
    }
  });

  it("never shows two closer together than the minimum gap", () => {
    const manager = new AdManager(new FakeAds());
    // Every solve at the same instant: the gap alone must hold the line.
    let shown = 0;
    for (let i = 0; i < 40; i++) if (manager.recordSolve(1000)) shown++;
    expect(shown).toBeLessThanOrEqual(1);
  });

  it("shows nothing when the network has no ad ready", () => {
    const manager = new AdManager(new FakeAds(false));
    expect(solveTimes(manager, 40)).toEqual([]);
  });

  it("spends free hints before ever asking for an ad", async () => {
    const provider = new FakeAds();
    const manager = new AdManager(provider);

    for (let i = 0; i < AD_POLICY.freeHints; i++) {
      expect(await manager.requestHint()).toBe(true);
    }
    expect(provider.rewarded).toBe(0);

    expect(await manager.requestHint()).toBe(true);
    expect(provider.rewarded).toBe(1);
  });

  it("withholds the hint when a rewarded ad is abandoned", async () => {
    const manager = new AdManager(new FakeAds(true, false));
    for (let i = 0; i < AD_POLICY.freeHints; i++) await manager.requestHint();
    expect(await manager.requestHint()).toBe(false);
  });
});

describe("hints", () => {
  const board = ["Aaa", "..A"];

  it("points at the first move from an untouched board", () => {
    const game = new Game(parseLevel("h", board));
    const hint = nextHint(game.level, game.paths);
    expect(hint).not.toBeNull();
    expect(hint!.from).toBe(indexOf(game.level, 0, 0));
  });

  it("points at the next move once a line is under way", () => {
    const game = new Game(parseLevel("h", board));
    game.beginAt(indexOf(game.level, 0, 0));
    game.dragTo(indexOf(game.level, 1, 0));

    const hint = nextHint(game.level, game.paths);
    expect(hint).not.toBeNull();
    expect(hint!.from).toBe(indexOf(game.level, 1, 0));
    expect(hint!.to).toBe(indexOf(game.level, 2, 0));
  });

  it("gives one segment, never the whole answer", () => {
    const game = new Game(parseLevel("h", board));
    const hint = nextHint(game.level, game.paths)!;
    // A hint is a single step: the two cells must be neighbours.
    const dx = Math.abs((hint.to % 3) - (hint.from % 3));
    const dy = Math.abs(Math.floor(hint.to / 3) - Math.floor(hint.from / 3));
    expect(Math.max(dx, dy)).toBe(1);
  });

  it("has nothing to offer on a solved board", () => {
    const game = new Game(parseLevel("h", board));
    game.beginAt(indexOf(game.level, 0, 0));
    game.dragTo(indexOf(game.level, 1, 0));
    game.dragTo(indexOf(game.level, 2, 0));
    game.dragTo(indexOf(game.level, 2, 1));
    expect(game.solved).toBe(true);
    expect(nextHint(game.level, game.paths)).toBeNull();
  });
});
