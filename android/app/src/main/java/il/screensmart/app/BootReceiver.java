package il.screensmart.app;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.os.Build;

/**
 * Auto-start the hall kiosk after device reboot.
 * Management (phone) flavor intentionally skips this.
 */
public class BootReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context context, Intent intent) {
        if (BuildConfig.IS_MANAGE_APP) return;
        if (intent == null) return;
        String action = intent.getAction();
        if (action == null) return;
        if (
            !Intent.ACTION_BOOT_COMPLETED.equals(action) &&
            !"android.intent.action.QUICKBOOT_POWERON".equals(action) &&
            !"com.htc.intent.action.QUICKBOOT_POWERON".equals(action) &&
            !Intent.ACTION_MY_PACKAGE_REPLACED.equals(action)
        ) {
            return;
        }

        Intent launch = new Intent(context, MainActivity.class);
        launch.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        launch.putExtra("screensmart_autostart", true);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            // Some OEM launchers still allow activity start from BOOT_COMPLETED.
            context.startActivity(launch);
        } else {
            context.startActivity(launch);
        }
    }
}
