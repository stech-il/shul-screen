package il.screensmart.app;

import android.os.Bundle;
import android.util.Log;
import android.view.View;
import android.view.WindowManager;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.widget.Toast;
import androidx.core.splashscreen.SplashScreen;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;
import com.getcapacitor.Bridge;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    private static final String TAG = "screensmart";

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        // Dismiss Android 12+ splash into the real activity theme (avoids stuck blank splash).
        SplashScreen.installSplashScreen(this);
        super.onCreate(savedInstanceState);

        // Always allow remote debugging on hall kiosks — helps diagnose Android 7 blanks.
        WebView.setWebContentsDebuggingEnabled(true);

        hardenWebView();
        warnIfWebViewTooOld();

        // Hall kiosk only — management phone app stays a normal Android UI.
        if (!BuildConfig.IS_MANAGE_APP) {
            getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
            applyImmersive();
        }
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus && !BuildConfig.IS_MANAGE_APP) {
            applyImmersive();
        }
    }

    private void hardenWebView() {
        try {
            Bridge bridge = getBridge();
            if (bridge == null || bridge.getWebView() == null) return;
            WebView webView = bridge.getWebView();
            WebSettings settings = webView.getSettings();
            settings.setJavaScriptEnabled(true);
            settings.setDomStorageEnabled(true);
            settings.setDatabaseEnabled(true);
            settings.setMediaPlaybackRequiresUserGesture(false);
            // Mixed content off; cloud is HTTPS. Keep wide viewport for old tablets.
            settings.setUseWideViewPort(true);
            settings.setLoadWithOverviewMode(true);
            if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.LOLLIPOP) {
                settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
            }
        } catch (Exception e) {
            Log.w(TAG, "hardenWebView failed", e);
        }
    }

    /** Capacitor needs Chrome/WebView 60+. Many Android 7 boxes never updated WebView. */
    private void warnIfWebViewTooOld() {
        try {
            String ua = WebSettings.getDefaultUserAgent(this);
            java.util.regex.Matcher m =
                java.util.regex.Pattern.compile("Chrom(?:e|ium)/(\\d+)", java.util.regex.Pattern.CASE_INSENSITIVE)
                    .matcher(ua != null ? ua : "");
            int ver = 0;
            if (m.find()) {
                ver = Integer.parseInt(m.group(1));
            }
            Log.i(TAG, "WebView UA chrome=" + ver + " ua=" + ua);
            if (ver > 0 && ver < 60) {
                Toast.makeText(
                        this,
                        "WebView ישן מדי (" + ver + "). עדכנו Chrome / Android System WebView",
                        Toast.LENGTH_LONG)
                    .show();
            }
        } catch (Exception e) {
            Log.w(TAG, "WebView version check failed", e);
        }
    }

    private void applyImmersive() {
        WindowCompat.setDecorFitsSystemWindows(getWindow(), false);
        View decor = getWindow().getDecorView();
        WindowInsetsControllerCompat controller =
            WindowCompat.getInsetsController(getWindow(), decor);
        if (controller != null) {
            controller.hide(WindowInsetsCompat.Type.systemBars());
            controller.setSystemBarsBehavior(
                WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
            );
        }
    }
}
