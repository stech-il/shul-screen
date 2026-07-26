import type { Member, Session } from '../types';
import {
  clearStored,
  createTimedFields,
  loadTimedJson,
  saveTimedJson,
  touchTimedJson,
} from './sessionStore';

/**
 * Salted SHA-256 password hashing (client-side).
 * Format: saltHex:hashHex
 * Prefer Supabase Auth / Argon2 server-side when cloud is connected.
 */

const PASSWORD_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';

function toHex(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function sha256(bytes: Uint8Array): Promise<string> {
  // Copy so WebCrypto always hashes the exact view (not a larger underlying buffer).
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  const buf = await crypto.subtle.digest('SHA-256', copy);
  return toHex(buf);
}

/** Exclusive admin username for a newly provisioned screen (ASCII, unique-ish). */
export function generateExclusiveAdminUsername(synagogueId: string, email?: string): string {
  const fromEmail = (email || '')
    .split('@')[0]
    ?.replace(/[^a-z0-9._-]/gi, '')
    .toLowerCase()
    .slice(0, 14);
  const fromId = synagogueId.replace(/[^a-z0-9]/gi, '').toLowerCase().slice(0, 10);
  const base = (fromEmail || fromId || 'admin').replace(/^[._-]+|[._-]+$/g, '') || 'admin';
  const bytes = crypto.getRandomValues(new Uint8Array(3));
  const suffix = [...bytes].map((b) => (b % 36).toString(36)).join('');
  return `${base}_${suffix}`;
}

/** Strong one-time admin password — shown once in email / agency UI. */
export function generateExclusiveAdminPassword(length = 12): string {
  const bytes = crypto.getRandomValues(new Uint8Array(Math.max(8, length)));
  return [...bytes].map((b) => PASSWORD_ALPHABET[b % PASSWORD_ALPHABET.length]).join('');
}

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const saltHex = toHex(salt);
  const payload = new TextEncoder().encode(`${saltHex}:${password}`);
  const hash = await sha256(payload);
  return `${saltHex}:${hash}`;
}

/** Verify salted hash, or legacy unsalted hex (migration) */
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  if (!stored) return false;
  if (stored.includes(':')) {
    const [saltHex, hash] = stored.split(':');
    if (!saltHex || !hash) return false;
    const payload = new TextEncoder().encode(`${saltHex}:${password}`);
    const next = await sha256(payload);
    return next === hash;
  }
  const legacy = await sha256(new TextEncoder().encode(password));
  return legacy === stored;
}

export const hashPin = hashPassword;
export const verifyPin = verifyPassword;

export function normalizeUsername(username: string): string {
  return username.trim().toLowerCase();
}

export function memberPasswordHash(member: Member): string {
  return member.passwordHash || member.pinHash || '';
}

export function memberUsername(member: Member): string {
  if (member.username?.trim()) return normalizeUsername(member.username);
  return normalizeUsername(member.name);
}

export async function authenticateMember(
  members: Member[],
  username: string,
  password: string,
): Promise<Member | null> {
  const u = normalizeUsername(username);
  const pass = password.trim();
  if (!u || !pass) return null;
  for (const member of members) {
    if (memberUsername(member) !== u) continue;
    const hash = memberPasswordHash(member);
    if (!hash) continue;
    if (await verifyPassword(pass, hash)) return member;
  }
  return null;
}

/** True when username exists but password does not match (for clearer login errors). */
export async function memberUsernameExists(
  members: Member[],
  username: string,
): Promise<boolean> {
  const u = normalizeUsername(username);
  if (!u) return false;
  return members.some((m) => memberUsername(m) === u);
}

const SESSION_KEY = 'shul-screen:session';

export function loadSession(): Session | null {
  const s = loadTimedJson<Session & { token: string; at: string; expiresAt: string; lastActiveAt: string }>(
    SESSION_KEY,
  );
  if (!s) return null;
  // Legacy sessions without timing fields are rejected by loadTimedJson;
  // keep a soft check for partially migrated shapes.
  if (!s.synagogueId || !s.memberId || !s.role) {
    clearStored(SESSION_KEY);
    return null;
  }
  return s;
}

export function saveSession(
  session: Omit<Session, 'token' | 'at' | 'expiresAt' | 'lastActiveAt'> & {
    remember?: boolean;
    viaPlatform?: boolean;
  },
): Session {
  const timed = createTimedFields(Boolean(session.remember));
  const next: Session = {
    synagogueId: session.synagogueId,
    memberId: session.memberId,
    memberName: session.memberName,
    role: session.role,
    viaPlatform: session.viaPlatform,
    ...timed,
  };
  saveTimedJson(SESSION_KEY, next as Session & typeof timed);
  return next;
}

/**
 * Platform super-admin enters a synagogue admin panel without that shul's password.
 */
export function enterAsPlatformAdmin(
  synagogueId: string,
  options?: { synagogueName?: string; platformUsername?: string },
): Session {
  return saveSession({
    synagogueId,
    memberId: 'platform',
    memberName: options?.platformUsername
      ? `מערכת (${options.platformUsername})`
      : 'מנהל מערכת',
    role: 'owner',
    remember: false,
    viaPlatform: true,
  });
}

export function touchSession(): Session | null {
  return touchTimedJson<Session & { token: string; at: string; expiresAt: string; lastActiveAt: string }>(
    SESSION_KEY,
  );
}

export function clearSession(): void {
  clearStored(SESSION_KEY);
}

export function canEditSettings(role: Session['role']): boolean {
  return role === 'owner' || role === 'agency';
}

export function canEditContent(role: Session['role']): boolean {
  return role === 'owner' || role === 'editor' || role === 'agency';
}
