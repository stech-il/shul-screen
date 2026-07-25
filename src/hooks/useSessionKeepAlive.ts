import { useEffect, useRef } from 'react';

/**
 * Keep a logged-in session alive while the user is active.
 * Calls onExpired when the session is no longer valid.
 */
export function useSessionKeepAlive(
  touch: () => unknown,
  onExpired: () => void,
  enabled = true,
) {
  const onExpiredRef = useRef(onExpired);
  const touchRef = useRef(touch);
  onExpiredRef.current = onExpired;
  touchRef.current = touch;

  useEffect(() => {
    if (!enabled) return;

    const ping = () => {
      const next = touchRef.current();
      if (!next) onExpiredRef.current();
    };

    ping();

    let throttleUntil = 0;
    const throttled = () => {
      const now = Date.now();
      if (now < throttleUntil) return;
      throttleUntil = now + 15_000;
      ping();
    };

    const windowEvents = ['pointerdown', 'keydown', 'mousemove', 'scroll', 'touchstart', 'focus'] as const;
    for (const ev of windowEvents) {
      window.addEventListener(ev, throttled, { passive: true });
    }
    document.addEventListener('visibilitychange', throttled, { passive: true });
    const interval = window.setInterval(ping, 60_000);

    return () => {
      for (const ev of windowEvents) {
        window.removeEventListener(ev, throttled);
      }
      document.removeEventListener('visibilitychange', throttled);
      window.clearInterval(interval);
    };
  }, [enabled]);
}
