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

import java.util.HashMap;
import java.util.Map;

/**
 * The rewarded ads, and the bridge the page talks to them through.
 *
 * The game asks for an ad by placement name and gets told, later, whether the
 * player earned the reward. A JavascriptInterface method cannot take a JS
 * function as an argument - only strings and primitives cross - so the page
 * hands over a token instead and we call back into it with that token when the
 * ad is finished.
 *
 * Nothing here grants a reward on its own. Only onUserEarnedReward does, so
 * closing an ad early gives the player nothing, which is the whole contract of
 * a rewarded ad.
 */
public class AdBridge {

    /**
     * Your four AdMob rewarded unit ids go here.
     *
     * While an entry still reads REPLACE_ME the app serves Google's official
     * test ad instead. Test ads are safe - they are the supported way to build
     * against AdMob - but they earn nothing, and Google's policy forbids
     * shipping them to production. So: paste the real ids in before the build
     * that turns ads on for players.
     */
    private static final Map<String, String> UNITS = new HashMap<>();
    static {
        UNITS.put("run_revive",         "REPLACE_ME");
        UNITS.put("shop_reroll_refill", "REPLACE_ME");
        UNITS.put("victory_cash_boost", "REPLACE_ME");
        UNITS.put("theme_1h_pass",      "REPLACE_ME");
    }

    /** Google's published test rewarded unit. Serves a real ad, pays nothing. */
    private static final String TEST_REWARDED = "ca-app-pub-3940256099942544/5224354917";

    private final Activity activity;
    private final WebView web;
    private final Handler main = new Handler(Looper.getMainLooper());
    private final Map<String, RewardedAd> loaded = new HashMap<>();
    private final Map<String, Boolean> loading = new HashMap<>();

    AdBridge(Activity activity, WebView web) {
        this.activity = activity;
        this.web = web;
    }

    /** True once a real id has been pasted in for every placement. */
    static boolean hasRealUnits() {
        for (String id : UNITS.values()) if ("REPLACE_ME".equals(id)) return false;
        return true;
    }

    private static String unitFor(String placement) {
        String id = UNITS.get(placement);
        return (id == null || "REPLACE_ME".equals(id)) ? TEST_REWARDED : id;
    }

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
                        loaded.put(placement, ad);
                    }
                    @Override public void onAdFailedToLoad(@NonNull LoadAdError e) {
                        loading.put(placement, false);
                        loaded.remove(placement);
                    }
                }));
    }

    void preloadAll() { for (String p : UNITS.keySet()) preload(p); }

    /**
     * Called from the page. Shows the ad for this placement if one is ready and
     * reports back through the token. An ad that is not ready is not worth
     * making the player wait on - we say no straight away and fetch one for
     * next time.
     */
    @JavascriptInterface
    public void showRewarded(final String placement, final String token) {
        main.post(() -> {
            RewardedAd ad = loaded.remove(placement);
            if (ad == null) {
                preload(placement);
                finish(token, false);
                return;
            }
            final boolean[] earned = { false };
            ad.setFullScreenContentCallback(new FullScreenContentCallback() {
                @Override public void onAdDismissedFullScreenContent() {
                    preload(placement);            // have the next one ready
                    finish(token, earned[0]);
                }
                @Override public void onAdFailedToShowFullScreenContent(@NonNull AdError e) {
                    preload(placement);
                    finish(token, false);
                }
            });
            ad.show(activity, r -> earned[0] = true);
        });
    }

    /** Whether an ad is sitting ready, so the page can hide a button that would fail. */
    @JavascriptInterface
    public boolean isReady(String placement) {
        return loaded.containsKey(placement);
    }

    private void finish(String token, boolean granted) {
        final String js = "window.__adResult && window.__adResult("
                + jsString(token) + "," + granted + ")";
        main.post(() -> web.evaluateJavascript(js, null));
    }

    /** The token is ours, but quoting it properly costs nothing and closes a hole. */
    private static String jsString(String s) {
        if (s == null) return "''";
        return "'" + s.replace("\\", "\\\\").replace("'", "\\'")
                      .replace("\n", "").replace("\r", "") + "'";
    }
}
