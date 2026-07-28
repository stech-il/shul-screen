import type { CapacitorConfig } from '@capacitor/cli';

/**
 * Android kiosk shell: always boot from bundled `dist` so the app never opens blank
 * while waiting on a remote host. After setup we navigate to the live server display.
 * Optional: CAP_SERVER_URL=https://… forces remote WebView (debug only).
 */
const remoteOverride = String(process.env.CAP_SERVER_URL || '').trim();

const config: CapacitorConfig = {
  appId: 'il.screensmart.app',
  appName: 'screensmart',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
    // Allow leaving the local shell to the live display host after setup.
    allowNavigation: [
      'shul-screen.onrender.com',
      '*.onrender.com',
      'localhost',
      '127.0.0.1',
    ],
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
