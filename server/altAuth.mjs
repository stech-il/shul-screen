/**
 * Alternate login: Google Sign-In + WebAuthn passkeys / platform biometrics.
 *
 * POST /api/auth/google              { idToken, synagogueId }
 * POST /api/auth/google-link         { idToken, synagogueId, username, password }
 * GET  /api/auth/google-config
 * POST /api/auth/webauthn/register/options  { synagogueId, username, password }
 * POST /api/auth/webauthn/register/verify   { synagogueId, memberId, response }
 * POST /api/auth/webauthn/login/options     { synagogueId }
 * POST /api/auth/webauthn/login/verify      { synagogueId, response }
 * GET  /api/auth/webauthn/status?synagogueId=
 */
import crypto from 'node:crypto';
import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
} from '@simplewebauthn/server';
import { getBundle, putBundle } from './cloudStore.mjs';
import {
  checkRateLimit,
  clientIp,
  createSession,
  readBodyLimited,
  sendJson as authSendJson,
  verifyPassword as authVerifyPassword,
} from './apiAuth.mjs';

const PUBLIC_ORIGIN = String(
  process.env.PUBLIC_ORIGIN ||
    process.env.RENDER_EXTERNAL_URL ||
    'https://www.screensmart.co.il',
)
  .trim()
  .replace(/\/$/, '');

const GOOGLE_CLIENT_ID = String(
  process.env.GOOGLE_CLIENT_ID || process.env.VITE_GOOGLE_CLIENT_ID || '',
).trim();

/** @type {Map<string, { kind: string; synagogueId: string; memberId?: string; expiresAt: number; expect?: object }>} */
const challenges = new Map();

function sendJson(res, status, obj, req) {
  authSendJson(res, status, obj, req);
}

async function readBody(req) {
  return readBodyLimited(req);
}

function verifyPassword(password, stored) {
  return authVerifyPassword(password, stored);
}

function issueMemberToken(synagogueId, member) {
  const session = createSession({
    kind: 'member',
    synagogueId,
    memberId: member.id,
    role: member.role || 'editor',
    username: String(member.username || member.name || '')
      .trim()
      .toLowerCase(),
    memberName: member.name || member.username,
  });
  return {
    ok: true,
    token: session.token,
    expiresAt: session.expiresAt,
    member: publicMember(member),
  };
}

function memberPasswordHash(m) {
  return m?.passwordHash || m?.pinHash || '';
}

function normalizeEmail(email) {
  return String(email || '')
    .trim()
    .toLowerCase()
    .replace(/[\u200e\u200f\u202a-\u202e\u00a0]/g, '');
}

function memberMatchEmails(m) {
  return [m?.email, m?.username, m?.name].map(normalizeEmail).filter(Boolean);
}

function gmailLocalKey(email) {
  const e = normalizeEmail(email);
  if (!e.endsWith('@gmail.com') && !e.endsWith('@googlemail.com')) return '';
  return e.split('@')[0].replace(/\./g, '');
}

function findMemberByGoogle(config, profile) {
  const email = normalizeEmail(profile.email);
  const sub = String(profile.sub || '').trim();
  const members = Array.isArray(config?.members) ? config.members : [];

  let member = members.find((m) => m.googleSub && sub && m.googleSub === sub);
  if (member) return member;

  member = members.find((m) => memberMatchEmails(m).includes(email));
  if (member) return member;

  const gKey = gmailLocalKey(email);
  if (gKey) {
    member = members.find((m) =>
      memberMatchEmails(m).some((e) => gmailLocalKey(e) && gmailLocalKey(e) === gKey),
    );
    if (member) return member;
  }

  // Only when no members exist — contact email may bootstrap first owner login
  if (!members.length && email && normalizeEmail(config.contactEmail) === email) {
    return {
      id: 'bootstrap',
      name: config.name || profile.name || 'admin',
      username: 'admin',
      role: 'owner',
      email,
      googleSub: sub,
    };
  }

  return null;
}

