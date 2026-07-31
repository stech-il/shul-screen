/**
 * Public, privacy-safe directory of connected synagogues for the landing page.
 * Returns only id / name / logoUrl — never passwords, emails, or full config.
 */
import { listBundles } from './cloudStore.mjs';

function isLicenseValid(info) {
  if (!info) return false;
  if (info.locked) return false;
  if (!info.expiresAt) return true;
  return Date.parse(info.expiresAt) > Date.now();
}

function resolvePublicLogoUrl(config) {
  const raw =
    config?.media?.logoDataUrl ||
    config?.design?.logoUrl ||
    config?.branding?.logoUrl ||
    '';
  if (typeof raw !== 'string' || !raw.trim()) return '';
  const url = raw.trim();
  if (url.startsWith('https://') || url.startsWith('http://')) return url;
  if (url.startsWith('/api/cloud/media/')) return url;
  // Allow small data-URLs so logos still show when not yet on media CDN
  if (url.startsWith('data:image/') && url.length <= 120_000) return url;
  return '';
}

export async function listPublicSynagogues() {
  const bundles = await listBundles();
  const items = [];
  for (const b of bundles) {
    const config = b?.config;
    if (!config?.id) continue;
    if (!isLicenseValid(config.license)) continue;
    const name = String(config.name || '').trim() || String(config.id);
    items.push({
      id: String(config.id),
      name,
      logoUrl: resolvePublicLogoUrl(config),
    });
  }
  items.sort((a, b) => a.name.localeCompare(b.name, 'he'));
  return items;
}

function sendJson(res, status, obj) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'public, max-age=60',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  });
  res.end(JSON.stringify(obj));
}

export async function handlePublicDirectory(req, res, url) {
  if (req.method === 'OPTIONS') {
    sendJson(res, 204, {});
    return true;
  }
  if (url.pathname === '/api/public/synagogues' && req.method === 'GET') {
    try {
      const items = await listPublicSynagogues();
      sendJson(res, 200, { items });
    } catch (err) {
      sendJson(res, 500, { error: String(err?.message || err) });
    }
    return true;
  }
  return false;
}
