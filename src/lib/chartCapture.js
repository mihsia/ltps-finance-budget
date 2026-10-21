// html2canvas's own `scale` option (not the browser's devicePixelRatio) —
// renders at 1.5x CSS pixel density, enough for crisp print output once
// overviewExport.js displays the image at (close to) its natural CSS size
// rather than stretching it, without needlessly bloating the PDF's file
// size the way the initial 2x capture did.
const CAPTURE_SCALE = 1.5;

/**
 * Captures each live chart DOM node in `refs` (a plain object of
 * {key: HTMLElement|null}, as Report.jsx assigns via a ref callback per
 * chart) into a PNG data URL, for embedding into the exported PDF (see
 * overviewExport.js's addChartImage, keyed the same way — e.g.
 * "finance.expenseTrend", "module.awards"). An entry with no element (the
 * chart isn't currently rendered — e.g. a module the user unchecked in
 * 選擇涵蓋模組, or a module with no data to chart) is skipped rather than
 * failing the whole export.
 *
 * width/height are the element's own CSS pixel size (offsetWidth/
 * offsetHeight), not the captured canvas's pixel size — overviewExport.js
 * converts these straight to PDF millimetres so a chart lands in the PDF at
 * roughly the size it had on screen (a small 2-bar chart stays small)
 * instead of always being stretched to a fixed width; the canvas's own
 * (CAPTURE_SCALE×) pixel size is only an internal rendering-resolution
 * detail the caller doesn't need.
 *
 * html2canvas is loaded via a dynamic import rather than a static one so it
 * lands in its own code-split chunk instead of the main app bundle — it's
 * only needed on the "匯出/預覽 PDF" path, and statically importing it here
 * pushed the main bundle past the PWA service worker's default 2 MiB
 * precache limit, breaking every build.
 */
export async function captureChartImages(refs) {
  const entries = Object.entries(refs).filter(([, el]) => el);
  if (entries.length === 0) return {};
  const { default: html2canvas } = await import('html2canvas');
  const images = {};
  for (const [key, el] of entries) {
    const canvas = await html2canvas(el, { backgroundColor: '#ffffff', scale: CAPTURE_SCALE });
    images[key] = { dataUrl: canvas.toDataURL('image/png'), width: el.offsetWidth, height: el.offsetHeight };
  }
  return images;
}
