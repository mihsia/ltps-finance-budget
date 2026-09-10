#!/usr/bin/env node
/**
 * One-time (re-runnable) generator for the PWA icon set under public/.
 *
 * Reproduces the app's existing brand mark (see the small logo box in
 * src/components/Header.jsx / src/pages/Login.jsx: a #1F5F52 square with a
 * white "利" glyph) at the sizes/purposes a web app manifest needs. Renders
 * deterministically from an inline SVG + the project's own bundled
 * @fontsource/noto-sans-tc font bytes (rather than an OS-installed font or
 * AI image generation), so the output is identical on every machine/CI run
 * and always matches the real brand color/glyph exactly.
 *
 * Usage: node scripts/generate-pwa-icons.mjs
 */
import { Resvg } from '@resvg/resvg-js';
import { writeFile, readFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(__dirname, '..');
const publicDir = path.join(repoRoot, 'public');

const TEAL = '#1F5F52';
const WHITE = '#FFFFFF';

// The 118-subset woff is the specific @fontsource/noto-sans-tc chunk whose
// unicode-range covers U+5229 (利) — verified against node_modules/@fontsource/noto-sans-tc/900.css.
// Weight 900 (Black) is used for maximum legibility at small icon sizes.
const FONT_PATH = path.join(
  repoRoot,
  'node_modules/@fontsource/noto-sans-tc/files/noto-sans-tc-118-900-normal.woff',
);

function markSvg({ size, glyphRatio, rounded }) {
  const fontSize = Math.round(size * glyphRatio);
  const rect = rounded
    ? `<rect width="${size}" height="${size}" rx="${size * 0.25}" fill="${TEAL}"/>`
    : `<rect width="${size}" height="${size}" fill="${TEAL}"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}">${rect}<text x="${size / 2}" y="${size / 2}" font-family="Noto Sans TC" font-weight="900" font-size="${fontSize}" fill="${WHITE}" text-anchor="middle" dominant-baseline="central">利</text></svg>`;
}

// Renders each icon at its own native size (rather than rendering once at
// 512 and downscaling via resvg's `fitTo`) so every PNG's pixel dimensions
// match its filename exactly, and font hinting/glyph placement is computed
// for the actual target resolution instead of being resampled.
async function rasterize(svg, fontBuffer) {
  const resvg = new Resvg(svg, {
    font: { fontBuffers: [fontBuffer], loadSystemFonts: false, defaultFontFamily: 'Noto Sans TC' },
  });
  return resvg.render().asPng();
}

async function main() {
  await mkdir(publicDir, { recursive: true });
  const fontBuffer = await readFile(FONT_PATH);

  // any-purpose icons: glyph at ~62% of canvas height, edge-to-edge square —
  // OS launchers apply their own corner rounding/mask, so we don't pre-round.
  // Each is rendered at its own native size (see rasterize()'s comment).
  await writeFile(path.join(publicDir, 'pwa-512.png'), await rasterize(markSvg({ size: 512, glyphRatio: 0.625, rounded: false }), fontBuffer));
  await writeFile(path.join(publicDir, 'pwa-192.png'), await rasterize(markSvg({ size: 192, glyphRatio: 0.625, rounded: false }), fontBuffer));

  // maskable icon: glyph shrunk to ~40% of canvas height so it stays inside
  // the standard maskable safe zone (inner 80%-diameter circle) regardless
  // of which shape (circle/squircle/teardrop) the OS masks it to.
  const maskableSvg = markSvg({ size: 512, glyphRatio: 0.4, rounded: false });
  await writeFile(path.join(publicDir, 'maskable-icon-512.png'), await rasterize(maskableSvg, fontBuffer));

  // apple-touch-icon: iOS ignores alpha and shows black where it's
  // transparent, so this must be fully opaque (it is — no alpha in the SVG).
  // iOS also applies its own corner rounding, same reasoning as above.
  const appleSvg = markSvg({ size: 180, glyphRatio: 0.625, rounded: false });
  await writeFile(path.join(publicDir, 'apple-touch-icon.png'), await rasterize(appleSvg, fontBuffer));

  // Raw source SVG, kept both as the browser-tab favicon and as a
  // re-runnable source-of-truth if the brand mark ever changes.
  const sourceSvg = markSvg({ size: 512, glyphRatio: 0.625, rounded: true });
  await writeFile(path.join(publicDir, 'favicon.svg'), sourceSvg);
  await writeFile(path.join(publicDir, 'icon-source.svg'), sourceSvg);

  console.log('PWA icons written to public/:');
  console.log('  pwa-192.png, pwa-512.png, maskable-icon-512.png, apple-touch-icon.png, favicon.svg, icon-source.svg');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
