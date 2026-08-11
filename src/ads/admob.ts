import type { AdKind, AdProvider } from "./provider";

/**
 * Google AdMob, via `@capacitor-community/admob`.
 *
 * Inert until the game is running inside the native Capacitor shell, and the
 * plugin is imported dynamically so neither the dependency nor the shell is
 * needed to build or test the web version. Swapping networks later means
 * writing one more file like this — nothing in the game changes.
 *
 * Before this can earn anything:
 *   1. npm install @capacitor/core @capacitor/cli @capacitor-community/admob
 *   2. Create the app in AdMob and paste the real unit ids below.
 *   3. Ship a consent flow. This is not optional — Google's UMP SDK for
 *      GDPR/GPP, and Apple's App Tracking Transparency prompt on iOS. Stores
 *      reject builds that serve personalised ads without them, and a privacy
 *      policy URL is required on both listings.
 *
 * The test ids below are Google's public ones. They always fill and earn
 * nothing, which is exactly what is wanted until release.
 */
const AD_UNITS = {
  interstitial: {
    android: "ca-app-pub-3940256099942544/1033173712",
    ios: "ca-app-pub-3940256099942544/4411468910",
  },
  rewarded: {
    android: "ca-app-pub-3940256099942544/5224354917",
    ios: "ca-app-pub-3940256099942544/1712485313",
  },
};

/** True only inside the native shell; the web build always answers false. */
function isNative(): boolean {
  const capacitor = (window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } })
    .Capacitor;
  return capacitor?.isNativePlatform?.() === true;
}

function platform(): "android" | "ios" {
  const capacitor = (window as unknown as { Capacitor?: { getPlatform?: () => string } })
    .Capacitor;
  return capacitor?.getPlatform?.() === "ios" ? "ios" : "android";
}

export class AdMobAds implements AdProvider {
  readonly name = "admob";
  private admob: any = null;
  private loaded: Record<AdKind, boolean> = {
    interstitial: false,
    rewarded: false,
  };

  async initialise(): Promise<void> {
    if (!isNative()) return;
    // Held in a variable so the specifier is only resolved at runtime: the web
    // build must compile and ship without the plugin installed at all. Failure
    // degrades to "no ads", never to a blank screen.
    const specifier = "@capacitor-community/admob";
    const module = await import(/* @vite-ignore */ specifier).catch(() => null);
    if (!module) return;

    this.admob = (module as any).AdMob;
    await this.admob.initialize({ initializeForTesting: true });
    void this.preload("interstitial");
    void this.preload("rewarded");
  }

  private async preload(kind: AdKind): Promise<void> {
    if (!this.admob) return;
    const adId = AD_UNITS[kind][platform()];
    try {
      if (kind === "interstitial") await this.admob.prepareInterstitial({ adId });
      else await this.admob.prepareRewardVideoAd({ adId });
      this.loaded[kind] = true;
    } catch {
      this.loaded[kind] = false;
    }
  }

  isReady(kind: AdKind): boolean {
    return this.admob !== null && this.loaded[kind];
  }

  async showInterstitial(): Promise<void> {
    if (!this.isReady("interstitial")) return;
    this.loaded.interstitial = false;
    try {
      await this.admob.showInterstitial();
    } finally {
      // Networks require a fresh load per impression.
      void this.preload("interstitial");
    }
  }

  async showRewarded(): Promise<boolean> {
    if (!this.isReady("rewarded")) return false;
    this.loaded.rewarded = false;
    try {
      const result = await this.admob.showRewardVideoAd();
      // Only a completed view carries a reward payload.
      return Boolean(result && (result.amount ?? 0) >= 0 && result.type);
    } catch {
      return false;
    } finally {
      void this.preload("rewarded");
    }
  }
}
