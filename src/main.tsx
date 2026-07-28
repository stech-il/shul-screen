import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { bootstrapAndroidKioskRoute } from './lib/androidKiosk';
import { purgeLegacyDesignTemplateStorage } from './lib/designTemplates';
import './index.css';

// Free localStorage quota left by older template saves (before IndexedDB migration).
purgeLegacyDesignTemplateStorage();

void bootstrapAndroidKioskRoute();

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
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (isLiveDisplayRoute()) return;
    window.location.reload();
  });
  void navigator.serviceWorker.getRegistration().then((reg) => {
    if (!reg) return;
    void reg.update();
    // Hourly is enough; kiosk startup script already clears stale caches.
    window.setInterval(() => void reg.update(), 60 * 60_000);
  });
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
