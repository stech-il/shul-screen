import {
  browserSupportsWebAuthn,
  startAuthentication,
  startRegistration,
} from '@simplewebauthn/browser';
import type {
  AuthenticationResponseJSON,
  PublicKeyCredentialCreationOptionsJSON,
  PublicKeyCredentialRequestOptionsJSON,
  RegistrationResponseJSON,
} from '@simplewebauthn/browser';
import { cloudUrl } from './apiOrigin';
import type { GoogleAuthMember } from './googleAuth';

export function isPasskeySupported(): boolean {
  try {
    return browserSupportsWebAuthn();
  } catch {
    return false;
  }
}

export async function fetchPasskeyStatus(synagogueId: string): Promise<boolean> {
  try {
    const res = await fetch(
      cloudUrl(`/api/auth/webauthn/status?synagogueId=${encodeURIComponent(synagogueId)}`),
      { cache: 'no-store' },
    );
    if (!res.ok) return false;
    const data = (await res.json()) as { enabled?: boolean };
    return Boolean(data.enabled);
  } catch {
    return false;
  }
}

export async function registerPasskey(input: {
  synagogueId: string;
  username: string;
  password: string;
}): Promise<GoogleAuthMember> {
  const optRes = await fetch(cloudUrl('/api/auth/webauthn/register/options'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  const optData = (await optRes.json()) as {
    ok?: boolean;
    error?: string;
    options?: PublicKeyCredentialCreationOptionsJSON;
    memberId?: string;
  };
  if (!optRes.ok || !optData.ok || !optData.options || !optData.memberId) {
    throw new Error(optData.error || 'לא ניתן להתחיל רישום מפתח');
  }
  let response: RegistrationResponseJSON;
  try {
    response = await startRegistration({ optionsJSON: optData.options });
  } catch (err) {
    throw new Error(err instanceof Error ? err.message : 'רישום מפתח בוטל');
  }
  const verRes = await fetch(cloudUrl('/api/auth/webauthn/register/verify'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      synagogueId: input.synagogueId,
      memberId: optData.memberId,
      response,
    }),
  });
  const verData = (await verRes.json()) as {
    ok?: boolean;
    error?: string;
    member?: GoogleAuthMember;
  };
  if (!verRes.ok || !verData.ok || !verData.member) {
    throw new Error(verData.error || 'אימות מפתח נכשל');
  }
  return verData.member;
}

export async function loginWithPasskey(synagogueId: string): Promise<GoogleAuthMember> {
  const optRes = await fetch(cloudUrl('/api/auth/webauthn/login/options'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ synagogueId }),
  });
  const optData = (await optRes.json()) as {
    ok?: boolean;
    error?: string;
    options?: PublicKeyCredentialRequestOptionsJSON;
  };
  if (!optRes.ok || !optData.ok || !optData.options) {
    throw new Error(optData.error || 'לא ניתן להתחיל כניסה עם מפתח');
  }
  const expectedChallenge = String(optData.options.challenge || '');
  let response: AuthenticationResponseJSON;
  try {
    response = await startAuthentication({ optionsJSON: optData.options });
  } catch (err) {
    throw new Error(err instanceof Error ? err.message : 'אימות מפתח בוטל');
  }
  const verRes = await fetch(cloudUrl('/api/auth/webauthn/login/verify'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ synagogueId, response, expectedChallenge }),
  });
  const verData = (await verRes.json()) as {
    ok?: boolean;
    error?: string;
    member?: GoogleAuthMember;
  };
  if (!verRes.ok || !verData.ok || !verData.member) {
    throw new Error(verData.error || 'כניסה עם מפתח נכשלה');
  }
  return verData.member;
}
