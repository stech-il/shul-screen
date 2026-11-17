package il.screensmart.app;

import android.content.Intent;
import android.os.Bundle;
import android.util.Log;
import android.view.View;
import android.view.WindowManager;
import android.webkit.WebSettings;
import android.webkit.WebView;
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
        // Android 7 boxes with Chrome/WebView < 60 cannot run Capacitor.
        // Route to the embedded Gecko (Firefox) engine shipped inside the kiosk APK.
        if (!BuildConfig.IS_MANAGE_APP && WebViewVersion.needsEmbeddedEngine(this)) {
            if (launchEmbeddedGecko()) {
                finish();
                return;
            }
        }

        // Dismiss Android 12+ splash into the real activity theme (avoids stuck blank splash).
        SplashScreen.installSplashScreen(this);
        super.onCreate(savedInstanceState);

        // Always allow remote debugging on hall kiosks — helps diagnose Android 7 blanks.
        WebView.setWebContentsDebuggingEnabled(true);

        hardenWebView();

        // Hall kiosk only — management phone app stays a normal Android UI.
        if (!BuildConfig.IS_MANAGE_APP) {
            getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
            applyImmersive();
        }
    }

    private boolean launchEmbeddedGecko() {
        try {
            Class<?> cls = Class.forName("il.screensmart.app.GeckoKioskActivity");
            Intent i = new Intent(this, cls);
            i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
            if (getIntent() != null && getIntent().getExtras() != null) {
                i.putExtras(getIntent().getExtras());
            }
            startActivity(i);
            return true;
        } catch (Throwable t) {
            Log.e(TAG, "Embedded Gecko engine unavailable", t);
            return false;
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
            settings.setMediaPlaybackRequiresUserGesture(false);
            settings.setUseWideViewPort(true);
            settings.setLoadWithOverviewMode(true);
            if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.LOLLIPOP) {
                settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
            }
        } catch (Exception e) {
            Log.w(TAG, "hardenWebView failed", e);
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
