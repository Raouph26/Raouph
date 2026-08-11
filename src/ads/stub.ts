import type { AdKind, AdProvider } from "./provider";

/**
 * A visible fake ad, used on the web build and in tests.
 *
 * It deliberately behaves like a real one — takes over the screen, cannot be
 * dismissed instantly, and only grants a reward if watched to the end — so the
 * pacing and the interruption can be judged before any SDK is wired in. If a
 * placement feels bad here it will feel worse with a real thirty-second video.
 */
const INTERSTITIAL_SECONDS = 3;
const REWARDED_SECONDS = 5;

export class StubAds implements AdProvider {
  readonly name = "stub";

  async initialise(): Promise<void> {}

  isReady(_kind: AdKind): boolean {
    return true;
  }

  showInterstitial(): Promise<void> {
    return this.present({
      title: "Advertisement",
      seconds: INTERSTITIAL_SECONDS,
      rewarded: false,
    }).then(() => undefined);
  }

  showRewarded(): Promise<boolean> {
    return this.present({
      title: "Rewarded advertisement",
      seconds: REWARDED_SECONDS,
      rewarded: true,
    });
  }

  /** Resolves true when watched to the end, false when skipped early. */
  private present(options: {
    title: string;
    seconds: number;
    rewarded: boolean;
  }): Promise<boolean> {
    return new Promise((resolve) => {
      const overlay = document.createElement("div");
      overlay.className = "ad-overlay";

      const panel = document.createElement("div");
      panel.className = "ad-panel";

      const label = document.createElement("span");
      label.className = "ad-label";
      label.textContent = options.title;

      const body = document.createElement("span");
      body.className = "ad-body";
      body.textContent = options.rewarded
        ? "Watch to the end to earn your hint."
        : "Your game continues shortly.";

      const action = document.createElement("button");
      action.type = "button";
      action.className = "ad-action";
      action.disabled = true;

      panel.append(label, body, action);
      overlay.append(panel);
      document.body.append(overlay);

      let remaining = options.seconds;
      const tick = (): void => {
        action.textContent =
          remaining > 0
            ? `${options.rewarded ? "Reward in" : "Skip in"} ${remaining}s`
            : options.rewarded
              ? "Claim reward"
              : "Continue";
        action.disabled = remaining > 0;
      };
      tick();

      const timer = window.setInterval(() => {
        remaining -= 1;
        tick();
        if (remaining <= 0) window.clearInterval(timer);
      }, 1000);

      const finish = (earned: boolean): void => {
        window.clearInterval(timer);
        overlay.remove();
        resolve(earned);
      };

      action.addEventListener("click", () => finish(options.rewarded));
      // Exposed so the browser check can drive the flow without waiting it out.
      overlay.dataset.adOverlay = options.rewarded ? "rewarded" : "interstitial";
      Object.assign(overlay, { __finish: finish });
    });
  }
}