function publicMember(m) {
  return {
    id: m.id,
    name: m.name,
    username: m.username,
    role: m.role,
    email: m.email || '',
    hasPasskeys: Array.isArray(m.passkeys) && m.passkeys.length > 0,
    googleLinked: Boolean(m.googleSub || m.email),
  };
}

async function verifyGoogleIdToken(idToken) {
  if (!GOOGLE_CLIENT_ID) {
    throw new Error('Google Sign-In לא מוגדר בשרת (GOOGLE_CLIENT_ID)');
  }
  const token = String(idToken || '').trim();
  if (!token) throw new Error('חסר אסימון Google');
  const res = await fetch(
    `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(token)}`,
  );
  const data = await res.json();
  if (!res.ok || data.error) {
    throw new Error('אימות Google נכשל');
  }
  if (data.aud !== GOOGLE_CLIENT_ID) {
    throw new Error('Google Client ID לא תואם');
  }
  const email = normalizeEmail(data.email);
  if (!email) throw new Error('חשבון Google ללא אימייל');
  const verified = data.email_verified === true || data.email_verified === 'true';
  if (!verified) throw new Error('אימייל Google לא מאומת');
  return {
    sub: String(data.sub || ''),
    email,
    name: String(data.name || data.email || ''),
  };
}

function rpFromRequest(req) {
  const headerOrigin = String(req.headers.origin || '').trim();
  let origin = headerOrigin || PUBLIC_ORIGIN;
  try {
    const u = new URL(origin);
    return { rpID: u.hostname, origin: u.origin };
  } catch {
    const u = new URL(PUBLIC_ORIGIN);
    return { rpID: u.hostname, origin: u.origin };
  }
}

function pruneChallenges() {
  const now = Date.now();
  for (const [k, v] of challenges) {
    if (!v || v.expiresAt <= now) challenges.delete(k);
  }
}

function putChallenge(key, row) {
  pruneChallenges();
  challenges.set(key, { ...row, expiresAt: Date.now() + 5 * 60 * 1000 });
}

function takeChallenge(key) {
  pruneChallenges();
  const row = challenges.get(key);
  challenges.delete(key);
  return row || null;
}

async function authenticateLocalMember(config, username, password) {
  const user = String(username || '')
    .trim()
    .toLowerCase();
  const pass = String(password || '');
  const members = Array.isArray(config?.members) ? config.members : [];
  const member = members.find((m) => (m.username || m.name || '').toLowerCase() === user);
  if (!member) return null;
  if (!verifyPassword(pass, memberPasswordHash(member))) return null;
  return member;
}

