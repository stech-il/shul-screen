/**
 * Copy latest Windows installer + Android APK into downloads/ for the admin panel.
 * Usage: node scripts/publish-downloads.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const RELEASE = path.join(ROOT, 'release');
const OUT = path.join(ROOT, 'downloads');
const PKG = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));

function latest(dir, re) {
  if (!fs.existsSync(dir)) return null;
  const hits = fs
    .readdirSync(dir)
    .filter((n) => re.test(n))
    .map((n) => {
      const full = path.join(dir, n);
      return { name: n, full, mtime: fs.statSync(full).mtimeMs };
    })
    .sort((a, b) => b.mtime - a.mtime);
  return hits[0] ?? null;
}

fs.mkdirSync(OUT, { recursive: true });

const win = latest(RELEASE, /^screensmart-Setup-.*\.exe$/i);
const apk =
  latest(RELEASE, /screensmart.*\.apk$/i) ||
  latest(path.join(ROOT, 'android/app/build/outputs/apk/kiosk/debug'), /\.apk$/i);

const prev = (() => {
  try {
    return JSON.parse(fs.readFileSync(path.join(OUT, 'manifest.json'), 'utf8'));
  } catch {
    return {};
  }
})();

const RELEASE_TAG = process.env.DOWNLOADS_RELEASE_TAG || `v${PKG.version}-apps`;
const RELEASE_BASE = `https://github.com/stech-il/shul-screen/releases/download/${RELEASE_TAG}`;

const manifest = {
  version: PKG.version,
  updatedAt: new Date().toISOString(),
  windows: prev.windows ?? null,
  android: prev.android ?? null,
};

if (win) {
  const destName = 'screensmart-Setup.exe';
  fs.copyFileSync(win.full, path.join(OUT, destName));
  manifest.windows = {
    file: destName,
    version: PKG.version,
    source: win.name,
    url: prev.windows?.url || `${RELEASE_BASE}/${destName}`,
  };
  console.log(`Windows → downloads/${destName} (from ${win.name})`);
} else {
  console.warn('No Windows installer found in release/');
}

if (apk) {
  const destName = 'screensmart-kiosk.apk';
  fs.copyFileSync(apk.full, path.join(OUT, destName));
  manifest.android = {
    file: destName,
    version: PKG.version,
    source: apk.name,
    url: prev.android?.url || `${RELEASE_BASE}/${destName}`,
  };
  console.log(`Android → downloads/${destName} (from ${apk.name})`);
} else {
  console.warn('No Android APK found');
}

fs.writeFileSync(path.join(OUT, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
console.log('Wrote downloads/manifest.json');
