#!/usr/bin/env node
/**
 * One-time (re-runnable) generator for the PWA icon set under public/.
 *
 * The brand mark: a stylized ancient 方孔圓錢 (round coin, square hole) whose
 * central hole is cut into a fused "LZ" monogram (Lize) instead of a plain
 * square — coin and initials share one shape rather than sitting side by
 * side. Pure geometry (rects/circles/paths), no text glyphs, so it renders
 * identically on any machine/CI run with no font dependency.
 *
 * The coin's radius (190 of a 512 canvas) sits comfortably inside the
 * standard maskable safe zone (inner 80%-diameter circle, r≈205), so the
 * same artwork is used unmodified for the maskable icon — no separate
 * simplified variant needed this time.
 *
 * Usage: node scripts/generate-pwa-icons.mjs
 */
import { Resvg } from '@resvg/resvg-js';
import { writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(__dirname, '..');
const publicDir = path.join(repoRoot, 'public');

const TEAL = '#1F5F52';
const AMBER = '#C9832F';
const AMBER_DARK = '#8A5A1E';

function markSvg({ size, rounded }) {
  const bg = rounded
    ? `<rect width="${size}" height="${size}" rx="${size * 0.25}" fill="${TEAL}"/>`
    : `<rect width="${size}" height="${size}" fill="${TEAL}"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}">
    ${bg}
    <circle cx="${size / 2}" cy="${size / 2}" r="${size * 0.371}" fill="${AMBER}"/>
    <circle cx="${size / 2}" cy="${size / 2}" r="${size * 0.371}" fill="none" stroke="${AMBER_DARK}" stroke-width="${size * 0.0117}" opacity="0.55"/>
    <circle cx="${size / 2}" cy="${size / 2}" r="${size * 0.293}" fill="none" stroke="${AMBER_DARK}" stroke-width="${size * 0.0078}" opacity="0.35"/>
    <g fill="${TEAL}" transform="scale(${size / 512})">
      <!-- L -->
      <rect x="196" y="186" width="26" height="140"/>
      <rect x="196" y="300" width="60" height="26"/>
      <!-- Z -->
      <rect x="274" y="186" width="60" height="26"/>
      <rect x="274" y="300" width="60" height="26"/>
      <path d="M 334 212 L 296 300 L 274 300 L 312 212 Z"/>
    </g>
  </svg>`;
}

function rasterize(svg) {
  return new Resvg(svg, { font: { loadSystemFonts: false } }).render().asPng();
}

async function main() {
  await mkdir(publicDir, { recursive: true });

  // any-purpose + maskable icons: edge-to-edge square fill (no pre-rounded
  // corners) — OS launchers apply their own corner/shape mask, and the coin
  // sits well within the maskable safe zone regardless of that mask's shape.
  await writeFile(path.join(publicDir, 'pwa-512.png'), rasterize(markSvg({ size: 512, rounded: false })));
  await writeFile(path.join(publicDir, 'pwa-192.png'), rasterize(markSvg({ size: 192, rounded: false })));
  await writeFile(path.join(publicDir, 'maskable-icon-512.png'), rasterize(markSvg({ size: 512, rounded: false })));

  // apple-touch-icon: iOS ignores alpha and shows black where transparent,
  // so this must be fully opaque (it is — no alpha anywhere in the artwork).
  await writeFile(path.join(publicDir, 'apple-touch-icon.png'), rasterize(markSvg({ size: 180, rounded: false })));

  // Raw source SVG: rendered directly by the browser (no OS mask), so it
  // keeps its own rounded-square treatment. Used both as the favicon and as
  // a re-runnable source-of-truth if the brand mark changes.
  const sourceSvg = markSvg({ size: 512, rounded: true });
  await writeFile(path.join(publicDir, 'favicon.svg'), sourceSvg);
  await writeFile(path.join(publicDir, 'icon-source.svg'), sourceSvg);

  console.log('PWA icons written to public/:');
  console.log('  pwa-192.png, pwa-512.png, maskable-icon-512.png, apple-touch-icon.png, favicon.svg, icon-source.svg');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
