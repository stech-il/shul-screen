import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { bootstrapAndroidKioskRoute, isAndroidKiosk, isNativeCapacitorShell } from './lib/androidKiosk';
import { isManageShellBuild, markManageSession } from './lib/manageApp';
import { purgeLegacyDesignTemplateStorage } from './lib/designTemplates';
import { startAppVersionWatch } from './lib/appVersion';
import './index.css';

// Free localStorage quota left by older template saves (before IndexedDB migration).
purgeLegacyDesignTemplateStorage();

/**
 * Legacy HashRouter links (`/#/display/12`) → clean paths (`/display/12`).
 * Runs before React mounts so BrowserRouter sees the final pathname.
 */
(function redirectHashToPath() {
  const { pathname, search, hash } = window.location;
  if (!hash || hash === '#' || hash === '#/') return;
  const raw = hash.startsWith('#') ? hash.slice(1) : hash;
  if (!raw.startsWith('/')) return;
  const q = raw.indexOf('?');
  const hashPath = q >= 0 ? raw.slice(0, q) : raw;
  const hashQuery = q >= 0 ? raw.slice(q) : '';
  const nextSearch = hashQuery || search || '';
  // Avoid clobbering real file/API routes if somehow hashed
  if (
    hashPath.startsWith('/assets') ||
    hashPath.startsWith('/api') ||
    hashPath.startsWith('/healthz')
  ) {
    return;
  }
  const next = `${hashPath}${nextSearch}`;
  if (`${pathname}${search}` === next) {
    window.history.replaceState(null, '', pathname + search);
    return;
  }
  window.history.replaceState(null, '', next);
})();

/**
 * Keep the PWA current without blinking the live display.
 * On /display (and kiosk) we install new service workers quietly and apply
 * them only on the next cold start — a mid-show reload causes a visible flash.
 */
function isLiveDisplayRoute(): boolean {
  const path = window.location.pathname || '';
  if (path.includes('/display') || path.includes('/screen/')) return true;
  try {
    return new URLSearchParams(window.location.search).get('kiosk') === '1';
  } catch {
    return false;
  }
}

if ('serviceWorker' in navigator) {
  // Never register a SW inside Capacitor — it blanks the bundled WebView.
  if (!isNativeCapacitorShell()) {
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (isLiveDisplayRoute()) return;
      window.location.reload();
    });
    void navigator.serviceWorker.getRegistration().then((reg) => {
      if (!reg) return;
      void reg.update();
      window.setInterval(() => void reg.update(), 60 * 60_000);
    });
    // Pull a newer deployed build when the server version advances.
    // Live displays check more often so empty-label fixes apply without a manual refresh.
    startAppVersionWatch(isLiveDisplayRoute() ? 2 * 60_000 : 15 * 60_000);
  } else {
    void navigator.serviceWorker.getRegistrations().then((regs) => {
      for (const reg of regs) void reg.unregister();
    });
  }
} else if (!isNativeCapacitorShell()) {
  startAppVersionWatch();
}

/** In-app path change without full reload (Capacitor WebView safe). */
function replaceInAppPath(pathWithOptionalQuery: string): void {
  window.history.replaceState(null, '', pathWithOptionalQuery);
}

async function start() {
  try {
    if (isManageShellBuild() && isNativeCapacitorShell()) {
      markManageSession();
      const path = window.location.pathname || '';
      const onManageFlow =
        path.startsWith('/manage') || path.startsWith('/login/') || path === '/admin' || path.startsWith('/admin/');
      if (!onManageFlow) {
        replaceInAppPath('/manage');
      }
    } else if (isAndroidKiosk()) {
      try {
        await bootstrapAndroidKioskRoute();
      } catch {
        const path = window.location.pathname || '';
        if (!path.includes('/kiosk-setup') && !path.includes('/display/')) {
          replaceInAppPath('/kiosk-setup');
        }
      }
    }

    const root = document.getElementById('root');
    if (!root) return;
    createRoot(root).render(
      <StrictMode>
        <App />
      </StrictMode>,
    );
  } catch (err) {
    const root = document.getElementById('root');
    if (root) {
      root.textContent = `שגיאת טעינה: ${err instanceof Error ? err.message : String(err)}`;
    }
  }
}

void start();
