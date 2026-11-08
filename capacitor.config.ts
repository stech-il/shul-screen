import type { CapacitorConfig } from '@capacitor/cli';

/**
 * Android shells:
 * - default / kiosk: hall display APK (il.screensmart.app)
 * - manage (VITE_APP_SHELL=manage): phone admin APK for Play Store (il.screensmart.manage)
 *
 * Optional CAP_SERVER_URL is for debug remote WebView only.
 */
const remoteOverride = String(process.env.CAP_SERVER_URL || '').trim();
const isManage =
  String(process.env.VITE_APP_SHELL || process.env.CAP_APP_SHELL || '')
    .trim()
    .toLowerCase() === 'manage';

const config: CapacitorConfig = {
  appId: isManage ? 'il.screensmart.manage' : 'il.screensmart.app',
  appName: isManage ? 'screensmart ניהול' : 'screensmart',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
    // Full origins — required for WebView / native bridge to reach the public API.
    allowNavigation: [
      'https://www.screensmart.co.il/*',
      'https://screensmart.co.il/*',
      'https://www.screensmart.co.il',
      'https://screensmart.co.il',
      'localhost',
      'android.localhost',
    ],
  },
  android: {
    backgroundColor: isManage ? '#f5f7fa' : '#0f1c22',
    allowMixedContent: false,
  },
  plugins: {
    // Native HTTP bypasses WebView CORS — required for cloud API from the APK shell.
    CapacitorHttp: {
      enabled: true,
    },
    SplashScreen: {
      launchAutoHide: true,
      backgroundColor: isManage ? '#f5f7fa' : '#0f1c22',
      showSpinner: false,
    },
  },
};

if (remoteOverride) {
  config.server = {
    ...config.server,
    url: remoteOverride.replace(/\/$/, ''),
    cleartext: false,
  };
}

export default config;
