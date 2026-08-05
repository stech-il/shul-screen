/**
 * Expose the deployed app version + changelog so screens can auto-pull updates.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { sendJson } from './apiAuth.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

function readJson(filePath, fallback) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return fallback;
  }
}

export function getAppVersionPayload() {
  const pkg = readJson(path.join(ROOT, 'package.json'), {});
  const historyFile = readJson(path.join(ROOT, 'version-history.json'), { versions: [] });
  const version = String(pkg.version || '0.0.0');
  const history = Array.isArray(historyFile.versions) ? historyFile.versions : [];
  return {
    version,
    at: new Date().toISOString(),
    history,
  };
}

/** GET /api/app-version */
export async function handleAppVersion(req, res, url) {
  if (url.pathname !== '/api/app-version') return false;
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    sendJson(res, 405, { error: 'method not allowed' }, req);
    return true;
  }
  sendJson(res, 200, getAppVersionPayload(), req);
  return true;
}
