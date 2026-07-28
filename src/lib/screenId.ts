/** Public product origin (custom domain). */
export const DEFAULT_PUBLIC_ORIGIN = 'https://www.screensmart.co.il';

/** Prefer numeric screen IDs; legacy slug IDs still accepted. */
export function isValidScreenId(raw: string): boolean {
  const id = String(raw || '').trim();
  if (!id || id.length > 80) return false;
  if (/^\d{1,12}$/.test(id)) return true;
  // Legacy: letters / Hebrew / digits / dash / underscore / dot
  return /^[\u0590-\u05FFa-zA-Z0-9][\u0590-\u05FFa-zA-Z0-9._-]{0,79}$/.test(id);
}

export function isNumericScreenId(raw: string): boolean {
  return /^\d{1,12}$/.test(String(raw || '').trim());
}

export function normalizeScreenId(raw: string): string {
  return String(raw || '').trim();
}

/** Next free numeric id (1, 2, 3…) from known existing ids. */
export function nextNumericScreenId(existingIds: Iterable<string>): string {
  let max = 0;
  for (const raw of existingIds) {
    const id = String(raw || '').trim();
    if (!/^\d+$/.test(id)) continue;
    const n = Number(id);
    if (Number.isFinite(n) && n > max) max = n;
  }
  return String(max + 1);
}