export async function handleAltAuth(req, res, url) {
  if (req.method === 'OPTIONS' && url.pathname.startsWith('/api/auth/')) {
    sendJson(res, 204, {}, req);
    return true;
  }

  try {
    if (url.pathname === '/api/auth/google-config' && req.method === 'GET') {
      sendJson(res, 200, {
        ok: true,
        enabled: Boolean(GOOGLE_CLIENT_ID),
        clientId: GOOGLE_CLIENT_ID || '',
      }, req);
      return true;
    }

    if (url.pathname === '/api/auth/google' && req.method === 'POST') {
      const rl = checkRateLimit(`google:${clientIp(req)}`, 40, 15 * 60 * 1000);
      if (!rl.ok) {
        sendJson(res, 429, { ok: false, error: 'יותר מדי ניסיונות התחברות' }, req);
        return true;
      }
      const raw = await readBody(req);
      const body = JSON.parse(raw.toString('utf8') || '{}');
      const synagogueId = String(body.synagogueId || '').trim();
      if (!synagogueId) {
        sendJson(res, 400, { ok: false, error: 'חסר מזהה בית כנסת' }, req);
        return true;
      }
      const profile = await verifyGoogleIdToken(body.idToken);
      const bundle = await getBundle(synagogueId);
      if (!bundle?.config) {
        sendJson(res, 404, { ok: false, error: 'בית כנסת לא נמצא' }, req);
        return true;
      }
      let member = findMemberByGoogle(bundle.config, profile);
      if (!member) {
        sendJson(res, 403, {
          ok: false,
          email: profile.email,
          error: `לא נמצא משתמש עם האימייל ${profile.email}. בלשונית משתמשים הזינו את אותו אימייל בשדה האימייל (או כשם משתמש), לחצו שמירה למסך, ונסו שוב.`,
        }, req);
        return true;
      }
      // Persist googleSub / email for faster future matches (skip synthetic bootstrap)
      if (member.id !== 'bootstrap' && Array.isArray(bundle.config.members)) {
        let changed = false;
        const members = bundle.config.members.map((m) => {
          if (m.id !== member.id) return m;
          const next = { ...m };
          if (normalizeEmail(next.email) !== profile.email) {
            next.email = profile.email;
            changed = true;
          }
          if (profile.sub && next.googleSub !== profile.sub) {
            next.googleSub = profile.sub;
            changed = true;
          }
          return next;
        });
        if (changed) {
          await putBundle(synagogueId, {
            ...bundle,
            config: {
              ...bundle.config,
              members,
              updatedAt: new Date().toISOString(),
              revision: (bundle.config.revision || 0) + 1,
            },
            syncedAt: new Date().toISOString(),
          });
          member = members.find((m) => m.id === member.id) || member;
        }
      }
      sendJson(res, 200, issueMemberToken(synagogueId, member), req);
      return true;
    }

    if (url.pathname === '/api/auth/google-link' && req.method === 'POST') {
      const raw = await readBody(req);
      const body = JSON.parse(raw.toString('utf8') || '{}');
      const synagogueId = String(body.synagogueId || '').trim();
      if (!synagogueId) {
        sendJson(res, 400, { ok: false, error: 'חסר מזהה בית כנסת' }, req);
        return true;
      }
      const bundle = await getBundle(synagogueId);
      if (!bundle?.config) {
        sendJson(res, 404, { ok: false, error: 'בית כנסת לא נמצא' }, req);
        return true;
      }
      const member = await authenticateLocalMember(
        bundle.config,
        body.username,
        body.password,
      );
      if (!member) {
        sendJson(res, 401, { ok: false, error: 'שם משתמש או סיסמה שגויים' }, req);
        return true;
      }
      const profile = await verifyGoogleIdToken(body.idToken);
      const members = bundle.config.members.map((m) =>
        m.id === member.id
          ? { ...m, email: profile.email, googleSub: profile.sub || m.googleSub }
          : m,
      );
      await putBundle(synagogueId, {
        ...bundle,
        config: {
          ...bundle.config,
          members,
          updatedAt: new Date().toISOString(),
          revision: (bundle.config.revision || 0) + 1,
        },
        syncedAt: new Date().toISOString(),
      });
      sendJson(
        res,
        200,
        issueMemberToken(synagogueId, members.find((m) => m.id === member.id) || member),
        req,
      );
      return true;
    }

    if (url.pathname === '/api/auth/webauthn/status' && req.method === 'GET') {
      const synagogueId = String(url.searchParams.get('synagogueId') || '').trim();
      if (!synagogueId) {
        sendJson(res, 400, { ok: false, error: 'חסר מזהה' }, req);
        return true;
      }
      const bundle = await getBundle(synagogueId);
      const members = Array.isArray(bundle?.config?.members) ? bundle.config.members : [];
      const count = members.reduce(
        (n, m) => n + (Array.isArray(m.passkeys) ? m.passkeys.length : 0),
        0,
      );
      sendJson(res, 200, { ok: true, passkeyCount: count, enabled: count > 0 }, req);
      return true;
    }

    if (url.pathname === '/api/auth/webauthn/register/options' && req.method === 'POST') {
      const raw = await readBody(req);
      const body = JSON.parse(raw.toString('utf8') || '{}');
      const synagogueId = String(body.synagogueId || '').trim();
      const bundle = await getBundle(synagogueId);
      if (!bundle?.config) {
        sendJson(res, 404, { ok: false, error: 'בית כנסת לא נמצא' }, req);
        return true;
      }
      const member = await authenticateLocalMember(
        bundle.config,
        body.username,
        body.password,
      );
      if (!member) {
        sendJson(res, 401, { ok: false, error: 'שם משתמש או סיסמה שגויים' }, req);
        return true;
      }
      const { rpID, origin } = rpFromRequest(req);
      const existing = Array.isArray(member.passkeys) ? member.passkeys : [];
      const options = await generateRegistrationOptions({
        rpName: 'screensmart',
        rpID,
        userName: member.username || member.name || member.id,
        userDisplayName: member.name || member.username || member.id,
        userID: new TextEncoder().encode(member.id),
        attestationType: 'none',
        excludeCredentials: existing.map((p) => ({
          id: p.credentialId,
          transports: p.transports,
        })),
        authenticatorSelection: {
          residentKey: 'preferred',
          userVerification: 'preferred',
          authenticatorAttachment: 'platform',
        },
      });
      putChallenge(`reg:${synagogueId}:${member.id}`, {
        kind: 'reg',
        synagogueId,
        memberId: member.id,
        expect: { challenge: options.challenge, rpID, origin },
      });
      sendJson(res, 200, { ok: true, options, memberId: member.id }, req);
      return true;
    }

    if (url.pathname === '/api/auth/webauthn/register/verify' && req.method === 'POST') {
      const raw = await readBody(req);
      const body = JSON.parse(raw.toString('utf8') || '{}');
      const synagogueId = String(body.synagogueId || '').trim();
      const memberId = String(body.memberId || '').trim();
      const challengeRow = takeChallenge(`reg:${synagogueId}:${memberId}`);
      if (!challengeRow?.expect) {
        sendJson(res, 400, { ok: false, error: 'פג תוקף האתגר — נסו שוב' }, req);
        return true;
      }
      const bundle = await getBundle(synagogueId);
      if (!bundle?.config) {
        sendJson(res, 404, { ok: false, error: 'בית כנסת לא נמצא' }, req);
        return true;
      }
      const verification = await verifyRegistrationResponse({
        response: body.response,
        expectedChallenge: challengeRow.expect.challenge,
        expectedOrigin: challengeRow.expect.origin,
        expectedRPID: challengeRow.expect.rpID,
      });
      if (!verification.verified || !verification.registrationInfo) {
        sendJson(res, 400, { ok: false, error: 'אימות מפתח נכשל' }, req);
        return true;
      }
      const info = verification.registrationInfo;
      const credentialId =
        typeof info.credential.id === 'string'
          ? info.credential.id
          : Buffer.from(info.credential.id).toString('base64url');
      const publicKey = Buffer.from(info.credential.publicKey).toString('base64url');
      const passkey = {
        credentialId,
        publicKey,
        counter: info.credential.counter || 0,
        transports: body.response?.response?.transports || info.credential.transports || [],
        createdAt: new Date().toISOString(),
        deviceType: info.credentialDeviceType,
      };
      const members = bundle.config.members.map((m) => {
        if (m.id !== memberId) return m;
        const list = Array.isArray(m.passkeys) ? m.passkeys.slice() : [];
        if (!list.some((p) => p.credentialId === credentialId)) list.push(passkey);
        return { ...m, passkeys: list };
      });
      await putBundle(synagogueId, {
        ...bundle,
        config: {
          ...bundle.config,
          members,
          updatedAt: new Date().toISOString(),
          revision: (bundle.config.revision || 0) + 1,
        },
        syncedAt: new Date().toISOString(),
      });
      sendJson(res, 200, { ok: true, member: publicMember(members.find((m) => m.id === memberId)) }, req);
      return true;
    }

    if (url.pathname === '/api/auth/webauthn/login/options' && req.method === 'POST') {
      const raw = await readBody(req);
      const body = JSON.parse(raw.toString('utf8') || '{}');
      const synagogueId = String(body.synagogueId || '').trim();
      const bundle = await getBundle(synagogueId);
      if (!bundle?.config) {
        sendJson(res, 404, { ok: false, error: 'בית כנסת לא נמצא' }, req);
        return true;
      }
      const { rpID, origin } = rpFromRequest(req);
      const allowCredentials = [];
      for (const m of bundle.config.members || []) {
        for (const p of m.passkeys || []) {
          allowCredentials.push({
            id: p.credentialId,
            transports: p.transports,
          });
        }
      }
      if (!allowCredentials.length) {
        sendJson(res, 400, { ok: false, error: 'לא הוגדר מפתח אימות לבית כנסת זה' }, req);
        return true;
      }
      const options = await generateAuthenticationOptions({
        rpID,
        allowCredentials,
        userVerification: 'preferred',
      });
      putChallenge(`login:${synagogueId}:${options.challenge}`, {
        kind: 'login',
        synagogueId,
        expect: { challenge: options.challenge, rpID, origin },
      });
      sendJson(res, 200, { ok: true, options }, req);
      return true;
    }

    if (url.pathname === '/api/auth/webauthn/login/verify' && req.method === 'POST') {
      const raw = await readBody(req);
      const body = JSON.parse(raw.toString('utf8') || '{}');
      const synagogueId = String(body.synagogueId || '').trim();
      const response = body.response;
      const optChallenge = String(body.expectedChallenge || '').trim();
      const challengeRow = optChallenge
        ? takeChallenge(`login:${synagogueId}:${optChallenge}`)
        : null;
      if (!challengeRow?.expect) {
        sendJson(res, 400, { ok: false, error: 'פג תוקף האתגר — נסו שוב' }, req);
        return true;
      }
      const bundle = await getBundle(synagogueId);
      if (!bundle?.config) {
        sendJson(res, 404, { ok: false, error: 'בית כנסת לא נמצא' }, req);
        return true;
      }
      const credId = String(response?.id || '');
      let member = null;
      let passkey = null;
      for (const m of bundle.config.members || []) {
        const hit = (m.passkeys || []).find((p) => p.credentialId === credId);
        if (hit) {
          member = m;
          passkey = hit;
          break;
        }
      }
      if (!member || !passkey) {
        sendJson(res, 404, { ok: false, error: 'מפתח אימות לא מזוהה' }, req);
        return true;
      }
      const verification = await verifyAuthenticationResponse({
        response,
        expectedChallenge: challengeRow.expect.challenge,
        expectedOrigin: challengeRow.expect.origin,
        expectedRPID: challengeRow.expect.rpID,
        credential: {
          id: passkey.credentialId,
          publicKey: Buffer.from(passkey.publicKey, 'base64url'),
          counter: passkey.counter || 0,
          transports: passkey.transports,
        },
      });
      if (!verification.verified) {
        sendJson(res, 400, { ok: false, error: 'אימות מפתח נכשל' }, req);
        return true;
      }
      const newCounter = verification.authenticationInfo.newCounter;
      const members = bundle.config.members.map((m) => {
        if (m.id !== member.id) return m;
        return {
          ...m,
          passkeys: (m.passkeys || []).map((p) =>
            p.credentialId === passkey.credentialId ? { ...p, counter: newCounter } : p,
          ),
        };
      });
      await putBundle(synagogueId, {
        ...bundle,
        config: {
          ...bundle.config,
          members,
          updatedAt: new Date().toISOString(),
          revision: (bundle.config.revision || 0) + 1,
        },
        syncedAt: new Date().toISOString(),
      });
      sendJson(res, 200, issueMemberToken(synagogueId, member), req);
      return true;
    }
  } catch (err) {
    console.error('altAuth', err);
    sendJson(res, 500, { ok: false, error: String(err?.message || err) }, req);
    return true;
  }

  return false;
}
