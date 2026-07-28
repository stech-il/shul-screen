import type { CapacitorConfig } from '@capacitor/cli';

/**
 * Android kiosk: bundled WebView only (never opens Chrome).
 * Cloud data is fetched from the saved server URL via JS (see apiOrigin.ts).
 * Optional CAP_SERVER_URL is for debug remote WebView only.
 */
const remoteOverride = String(process.env.CAP_SERVER_URL || '').trim();

const config: CapacitorConfig = {
  appId: 'il.screensmart.app',
  appName: 'screensmart',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
    // Do not list external hosts — keeps all navigation inside the app WebView.
  },
  android: {
    backgroundColor: '#0f1c22',
    allowMixedContent: false,
  },
  plugins: {
    SplashScreen: {
      launchAutoHide: true,
      backgroundColor: '#0f1c22',
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
