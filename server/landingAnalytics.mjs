/**
 * Landing-page visit counters for the agency dashboard.
 * POST /api/analytics/landing  — record one visit (session-deduped client-side)
 * GET  /api/analytics/landing  — totals + today / 7d / 30d
 */
import { getRecord, putRecord } from './cloudStore.mjs';

const PREFIX = 'analytics';
const ID = 'landing';
const KEEP_DAYS = 120;

function nowIso() {
  return new Date().toISOString();
}

/** Calendar day in Asia/Jerusalem → YYYY-MM-DD */
function dayKey(d = new Date()) {
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Jerusalem',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(d);
  } catch {
    return d.toISOString().slice(0, 10);
  }
}

function jerusalemDateOffset(daysBack) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jerusalem',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const get = (t) => Number(parts.find((p) => p.type === t)?.value || 0);
  const d = new Date(Date.UTC(get('year'), get('month') - 1, get('day')));
  d.setUTCDate(d.getUTCDate() - daysBack);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function emptyStore() {
  return {
    total: 0,
    byDay: {},
    signupsTotal: 0,
    updatedAt: null,
  };
}

async function loadStore() {
  const rec = await getRecord(PREFIX, ID);
  if (!rec || typeof rec !== 'object') return emptyStore();
  return {
    total: Math.max(0, Number(rec.total) || 0),
    byDay: rec.byDay && typeof rec.byDay === 'object' ? { ...rec.byDay } : {},
    signupsTotal: Math.max(0, Number(rec.signupsTotal) || 0),
    updatedAt: rec.updatedAt || null,
  };
}

function pruneDays(byDay) {
  const cutoff = jerusalemDateOffset(KEEP_DAYS);
  const next = {};
  for (const [k, v] of Object.entries(byDay)) {
    if (k >= cutoff) next[k] = Math.max(0, Number(v) || 0);
  }
  return next;
}

function sumRange(byDay, days) {
  let sum = 0;
  for (let i = 0; i < days; i += 1) {
    const k = jerusalemDateOffset(i);
    sum += Math.max(0, Number(byDay[k]) || 0);
  }
  return sum;
}

function publicStats(store) {
  const byDay = store.byDay || {};
  const today = dayKey();
  return {
    ok: true,
    total: store.total,
    today: Math.max(0, Number(byDay[today]) || 0),
    last7Days: sumRange(byDay, 7),
    last30Days: sumRange(byDay, 30),
    signupsTotal: store.signupsTotal,
    updatedAt: store.updatedAt,
  };
}

export async function recordLandingVisit() {
  const store = await loadStore();
  const today = dayKey();
  store.byDay = pruneDays(store.byDay);
  store.byDay[today] = Math.max(0, Number(store.byDay[today]) || 0) + 1;
  store.total += 1;
  store.updatedAt = nowIso();
  await putRecord(PREFIX, ID, store);
  return publicStats(store);
}

export async function recordLandingSignup() {
  const store = await loadStore();
  store.signupsTotal = Math.max(0, Number(store.signupsTotal) || 0) + 1;
  store.updatedAt = nowIso();
  await putRecord(PREFIX, ID, store);
  return publicStats(store);
}

export async function getLandingStats() {
  const store = await loadStore();
  return publicStats(store);
}

function sendJson(res, status, obj) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  });
  if (status === 204) {
    res.end();
    return;
  }
  res.end(JSON.stringify(obj));
}

export async function handleLandingAnalytics(req, res, url) {
  if (req.method === 'OPTIONS') {
    sendJson(res, 204, {});
    return true;
  }

  try {
    if (url.pathname === '/api/analytics/landing' && req.method === 'GET') {
      sendJson(res, 200, await getLandingStats());
      return true;
    }
    if (url.pathname === '/api/analytics/landing' && req.method === 'POST') {
      sendJson(res, 200, await recordLandingVisit());
      return true;
    }
    sendJson(res, 404, { error: 'not found' });
    return true;
  } catch (err) {
    console.error('landing analytics', err);
    sendJson(res, 500, { error: String(err?.message || err) });
    return true;
  }
}
