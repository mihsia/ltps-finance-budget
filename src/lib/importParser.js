import JSZip from 'jszip';

// Known budget-book labels we look for in the extracted text, and the
// module/field each maps to once imported.
const FIELD_PATTERNS = [
  { label: '歲入合計', target: '歲入歲出模組（歲入）', re: /歲入合計[^\d]{0,20}([\d,]+)/ },
  { label: '歲出合計', target: '歲入歲出模組（歲出）', re: /歲出合計[^\d]{0,20}([\d,]+)/ },
  { label: '國民教育計畫', target: '預算書表模組', re: /國民教育計畫[^\d]{0,30}([\d,]+)/ },
  { label: '一般行政管理計畫', target: '預算書表模組', re: /一般行政管理計畫[^\d]{0,30}([\d,]+)/ },
  { label: '建築及設備計畫', target: '預算書表模組', re: /建築及設備計畫[^\d]{0,30}([\d,]+)/ },
];

/** Extracts the plain text runs (<w:t>...</w:t>) from a .docx file's document.xml. */
async function extractDocxText(file) {
  const zip = await JSZip.loadAsync(file);
  const xml = await zip.file('word/document.xml').async('string');
  const runs = [...xml.matchAll(/<w:t[^>]*>([^<]*)<\/w:t>/g)].map((m) => m[1]);
  return runs.join('');
}

/** Extracts plain text from a .pdf file using pdf.js (loaded lazily; no reliable OCR layer assumed). */
async function extractPdfText(file) {
  const pdfjsLib = await import('pdfjs-dist/build/pdf.mjs');
  pdfjsLib.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.mjs', import.meta.url).href;
  const buf = await file.arrayBuffer();
  const doc = await pdfjsLib.getDocument({ data: buf }).promise;
  let text = '';
  for (let i = 1; i <= doc.numPages; i += 1) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    text += content.items.map((it) => it.str).join('');
  }
  return text;
}

function matchFields(text) {
  return FIELD_PATTERNS
    .map(({ label, target, re }) => {
      const m = text.match(re);
      return m ? { label, target, val: `${m[1]} 千元` } : null;
    })
    .filter(Boolean);
}

/** Parses a budget-book PDF/DOCX upload and returns { label, target, val } rows for preview. */
export async function parseImportFile(file) {
  const name = file.name.toLowerCase();
  let text;
  if (name.endsWith('.docx')) {
    text = await extractDocxText(file);
  } else if (name.endsWith('.pdf')) {
    text = await extractPdfText(file);
  } else {
    throw new Error('僅支援 PDF、DOCX 檔案');
  }
  const preview = matchFields(text);
  if (preview.length === 0) {
    throw new Error('未能從文件中辨識出已知欄位，請確認文件格式或手動輸入');
  }
  return preview;
}
