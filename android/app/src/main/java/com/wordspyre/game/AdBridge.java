package com.wordspyre.game;

import android.app.Activity;
import android.os.Handler;
import android.os.Looper;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;

import androidx.annotation.NonNull;

import com.google.android.gms.ads.AdError;
import com.google.android.gms.ads.AdRequest;
import com.google.android.gms.ads.FullScreenContentCallback;
import com.google.android.gms.ads.LoadAdError;
import com.google.android.gms.ads.rewarded.RewardedAd;
import com.google.android.gms.ads.rewarded.RewardedAdLoadCallback;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * The rewarded ads, and the bridge the page talks to them through.
 *
 * The game asks for an ad by placement name and gets told, later, whether the
 * player earned the reward. A JavascriptInterface method cannot take a JS
 * function as an argument - only strings and primitives cross - so the page
 * hands over a token instead and we call back into it with that token.
 *
 * Nothing here grants a reward on its own. Only onUserEarnedReward does, so
 * closing an ad early gives the player nothing, which is the whole contract of
 * a rewarded ad.
 *
 * The first version refused the moment nothing was warm in the cache, and never
 * retried a failed load. On a new app - where fill is thin and the first few
 * loads routinely come back empty - that meant every button said "no ad" for
 * the rest of the session even once inventory appeared. A tap now waits on a
 * load that is already in flight, starts one if there is not, and gives up only
 * after WAIT_MS. Failed preloads back off and try again rather than giving up
 * for good.
 */
public class AdBridge {

    /** The four AdMob rewarded units, one per placement the game offers. */
    private static final Map<String, String> UNITS = new HashMap<>();
    static {
        UNITS.put("run_revive",         "ca-app-pub-7760232793926214/1802350998");
        UNITS.put("shop_reroll_refill", "ca-app-pub-7760232793926214/2678272799");
        UNITS.put("victory_cash_boost", "ca-app-pub-7760232793926214/5736997629");
        UNITS.put("theme_1h_pass",      "ca-app-pub-7760232793926214/8363160967");
    }

    /** How long a player will stare at a button before we admit defeat. */
    private static final long WAIT_MS = 7000;
    /** Backoff for a placement whose load failed, capped so it keeps trying. */
    private static final long RETRY_MIN_MS = 15000, RETRY_MAX_MS = 300000;

    private final Activity activity;
    private final WebView web;
    private final Handler main = new Handler(Looper.getMainLooper());

    private final Map<String, RewardedAd> loaded = new HashMap<>();
    private final Map<String, Boolean> loading = new HashMap<>();
    private final Map<String, Long> backoff = new HashMap<>();
    /** Tokens whose player is waiting on a load that has not landed yet. */
    private final Map<String, List<String>> waiting = new HashMap<>();

    AdBridge(Activity activity, WebView web) {
        this.activity = activity;
        this.web = web;
    }

    private static String unitFor(String placement) {
        String id = UNITS.get(placement);
        return id == null ? UNITS.get("run_revive") : id;
    }

    // ------------------------------------------------------------ loading

    /** Fetch one ad for a placement so it is ready before the player asks. */
    void preload(final String placement) {
        if (loaded.containsKey(placement)) return;
        if (Boolean.TRUE.equals(loading.get(placement))) return;
        loading.put(placement, true);
        main.post(() -> RewardedAd.load(activity, unitFor(placement),
                new AdRequest.Builder().build(),
                new RewardedAdLoadCallback() {
                    @Override public void onAdLoaded(@NonNull RewardedAd ad) {
                        loading.put(placement, false);
                        backoff.remove(placement);
                        loaded.put(placement, ad);
                        serveWaiting(placement);
                    }
                    @Override public void onAdFailedToLoad(@NonNull LoadAdError e) {
                        loading.put(placement, false);
                        loaded.remove(placement);
                        failWaiting(placement, "no_fill");
                        scheduleRetry(placement);
                    }
                }));
    }

    void preloadAll() { for (String p : UNITS.keySet()) preload(p); }

    /**
     * A placement whose load failed tries again later, doubling the wait each
     * time up to five minutes. Without this a run of empty responses on a new
     * app would leave every ad button dead until the app was restarted.
     */
    private void scheduleRetry(final String placement) {
        long wait = backoff.containsKey(placement)
                ? Math.min(RETRY_MAX_MS, backoff.get(placement) * 2) : RETRY_MIN_MS;
        backoff.put(placement, wait);
        main.postDelayed(() -> preload(placement), wait);
    }

    // ------------------------------------------------------------ showing

    /**
     * Called from the page. Shows the ad for this placement, waiting a few
     * seconds for one to arrive if the cache is empty.
     */
    @JavascriptInterface
    public void showRewarded(final String placement, final String token) {
        main.post(() -> {
            RewardedAd ad = loaded.remove(placement);
            if (ad != null) { present(ad, placement, token); return; }

            // Nothing warm. Queue this player against the next load rather than
            // turning them away from an ad that is seconds off.
            List<String> queue = waiting.get(placement);
            if (queue == null) { queue = new ArrayList<>(); waiting.put(placement, queue); }
            queue.add(token);
            backoff.remove(placement);      // a real request; do not sit on a backoff
            preload(placement);
            main.postDelayed(() -> dropIfStillWaiting(placement, token), WAIT_MS);
        });
    }

    /** An ad landed - hand it to whoever has been waiting longest. */
    private void serveWaiting(String placement) {
        List<String> queue = waiting.get(placement);
        if (queue == null || queue.isEmpty()) return;
        String token = queue.remove(0);
        RewardedAd ad = loaded.remove(placement);
        if (ad == null) return;
        present(ad, placement, token);
    }

    private void failWaiting(String placement, String reason) {
        List<String> queue = waiting.remove(placement);
        if (queue == null) return;
        for (String token : queue) finish(token, false, reason);
    }

    private void dropIfStillWaiting(String placement, String token) {
        List<String> queue = waiting.get(placement);
        if (queue != null && queue.remove(token)) finish(token, false, "no_fill");
    }

    private void present(RewardedAd ad, final String placement, final String token) {
        final boolean[] earned = { false };
        ad.setFullScreenContentCallback(new FullScreenContentCallback() {
            @Override public void onAdDismissedFullScreenContent() {
                preload(placement);                       // have the next one ready
                finish(token, earned[0], earned[0] ? "ok" : "closed_early");
            }
            @Override public void onAdFailedToShowFullScreenContent(@NonNull AdError e) {
                preload(placement);
                finish(token, false, "error");
            }
        });
        ad.show(activity, r -> earned[0] = true);
    }

    /** Whether an ad is sitting ready, so the page can soften a button that would wait. */
    @JavascriptInterface
    public boolean isReady(String placement) {
        return loaded.containsKey(placement);
    }

    private void finish(String token, boolean granted, String reason) {
        final String js = "window.__adResult && window.__adResult("
                + jsString(token) + "," + granted + "," + jsString(reason) + ")";
        main.post(() -> web.evaluateJavascript(js, null));
    }

    /** The token is ours, but quoting it properly costs nothing and closes a hole. */
    private static String jsString(String s) {
        if (s == null) return "''";
        return "'" + s.replace("\\", "\\\\").replace("'", "\\'")
                      .replace("\n", "").replace("\r", "") + "'";
    }
}
