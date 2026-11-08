/**
 * Generate Android launcher icons (+ optional Electron PNG) from screensmart mark.
 * Usage: node scripts/generate-app-icons.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC =
  [path.join(ROOT, 'public', 'screensmart-mark.png'), path.join(ROOT, 'build', 'icon.png')].find(
    (p) => fs.existsSync(p),
  ) ?? null;

if (!SRC) {
  console.error('Missing public/screensmart-mark.png');
  process.exit(1);
}

/** Brand background behind adaptive icon */
const BG = { r: 15, g: 28, b: 34, alpha: 1 }; // #0f1c22

const DENSITIES = [
  { dir: 'mipmap-mdpi', legacy: 48, fg: 108 },
  { dir: 'mipmap-hdpi', legacy: 72, fg: 162 },
  { dir: 'mipmap-xhdpi', legacy: 96, fg: 216 },
  { dir: 'mipmap-xxhdpi', legacy: 144, fg: 324 },
  { dir: 'mipmap-xxxhdpi', legacy: 192, fg: 432 },
];

async function makeSquareIcon(size, { round = false, padRatio = 0.12 } = {}) {
  const pad = Math.round(size * padRatio);
  const inner = Math.max(1, size - pad * 2);
  const logo = await sharp(SRC)
    .resize(inner, inner, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();

  const square = await sharp({
    create: {
      width: size,
      height: size,
      channels: 4,
      background: BG,
    },
  })
    .composite([{ input: logo, gravity: 'centre' }])
    .png()
    .toBuffer();

  if (!round) return square;

  const r = Math.round(size / 2);
  const mask = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">
      <circle cx="${r}" cy="${r}" r="${r}" fill="#fff"/>
    </svg>`,
  );
  return sharp(square)
    .composite([{ input: await sharp(mask).png().toBuffer(), blend: 'dest-in' }])
    .png()
    .toBuffer();
}

async function makeForeground(size) {
  // Adaptive safe zone — keep mark inset so circular/squircle masks don't clip it.
  const pad = Math.round(size * 0.18);
  const inner = Math.max(1, size - pad * 2);
  const logo = await sharp(SRC)
    .resize(inner, inner, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();
  return sharp({
    create: {
      width: size,
      height: size,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite([{ input: logo, gravity: 'centre' }])
    .png()
    .toBuffer();
}

const resRoot = path.join(ROOT, 'android', 'app', 'src', 'main', 'res');

for (const d of DENSITIES) {
  const outDir = path.join(resRoot, d.dir);
  fs.mkdirSync(outDir, { recursive: true });

  const legacy = await makeSquareIcon(d.legacy, { padRatio: 0.1 });
  const round = await makeSquareIcon(d.legacy, { round: true, padRatio: 0.1 });
  const fg = await makeForeground(d.fg);

  await fs.promises.writeFile(path.join(outDir, 'ic_launcher.png'), legacy);
  await fs.promises.writeFile(path.join(outDir, 'ic_launcher_round.png'), round);
  await fs.promises.writeFile(path.join(outDir, 'ic_launcher_foreground.png'), fg);
  console.log(`${d.dir}: ${d.legacy} / fg ${d.fg}`);
}

const bgXml = `<?xml version="1.0" encoding="utf-8"?>
<resources>
    <color name="ic_launcher_background">#0F1C22</color>
</resources>
`;
await fs.promises.writeFile(path.join(resRoot, 'values', 'ic_launcher_background.xml'), bgXml);

// Keep Electron / builder icon in sync
const electronIcon = await makeSquareIcon(512, { padRatio: 0.08 });
await fs.promises.writeFile(path.join(ROOT, 'build', 'icon.png'), electronIcon);
await fs.promises.writeFile(path.join(ROOT, 'electron', 'screensmart-logo.png'), electronIcon);
console.log('Updated build/icon.png and electron/screensmart-logo.png');
console.log('Done.');
