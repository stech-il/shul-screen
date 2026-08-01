import { cloudUrl } from './apiOrigin';

export type LandingStats = {
  total: number;
  today: number;
  last7Days: number;
  last30Days: number;
  signupsTotal: number;
  updatedAt?: string | null;
};

export async function trackLandingVisit(): Promise<void> {
  try {
    const key = 'screensmart.landing.visit.session';
    if (typeof sessionStorage !== 'undefined' && sessionStorage.getItem(key) === '1') {
      return;
    }
    if (typeof sessionStorage !== 'undefined') {
      sessionStorage.setItem(key, '1');
    }
    await fetch(cloudUrl('/api/analytics/landing'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
      keepalive: true,
    });
  } catch {
    /* ignore — stats must not break landing */
  }
}

export async function fetchLandingStats(): Promise<LandingStats> {
  const { apiFetch } = await import('./serverAuth');
  const res = await apiFetch(cloudUrl(`/api/analytics/landing?_=${Date.now()}`));
  const data = (await res.json().catch(() => ({}))) as LandingStats & {
    ok?: boolean;
    error?: string;
  };
  if (!res.ok) {
    throw new Error(data.error || `שגיאה ${res.status}`);
  }
  return {
    total: Math.max(0, Number(data.total) || 0),
    today: Math.max(0, Number(data.today) || 0),
    last7Days: Math.max(0, Number(data.last7Days) || 0),
    last30Days: Math.max(0, Number(data.last30Days) || 0),
    signupsTotal: Math.max(0, Number(data.signupsTotal) || 0),
    updatedAt: data.updatedAt ?? null,
  };
}
