/**
 * Client-side crash / error breadcrumbs for the Electron kiosk shell.
 * Writes into %APPDATA%\\screensmart\\kiosk.log via window.shulKiosk.log.
 */
export function startKioskClientDiagnostics(): () => void {
  if (typeof window === 'undefined') return () => {};
  const log = window.shulKiosk?.log;
  if (!log || !window.shulKiosk?.isElectron) return () => {};

  let stopped = false;
  const write = (msg: string) => {
    if (stopped) return;
    try {
      void log(msg);
    } catch {
      /* ignore */
    }
  };

  write(
    `client-boot v=${typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : '?'} ua=${navigator.userAgent.slice(0, 120)} path=${location.pathname}${location.search}`,
  );

  const onError = (event: ErrorEvent) => {
    write(
      `js-error msg=${event.message || ''} file=${event.filename || ''} line=${event.lineno || 0}:${event.colno || 0}`,
    );
  };

  const onRejection = (event: PromiseRejectionEvent) => {
    const reason = event.reason;
    const text =
      reason instanceof Error
        ? `${reason.name}: ${reason.message}`
        : String(reason ?? 'unknown');
    write(`unhandledrejection ${text.slice(0, 500)}`);
  };

  const onGone = () => {
    write('pagehide / unload');
  };

  window.addEventListener('error', onError);
  window.addEventListener('unhandledrejection', onRejection);
  window.addEventListener('pagehide', onGone);

  // Light memory breadcrumb every 10 minutes (helps confirm rising heap before crash).
  const memTimer = window.setInterval(() => {
    const perf = performance as Performance & {
      memory?: { usedJSHeapSize?: number; jsHeapSizeLimit?: number };
    };
    const mem = perf.memory;
    if (!mem?.usedJSHeapSize) return;
    const usedMb = Math.round(mem.usedJSHeapSize / (1024 * 1024));
    const limitMb = Math.round((mem.jsHeapSizeLimit || 0) / (1024 * 1024));
    write(`memory usedMb=${usedMb} limitMb=${limitMb}`);
  }, 10 * 60_000);

  return () => {
    stopped = true;
    window.clearInterval(memTimer);
    window.removeEventListener('error', onError);
    window.removeEventListener('unhandledrejection', onRejection);
    window.removeEventListener('pagehide', onGone);
  };
}
