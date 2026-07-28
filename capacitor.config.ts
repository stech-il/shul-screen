import type { CapacitorConfig } from '@capacitor/cli';

/**
 * Android kiosk shell around the live web app (same idea as Electron).
 * Default: load production so /api/* and cloud updates work same-origin.
 * Override with CAP_SERVER_URL (empty string = bundled dist only).
 */
const rawServer = process.env.CAP_SERVER_URL;
const useRemote = rawServer !== '';
const serverUrl = (rawServer || 'https://shul-screen.onrender.com').replace(/\/$/, '');

const config: CapacitorConfig = {
  appId: 'il.screensmart.app',
  appName: 'screensmart',
  webDir: 'dist',
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

if (useRemote) {
  config.server = {
    url: serverUrl,
    cleartext: false,
    androidScheme: 'https',
  };
}

export default config;
