/** Mobile management shell — times & settings only (no screen design). */

export const MANAGE_STUDIO_TABS = new Set(['design', 'canvas', 'media', 'nusach']);

const LS_FLAG = 'screensmart.manageApp';

export function isManageShellBuild(): boolean {
  try {
    return String(import.meta.env.VITE_APP_SHELL || '').trim() === 'manage';
  } catch {
    return false;
  }
}

export function preferManageRoutes(): boolean {
  if (isManageShellBuild()) return true;
  try {
    return localStorage.getItem(LS_FLAG) === '1';
  } catch {
    return false;
  }
}

export function markManageSession(): void {
  try {
    localStorage.setItem(LS_FLAG, '1');
  } catch {
    /* ignore */
  }
}

export function adminPathFor(synagogueId: string, billing = false): string {
  const id = encodeURIComponent(synagogueId);
  const qs = billing ? '?billing=1' : '';
  return preferManageRoutes() ? `/manage/${id}${qs}` : `/admin/${id}${qs}`;
}

export function loginPathFor(synagogueId: string, manage = false): string {
  const id = encodeURIComponent(synagogueId);
  if (manage || preferManageRoutes()) return `/login/${id}?manage=1`;
  return `/login/${id}`;
}
