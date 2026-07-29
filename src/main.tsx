import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { bootstrapAndroidKioskRoute, isAndroidKiosk, isNativeCapacitorShell } from './lib/androidKiosk';
import { isManageShellBuild, markManageSession } from './lib/manageApp';
import { purgeLegacyDesignTemplateStorage } from './lib/designTemplates';
import './index.css';

// Free localStorage quota left by older template saves (before IndexedDB migration).
purgeLegacyDesignTemplateStorage();

/**
 * HashRouter lives under /#/… — map plain paths like /admin → /#/admin
 * so shared links and bookmarks still open the right screen.
 */
(function redirectPathToHash() {
  const { pathname, search, hash } = window.location;
  if (hash && hash !== '#' && hash !== '#/') return;
  if (pathname === '/' || pathname === '') return;
  if (
    pathname.startsWith('/assets') ||
    pathname.startsWith('/api') ||
    pathname.startsWith('/healthz')
  ) {
    return;
  }
  const target = `/#${pathname}${search}`;
  window.location.replace(target);
})();

/**
 * Keep the PWA current without blinking the live display.
 * On /display (and kiosk) we install new service workers quietly and apply
 * them only on the next cold start — a mid-show reload causes a visible flash.
 */
function isLiveDisplayRoute(): boolean {
  const hash = window.location.hash || '';
  if (hash.includes('/display')) return true;
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
  } else {
    void navigator.serviceWorker.getRegistrations().then((regs) => {
      for (const reg of regs) void reg.unregister();
    });
  }
}

async function start() {
  try {
    if (isManageShellBuild() && isNativeCapacitorShell()) {
      markManageSession();
      const hash = window.location.hash || '';
      const onManageFlow =
        hash.includes('/manage') || hash.includes('/login/') || hash.includes('/admin/');
      // Hash-only navigation does NOT reload Capacitor WebView — never return early.
      if (!onManageFlow) {
        window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}#/manage`);
      }
    } else if (isAndroidKiosk()) {
      try {
        await bootstrapAndroidKioskRoute();
      } catch {
        const hash = window.location.hash || '';
        if (!hash.includes('/kiosk-setup') && !hash.includes('/display/')) {
          window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}#/kiosk-setup`);
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
