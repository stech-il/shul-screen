import { cloudUrl } from './apiOrigin';

export type TrialSignupInput = {
  contactName: string;
  phone: string;
  email: string;
  synagogueName: string;
  cityId: string;
  notes?: string;
};

export type TrialSignupResult = {
  ok: boolean;
  synagogueId: string;
  name: string;
  username: string;
  password: string;
  loginUrl: string;
  displayUrl: string;
  billingUrl: string;
  trialDays: number;
  expiresAt: string;
  email: string;
  mailOk: boolean;
  mailError?: string;
  message: string;
  error?: string;
};

export async function startTrialSignup(input: TrialSignupInput): Promise<TrialSignupResult> {
  const res = await fetch(cloudUrl('/api/signup/trial'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      ...input,
      origin: typeof window !== 'undefined' ? window.location.origin : undefined,
    }),
  });
  const data = (await res.json().catch(() => ({}))) as TrialSignupResult;
  if (!res.ok || !data.ok) {
    throw new Error(data.error || `פתיחת ניסיון נכשלה (${res.status})`);
  }
  return data;
}
