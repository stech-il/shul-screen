package il.screensmart.app;

import android.content.Context;
import android.util.Log;
import android.webkit.WebSettings;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/** Capacitor needs Chrome/WebView 60+. Many Android 7 boxes never updated. */
public final class WebViewVersion {
    private static final String TAG = "screensmart";
    private static final Pattern CHROME = Pattern.compile("Chrom(?:e|ium)/(\\d+)", Pattern.CASE_INSENSITIVE);

    private WebViewVersion() {}

    public static int chromeMajor(Context context) {
        try {
            String ua = WebSettings.getDefaultUserAgent(context);
            Matcher m = CHROME.matcher(ua != null ? ua : "");
            if (m.find()) return Integer.parseInt(m.group(1));
            Log.i(TAG, "WebView UA (no chrome): " + ua);
        } catch (Exception e) {
            Log.w(TAG, "WebView version check failed", e);
        }
        return 0;
    }

    /** True when the system WebView cannot run Capacitor — use embedded Gecko instead. */
    public static boolean needsEmbeddedEngine(Context context) {
        int ver = chromeMajor(context);
        Log.i(TAG, "system WebView chrome=" + ver);
        return ver > 0 && ver < 60;
    }
}
