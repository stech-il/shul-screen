/** Minutes before a scheduled time when it should be visually emphasized. */
export const UPCOMING_HIGHLIGHT_MINUTES = 10;

/**
 * Parse "HH:MM" / "H:MM" into a Date on the same calendar day as `now`.
 */
export function parseTimeOnDay(timeStr: string, now: Date = new Date()): Date | null {
  const m = String(timeStr || '')
    .trim()
    .match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const hours = Number(m[1]);
  const minutes = Number(m[2]);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;
  const d = new Date(now);
  d.setHours(hours, minutes, 0, 0);
  return d;
}

/**
 * True when `now` is within `windowMinutes` before the target time
 * (and through that minute), so the row can be highlighted on screen.
 */
export function isUpcomingWithinMinutes(
  target: Date | string | null | undefined,
  now: Date = new Date(),
  windowMinutes = UPCOMING_HIGHLIGHT_MINUTES,
): boolean {
  if (target == null || target === '') return false;
  const at =
    target instanceof Date
      ? Number.isNaN(target.getTime())
        ? null
        : target
      : parseTimeOnDay(String(target), now);
  if (!at) return false;
  const diffMs = at.getTime() - now.getTime();
  const windowMs = Math.max(0, windowMinutes) * 60_000;
  // From windowMinutes before … until the end of the target minute.
  return diffMs > -60_000 && diffMs <= windowMs;
}
