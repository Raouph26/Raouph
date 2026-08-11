/**
 * The seam between the game and whichever ad network is plugged in.
 *
 * Nothing in the game talks to an SDK directly. On the web — and in every test
 * and in the browser preview — the stub provider runs, so the placement logic,
 * the frequency caps and the reward flow are all exercisable without a native
 * build or a live ad account.
 */
export type AdKind = "interstitial" | "rewarded";

export interface AdProvider {
  readonly name: string;
  /** Called once at startup. Never throws; failures leave ads simply absent. */
  initialise(): Promise<void>;
  /** Whether an ad of this kind can be shown right now. */
  isReady(kind: AdKind): boolean;
  /** Shows a full-screen ad. Resolves when it is dismissed. */
  showInterstitial(): Promise<void>;
  /**
   * Shows a rewarded ad. Resolves true only if the reward was actually earned —
   * a player who closes it early gets nothing, which is what the networks
   * require and what keeps the reward honest.
   */
  showRewarded(): Promise<boolean>;
}

/** Used when ads are disabled or unavailable, so callers need no special case. */
export class NoAds implements AdProvider {
  readonly name = "none";
  async initialise(): Promise<void> {}
  isReady(): boolean {
    return false;
  }
  async showInterstitial(): Promise<void> {}
  async showRewarded(): Promise<boolean> {
    return false;
  }
}
