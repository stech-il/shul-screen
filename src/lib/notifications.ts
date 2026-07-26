/** Client helpers for SMTP / trial notification API. */

async function api(path: string, init?: RequestInit) {
  const res = await fetch(path, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers || {}),
    },
    cache: 'no-store',
  });
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    throw new Error(String(data.error || `HTTP ${res.status}`));
  }
  return data;
}

export function fetchMailStatus(): Promise<{
  configured: boolean;
  host: string | null;
  from: string | null;
}> {
  return api('/api/notifications/status') as Promise<{
    configured: boolean;
    host: string | null;
    from: string | null;
  }>;
}

export function sendTestMail(to: string) {
  return api('/api/notifications/test', {
    method: 'POST',
    body: JSON.stringify({ to }),
  });
}

export function notifyTrialStarted(
  synagogueId: string,
  opts?: {
    username?: string;
    password?: string;
    loginUrl?: string;
    displayUrl?: string;
    to?: string;
  },
) {
  return api('/api/notifications/event', {
    method: 'POST',
    body: JSON.stringify({ type: 'trial-started', synagogueId, ...opts }),
  }).catch(() => null);
}
