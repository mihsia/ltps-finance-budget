/**
 * Captures each live chart DOM node in `refs` (a plain object of
 * {key: HTMLElement|null}, as Report.jsx assigns via a ref callback per
 * chart) into a PNG data URL, for embedding into the exported PDF (see
 * overviewExport.js's addChartImage, keyed the same way — e.g.
 * "finance.expenseTrend", "module.awards"). An entry with no element (the
 * chart isn't currently rendered — e.g. a module the user unchecked in
 * 選擇涵蓋模組, or a module with no data to chart) is skipped rather than
 * failing the whole export. scale: 2 keeps the embedded chart's text
 * legible once it's scaled down to fit the PDF page width.
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
    const canvas = await html2canvas(el, { backgroundColor: '#ffffff', scale: 2 });
    images[key] = { dataUrl: canvas.toDataURL('image/png'), width: canvas.width, height: canvas.height };
  }
  return images;
}
