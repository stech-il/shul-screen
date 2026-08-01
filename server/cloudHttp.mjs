/**
 * Shared /api/cloud HTTP handler (production + Vite middleware).
 */
import {
  changeSynagogueId,
  getBundle,
  getDesignTemplates,
  getMediaFile,
  listBundles,
  listHeartbeats,
  purgeSynagogueData,
  putBundle,
  putDesignTemplates,
  putHeartbeat,
  putMediaFile,
  getMediaUsage,
  statusPayload,
} from './cloudStore.mjs';
import { handleBackups } from './backups.mjs';
import { handleDiskFiles } from './diskFiles.mjs';
import {
  allowedCorsOrigin,
  checkRateLimit,
  clientIp,
  maxMediaBody,
  readBodyLimited,
  requirePlatform,
  requireSynagogueAccess,
  resolveAuth,
  sendJson,
  stripSecretsFromBundle,
  stripSecretsFromConfig,
  canAccessSynagogue,
} from './apiAuth.mjs';

function send(res, status, body, headers = {}) {
  res.writeHead(status, headers);
  res.end(body);
}

async function readBody(req, maxBytes) {
  return readBodyLimited(req, maxBytes);
}

export async function handleCloud(req, res, url) {
  if (req.method === 'OPTIONS') {
    sendJson(res, 204, {}, req);
    return;
  }

  const ip = clientIp(req);
  const rl = checkRateLimit(`cloud:${ip}`, 300, 60 * 1000);
  if (!rl.ok) {
    sendJson(res, 429, { error: 'rate limit' }, req);
    return;
  }

  if (url.pathname === '/api/cloud/status') {
    const st = statusPayload();
    // Don't leak absolute host paths to anonymous clients
    sendJson(
      res,
      200,
      {
        backend: st.backend,
        persistent: st.persistent,
        configured: st.configured,
      },
      req,
    );
    return;
  }

  if (url.pathname === '/api/cloud/synagogues' && req.method === 'GET') {
    if (!requirePlatform(req, res)) return;
    try {
      const bundles = await listBundles();
      sendJson(
        res,
        200,
        {
          items: bundles.map((b) => ({
            id: b.config.id,
            name: b.config.name,
            updatedAt: b.config.updatedAt,
            revision: b.config.revision,
            config: stripSecretsFromConfig(b.config),
            syncedAt: b.syncedAt,
          })),
        },
        req,
      );
    } catch (err) {
      sendJson(res, 500, { error: String(err.message || err) }, req);
    }
    return;
  }

  // POST /api/cloud/synagogues/:id/change-id  { newId: "12" }
  const changeIdMatch = url.pathname.match(/^\/api\/cloud\/synagogues\/([^/]+)\/change-id$/);
  if (changeIdMatch && req.method === 'POST') {
    if (!requirePlatform(req, res)) return;
    try {
      const oldId = decodeURIComponent(changeIdMatch[1] || '').trim();
      const raw = await readBody(req);
      const body = JSON.parse(raw.toString('utf8') || '{}');
      const newId = String(body.newId || '').trim();
      const result = await changeSynagogueId(oldId, newId);
      sendJson(res, 200, result, req);
    } catch (err) {
      sendJson(res, 400, { error: String(err?.message || err) }, req);
    }
    return;
  }

  // Backup API (before synagogue match — different path shape)
  // Disk file browser (Agency settings)
  if (url.pathname.startsWith('/api/cloud/disk')) {
    if (!requirePlatform(req, res)) return;
    await handleDiskFiles(req, res, url);
    return;
  }

  if (url.pathname.startsWith('/api/cloud/backups/')) {
    if (!requirePlatform(req, res)) return;
    await handleBackups(req, res, url);
    return;
  }

  // Saved design templates — per-synagogue lists
  const templatesMatch = url.pathname.match(/^\/api\/cloud\/templates(?:\/([^/]+))?$/);
  if (templatesMatch && (req.method === 'GET' || req.method === 'PUT')) {
    try {
      const synagogueId = decodeURIComponent(templatesMatch[1] || '').trim();
      if (!synagogueId) {
        sendJson(res, 400, { error: 'חסר מזהה בית כנסת' }, req);
        return;
      }
      if (req.method === 'PUT' && !requireSynagogueAccess(req, res, synagogueId)) return;
      if (req.method === 'GET') {
        sendJson(res, 200, { items: await getDesignTemplates(synagogueId), synagogueId }, req);
        return;
      }
      const raw = await readBody(req);
      const body = JSON.parse(raw.toString('utf8') || '{}');
      const items = await putDesignTemplates(
        synagogueId,
        Array.isArray(body.items) ? body.items : [],
      );
      sendJson(res, 200, { ok: true, count: items.length, synagogueId }, req);
    } catch (err) {
      sendJson(res, 500, { error: String(err?.message || err) }, req);
    }
    return;
  }

  if (url.pathname.startsWith('/api/cloud/heartbeats') && req.method === 'GET') {
    if (!requirePlatform(req, res)) return;
    try {
      sendJson(res, 200, { items: await listHeartbeats() }, req);
    } catch (err) {
      sendJson(res, 500, { error: String(err?.message || err) }, req);
    }
    return;
  }
  if (url.pathname === '/api/cloud/heartbeats' && req.method === 'POST') {
    try {
      const raw = await readBody(req);
      const body = JSON.parse(raw.toString('utf8') || '{}');
      const saved = await putHeartbeat(body);
      sendJson(res, 200, { ok: true, heartbeat: saved }, req);
    } catch (err) {
      sendJson(res, 500, { error: String(err?.message || err) }, req);
    }
    return;
  }

  // GET /api/cloud/media/:synagogueId/usage
  const mediaUsage = url.pathname.match(/^\/api\/cloud\/media\/([^/]+)\/usage$/);
  if (mediaUsage && req.method === 'GET') {
    try {
      const synagogueId = decodeURIComponent(mediaUsage[1]);
      if (!requireSynagogueAccess(req, res, synagogueId)) return;
      sendJson(res, 200, { ok: true, ...getMediaUsage(synagogueId) }, req);
    } catch (err) {
      sendJson(res, 500, { error: String(err?.message || err) }, req);
    }
    return;
  }

  // POST /api/cloud/media/:synagogueId  { fileName, contentType, dataBase64 }
  const mediaPost = url.pathname.match(/^\/api\/cloud\/media\/([^/]+)$/);
  if (mediaPost && req.method === 'POST') {
    try {
      const synagogueId = decodeURIComponent(mediaPost[1]);
      if (!requireSynagogueAccess(req, res, synagogueId)) return;
      const raw = await readBody(req, maxMediaBody());
      const body = JSON.parse(raw.toString('utf8') || '{}');
      const fileName = String(body.fileName || `file-${Date.now()}.bin`);
      const contentType = String(body.contentType || 'application/octet-stream');
      const dataBase64 = String(body.dataBase64 || '');
      if (!dataBase64) {
        sendJson(res, 400, { error: 'missing dataBase64' }, req);
        return;
      }
      if (/\.svg$/i.test(fileName) || /image\/svg/i.test(contentType)) {
        sendJson(res, 400, { error: 'SVG uploads are not allowed' }, req);
        return;
      }
      const buffer = Buffer.from(dataBase64, 'base64');
      const saved = await putMediaFile(synagogueId, fileName, buffer, contentType);
      sendJson(
        res,
        200,
        {
          ok: true,
          url: saved.url,
          fileName: saved.fileName,
          bytes: saved.bytes,
          usedBytes: saved.usedBytes,
          limitBytes: saved.limitBytes,
        },
        req,
      );
    } catch (err) {
      const msg = String(err?.message || err);
      const quota = msg.includes('מכסת האחסון') || err?.statusCode === 413;
      sendJson(res, quota ? 413 : 500, { error: msg }, req);
    }
    return;
  }

  // GET /api/cloud/media/:synagogueId/:fileName — public read for display assets
  const mediaGet = url.pathname.match(/^\/api\/cloud\/media\/([^/]+)\/([^/]+)$/);
  if (mediaGet && req.method === 'GET') {
    try {
      const synagogueId = decodeURIComponent(mediaGet[1]);
      const fileName = decodeURIComponent(mediaGet[2]);
      if (/\.svg$/i.test(fileName)) {
        sendJson(res, 404, { error: 'media not found' }, req);
        return;
      }
      const file = await getMediaFile(synagogueId, fileName);
      if (!file) {
        sendJson(res, 404, { error: 'media not found' }, req);
        return;
      }
      send(res, 200, file.buffer, {
        'Content-Type': file.contentType || 'application/octet-stream',
        'Cache-Control': 'public, max-age=86400',
        'X-Content-Type-Options': 'nosniff',
        'Access-Control-Allow-Origin': allowedCorsOrigin?.(req) || '*',
      });
    } catch (err) {
      sendJson(res, 500, { error: String(err?.message || err) }, req);
    }
    return;
  }

  const match = url.pathname.match(/^\/api\/cloud\/synagogues\/([^/]+)$/);
  if (!match) {
    sendJson(res, 404, { error: 'not found' }, req);
    return;
  }
  const id = decodeURIComponent(match[1]);

  try {
    if (req.method === 'GET') {
      const bundle = await getBundle(id);
      if (!bundle) {
        sendJson(res, 404, { error: 'not found' }, req);
        return;
      }
      const auth = resolveAuth(req);
      const full = canAccessSynagogue(auth, id);
      sendJson(res, 200, full ? bundle : stripSecretsFromBundle(bundle), req);
      return;
    }

    if (req.method === 'PUT') {
      if (!requireSynagogueAccess(req, res, id)) return;
      const raw = await readBody(req);
      const body = JSON.parse(raw.toString('utf8') || '{}');
      const config = body.config || body;
      if (!config?.id) {
        sendJson(res, 400, { error: 'missing config.id' }, req);
        return;
      }
      if (config.id !== id) {
        sendJson(res, 400, { error: 'id mismatch' }, req);
        return;
      }
      const existing = await getBundle(id);
      if (existing?.config?.license && !config.license) {
        config.license = existing.config.license;
      } else if (
        existing?.config?.license &&
        config.license &&
        existing.config.license.expiresAt &&
        (!config.license.expiresAt ||
          Date.parse(config.license.expiresAt) < Date.parse(existing.config.license.expiresAt))
      ) {
        if (!config.license.locked) {
          config.license = {
            ...existing.config.license,
            ...config.license,
            expiresAt: existing.config.license.expiresAt,
            activatedAt: existing.config.license.activatedAt || config.license.activatedAt,
          };
        }
      }
      // Editors must not wipe password hashes if client has stripped members
      if (existing?.config?.members?.length && Array.isArray(config.members)) {
        const prevById = new Map(existing.config.members.map((m) => [m.id, m]));
        config.members = config.members.map((m) => {
          const prev = prevById.get(m.id);
          if (!prev) return m;
          return {
            ...prev,
            ...m,
            passwordHash: m.passwordHash || prev.passwordHash,
            pinHash: m.pinHash || prev.pinHash,
            passkeys: m.passkeys || prev.passkeys,
            googleSub: m.googleSub || prev.googleSub,
          };
        });
      }
      const bundle = {
        config,
        syncedAt: new Date().toISOString(),
        weather: body.weather,
        pendingSync: false,
      };
      await putBundle(id, bundle);
      sendJson(
        res,
        200,
        { ok: true, backend: statusPayload().backend, syncedAt: bundle.syncedAt },
        req,
      );
      return;
    }

    if (req.method === 'DELETE') {
      if (!requirePlatform(req, res)) return;
      const summary = await purgeSynagogueData(id);
      sendJson(res, 200, { ok: true, purged: summary }, req);
      return;
    }

    sendJson(res, 405, { error: 'method not allowed' }, req);
  } catch (err) {
    console.error('cloud api', err);
    sendJson(res, 500, { error: String(err.message || err) }, req);
  }
}
