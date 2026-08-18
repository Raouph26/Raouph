import { type AdProvider, NoAds } from "./provider";

/**
 * Every dial that decides how often a player sees an ad.
 *
 * These are the numbers to turn for revenue. Worth knowing which way to turn
 * them: interstitial revenue is impressions x eCPM, and impressions are
 * sessions x length. Cutting the grace period or the gap raises impressions per
 * session but shortens sessions, and past a point the second effect wins. The
 * defaults here are a deliberately mild starting point — measure retention
 * before tightening them, rather than guessing in either direction.
 */
export const AD_POLICY = {
  /** Stages a new player finishes before the first interstitial ever shows. */
  gracePeriodStages: 6,
  /** Show an interstitial once every N solved stages. */
  interstitialEveryStages: 4,
  /** Never show two interstitials closer together than this. */
  minimumGapMs: 100_000,
  /** Hints a player is given outright before an ad is required. */
  freeHints: 3,
};

const STORAGE_KEY = "thrum.ads";

interface AdState {
  solvedSinceAd: number;
  totalSolved: number;
  freeHintsLeft: number;
}

function readState(): AdState {
  const fallback: AdState = {
    solvedSinceAd: 0,
    totalSolved: 0,
    freeHintsLeft: AD_POLICY.freeHints,
  };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? { ...fallback, ...(JSON.parse(raw) as Partial<AdState>) } : fallback;
  } catch {
    return fallback;
  }
}

/**
 * Decides when ads appear, independently of which network shows them.
 *
 * Interstitials are only ever offered between stages — never mid-drag. A
 * full-screen takeover during a gesture loses the line the player was drawing,
 * which is the fastest way to end a session for good.
 */
export class AdManager {
  private state = readState();
  private lastInterstitialAt = 0;

  constructor(private provider: AdProvider = new NoAds()) {}

  async initialise(): Promise<void> {
    try {
      await this.provider.initialise();
    } catch {
      // An ad network that fails to start must never stop the game starting.
    }
  }

  setProvider(provider: AdProvider): void {
    this.provider = provider;
  }

  get freeHintsLeft(): number {
    return this.state.freeHintsLeft;
  }

  private save(): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.state));
    } catch {
      // Private-mode storage failures only mean the caps reset; play continues.
    }
  }

  /** Called after each solve. Returns true when an interstitial is due. */
  recordSolve(now: number): boolean {
    this.state.totalSolved += 1;
    this.state.solvedSinceAd += 1;

    const past = this.state.totalSolved > AD_POLICY.gracePeriodStages;
    const counted = this.state.solvedSinceAd >= AD_POLICY.interstitialEveryStages;
    const rested = now - this.lastInterstitialAt >= AD_POLICY.minimumGapMs;
    const due = past && counted && rested && this.provider.isReady("interstitial");

    if (!due) {
      this.save();
      return false;
    }
    this.state.solvedSinceAd = 0;
    this.lastInterstitialAt = now;
    this.save();
    return true;
  }

  async showInterstitial(): Promise<void> {
    try {
      await this.provider.showInterstitial();
    } catch {
      // Nothing to recover: the player simply carries on without the ad.
    }
  }

  /**
   * Spends a free hint if one remains, otherwise offers a rewarded ad.
   * Resolves true when the hint should actually be given.
   */
  async requestHint(): Promise<boolean> {
    if (this.state.freeHintsLeft > 0) {
      this.state.freeHintsLeft -= 1;
      this.save();
      return true;
    }
    if (!this.provider.isReady("rewarded")) return false;
    try {
      return await this.provider.showRewarded();
    } catch {
      return false;
    }
  }
}
