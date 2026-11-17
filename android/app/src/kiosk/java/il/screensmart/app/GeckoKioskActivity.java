package il.screensmart.app;

import android.os.Bundle;
import android.text.TextUtils;
import android.util.Log;
import android.view.View;
import android.view.WindowManager;
import android.widget.Button;
import android.widget.EditText;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.TextView;
import android.widget.Toast;
import androidx.appcompat.app.AppCompatActivity;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;
import org.mozilla.geckoview.GeckoRuntime;
import org.mozilla.geckoview.GeckoRuntimeSettings;
import org.mozilla.geckoview.GeckoSession;
import org.mozilla.geckoview.GeckoView;

/**
 * Hall kiosk for Android 7 devices with an ancient System WebView.
 * Embeds Mozilla Gecko (Firefox engine) inside the APK so the screen does not
 * depend on Chrome / Android System WebView updates.
 */
public class GeckoKioskActivity extends AppCompatActivity {
    private static final String TAG = "screensmart-gecko";
    private static final String PREFS = "CapacitorStorage";
    private static final String KEY_SHUL = "screensmart.kiosk.shulId";
    private static final String DISPLAY_BASE = "https://www.screensmart.co.il/display/";

    private static GeckoRuntime sRuntime;

    private GeckoView geckoView;
    private GeckoSession session;
    private LinearLayout setupPanel;
    private EditText shulInput;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        setContentView(buildUi());
        applyImmersive();

        String shulId = readShulId();
        if (TextUtils.isEmpty(shulId)) {
            showSetup();
        } else {
            openDisplay(shulId);
        }
    }

    private View buildUi() {
        FrameLayout root = new FrameLayout(this);
        root.setLayoutParams(
            new FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT,
                FrameLayout.LayoutParams.MATCH_PARENT
            )
        );

        geckoView = new GeckoView(this);
        geckoView.setLayoutParams(
            new FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT,
                FrameLayout.LayoutParams.MATCH_PARENT
            )
        );
        geckoView.setVisibility(View.GONE);
        root.addView(geckoView);

        setupPanel = new LinearLayout(this);
        setupPanel.setOrientation(LinearLayout.VERTICAL);
        setupPanel.setPadding(48, 72, 48, 48);
        setupPanel.setLayoutParams(
            new FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT,
                FrameLayout.LayoutParams.MATCH_PARENT
            )
        );

        TextView title = new TextView(this);
        title.setText("screensmart — הגדרת מסך");
        title.setTextSize(22);
        title.setPadding(0, 0, 0, 24);
        setupPanel.addView(title);

        TextView hint = new TextView(this);
        hint.setText(
            "המכשיר משתמש במנוע Firefox מובנה באפליקציה (לא תלוי ב-Chrome).\nהזינו את מספר המסך מהמערכת:"
        );
        hint.setTextSize(16);
        hint.setPadding(0, 0, 0, 24);
        setupPanel.addView(hint);

        shulInput = new EditText(this);
        shulInput.setHint("לדוגמה: 5089");
        shulInput.setInputType(android.text.InputType.TYPE_CLASS_NUMBER);
        shulInput.setTextSize(20);
        setupPanel.addView(shulInput);

        Button start = new Button(this);
        start.setText("הפעלת מסך");
        start.setOnClickListener(v -> {
            String id = shulInput.getText() != null ? shulInput.getText().toString().trim() : "";
            if (!id.matches("\\d{1,8}")) {
                Toast.makeText(this, "מזהה מסך לא תקין", Toast.LENGTH_LONG).show();
                return;
            }
            saveShulId(id);
            openDisplay(id);
        });
        LinearLayout.LayoutParams bp =
            new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                LinearLayout.LayoutParams.WRAP_CONTENT
            );
        bp.topMargin = 32;
        start.setLayoutParams(bp);
        setupPanel.addView(start);

        TextView note = new TextView(this);
        note.setText("המנוע מובנה באפליקציה — אין צורך בעדכון Chrome.");
        note.setTextSize(14);
        note.setPadding(0, 40, 0, 0);
        setupPanel.addView(note);

        root.addView(setupPanel);
        return root;
    }

    private void showSetup() {
        setupPanel.setVisibility(View.VISIBLE);
        geckoView.setVisibility(View.GONE);
    }

    private void openDisplay(String shulId) {
        setupPanel.setVisibility(View.GONE);
        geckoView.setVisibility(View.VISIBLE);
        ensureSession();
        String url = DISPLAY_BASE + shulId + "?kiosk=1";
        Log.i(TAG, "load " + url);
        session.loadUri(url);
        applyImmersive();
    }

    private void ensureSession() {
        if (sRuntime == null) {
            GeckoRuntimeSettings settings =
                new GeckoRuntimeSettings.Builder()
                    .remoteDebuggingEnabled(BuildConfig.DEBUG)
                    .build();
            sRuntime = GeckoRuntime.create(this, settings);
        }
        if (session == null) {
            session = new GeckoSession();
            session.open(sRuntime);
            geckoView.setSession(session);
        }
    }

    private String readShulId() {
        try {
            return getSharedPreferences(PREFS, MODE_PRIVATE).getString(KEY_SHUL, "").trim();
        } catch (Exception e) {
            return "";
        }
    }

    private void saveShulId(String id) {
        getSharedPreferences(PREFS, MODE_PRIVATE).edit().putString(KEY_SHUL, id).apply();
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) applyImmersive();
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

    @Override
    protected void onDestroy() {
        try {
            if (session != null) {
                session.close();
                session = null;
            }
        } catch (Exception e) {
            Log.w(TAG, "session close", e);
        }
        super.onDestroy();
    }
}
