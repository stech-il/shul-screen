/**
 * Temporary Homefront (oref) drill alerts — platform-admin testing only.
 * Stored in memory; auto-expire. Survives only while the Node process is up.
 */

/** @typedef {{ id: string, cat: string, title: string, data: string[], desc: string }} OrefAlert */
/** @typedef {{ synagogueId: string, alert: OrefAlert, expiresAt: number, createdAt: string }} OrefDrill */

/** @type {Map<string, OrefDrill>} */
const drills = new Map();

function prune() {
  const now = Date.now();
  for (const [id, d] of drills) {
    if (d.expiresAt <= now) drills.delete(id);
  }
}

/**
 * @param {string} synagogueId
 * @param {{ title?: string, areas?: string[], cat?: string, desc?: string, seconds?: number }} opts
 */
export function startDrill(synagogueId, opts = {}) {
  const id = String(synagogueId || '').trim();
  if (!id) throw new Error('חסר מזהה מסך');
  const seconds = Math.min(300, Math.max(10, Number(opts.seconds) || 60));
  const areas = Array.isArray(opts.areas) && opts.areas.length
    ? opts.areas.map(String).filter(Boolean)
    : ['בדיקת מערכת'];
  const drill = {
    synagogueId: id,
    createdAt: new Date().toISOString(),
    expiresAt: Date.now() + seconds * 1000,
    alert: {
      id: `drill-${Date.now()}`,
      cat: String(opts.cat || '1'),
      title: String(opts.title || 'ירי רקטות וטילים'),
      data: areas,
      desc: String(opts.desc || 'זוהי התראת בדיקה — לא אזעקה אמיתית'),
    },
  };
  drills.set(id, drill);
  return { ...drill, remainingSec: seconds };
}

/** @param {string} synagogueId */
export function stopDrill(synagogueId) {
  const id = String(synagogueId || '').trim();
  drills.delete(id);
  return { ok: true };
}

/** @param {string} synagogueId */
export function getDrill(synagogueId) {
  prune();
  const id = String(synagogueId || '').trim();
  const d = drills.get(id);
  if (!d) return null;
  return {
    ...d,
    remainingSec: Math.max(0, Math.ceil((d.expiresAt - Date.now()) / 1000)),
    isTest: true,
  };
}

export function listDrills() {
  prune();
  return [...drills.values()].map((d) => ({
    synagogueId: d.synagogueId,
    expiresAt: d.expiresAt,
    remainingSec: Math.max(0, Math.ceil((d.expiresAt - Date.now()) / 1000)),
    title: d.alert.title,
  }));
}

/**
 * @param {import('http').IncomingMessage} req
 * @param {import('http').ServerResponse} res
 * @param {URL} url
 */
export async function handleOrefDrill(req, res, url) {
  const sendJson = (status, obj) => {
    res.statusCode = status;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    res.end(JSON.stringify(obj));
  };

  if (req.method === 'OPTIONS') {
    sendJson(204, {});
    return true;
  }

  const path = url.pathname.replace(/\/$/, '') || '/';

  if (path === '/api/oref/drill' && req.method === 'GET') {
    sendJson(200, { drills: listDrills() });
    return true;
  }

  if (path === '/api/oref/drill' && req.method === 'POST') {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    let body = {};
    try {
      body = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
    } catch {
      sendJson(400, { error: 'JSON לא תקין' });
      return true;
    }
    try {
      const drill = startDrill(body.synagogueId, body);
      sendJson(200, { ok: true, drill });
    } catch (e) {
      sendJson(400, { error: String(e.message || e) });
    }
    return true;
  }

  const m = path.match(/^\/api\/oref\/drill\/([^/]+)$/);
  if (m) {
    const synagogueId = decodeURIComponent(m[1]);
    if (req.method === 'GET') {
      sendJson(200, { drill: getDrill(synagogueId) });
      return true;
    }
    if (req.method === 'DELETE') {
      sendJson(200, stopDrill(synagogueId));
      return true;
    }
  }

  return false;
}
