/** Kiosk helpers: fullscreen + screen wake lock */

let wakeLock: WakeLockSentinel | null = null;

export async function enterFullscreen(el: HTMLElement = document.documentElement): Promise<boolean> {
  try {
    if (!document.fullscreenElement) {
      await el.requestFullscreen();
    }
    return true;
  } catch {
    return false;
  }
}

export async function exitFullscreen(): Promise<void> {
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
  } catch {
    /* ignore */
  }
}

export function isFullscreen(): boolean {
  return Boolean(document.fullscreenElement);
}

export async function requestWakeLock(): Promise<boolean> {
  try {
    if ('wakeLock' in navigator) {
      wakeLock = await navigator.wakeLock.request('screen');
      wakeLock.addEventListener('release', () => {
        wakeLock = null;
      });
      return true;
    }
  } catch {
    /* ignore */
  }
  return false;
}

export async function releaseWakeLock(): Promise<void> {
  try {
    await wakeLock?.release();
  } catch {
    /* ignore */
  }
  wakeLock = null;
}

export async function enableKiosk(el?: HTMLElement): Promise<{ fullscreen: boolean; wake: boolean }> {
  const fullscreen = await enterFullscreen(el);
  const wake = await requestWakeLock();
  return { fullscreen, wake };
}

export async function disableKiosk(): Promise<void> {
  await exitFullscreen();
  await releaseWakeLock();
}

/** Re-acquire wake lock when tab becomes visible again */
export function watchWakeLock(): () => void {
  const onVis = () => {
    if (document.visibilityState === 'visible' && isFullscreen()) {
      void requestWakeLock();
    }
  };
  document.addEventListener('visibilitychange', onVis);
  return () => document.removeEventListener('visibilitychange', onVis);
}
