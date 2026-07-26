import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { purgeLegacyDesignTemplateStorage } from './lib/designTemplates';
import './index.css';

// Free localStorage quota left by older template saves (before IndexedDB migration).
purgeLegacyDesignTemplateStorage();

/** Kiosk often keeps an old PWA build; force reload when a new service worker takes over. */
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    window.location.reload();
  });
  void navigator.serviceWorker.getRegistration().then((reg) => {
    void reg?.update();
    // Check again periodically so a long-running kiosk picks up deploys.
    window.setInterval(() => void reg?.update(), 5 * 60_000);
  });
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
