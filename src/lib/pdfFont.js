// jsPDF's built-in fonts (Helvetica/Times/Courier) only cover Latin
// characters — any 中文 rendered with them comes out as mojibake, since the
// glyph IDs jsPDF picks for those code points don't exist in the font. This
// registers a Chinese-capable subset font (see scripts/build-pdf-font.py)
// so PDF exports render correctly. Dynamically imported so the ~370KB base64
// payload only loads when a PDF export actually runs, not on every page load.
const FONT_NAME = 'NotoSansTC';

export async function registerCjkFont(doc) {
  const [{ default: regularBase64 }, { default: boldBase64 }] = await Promise.all([
    import('../assets/fonts/NotoSansTC-Regular-subset.js'),
    import('../assets/fonts/NotoSansTC-Bold-subset.js'),
  ]);
  doc.addFileToVFS('NotoSansTC-Regular.ttf', regularBase64);
  doc.addFont('NotoSansTC-Regular.ttf', FONT_NAME, 'normal');
  doc.addFileToVFS('NotoSansTC-Bold.ttf', boldBase64);
  doc.addFont('NotoSansTC-Bold.ttf', FONT_NAME, 'bold');
  doc.setFont(FONT_NAME, 'normal');
  return FONT_NAME;
}
