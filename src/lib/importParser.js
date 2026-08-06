import JSZip from 'jszip';

// The 7 figures we know how to reliably locate in a 地方教育發展基金 budget book
// (PDF or DOCX), keyed to match Budget.jsx / BudgetBook.jsx's Firestore shape.
// Each field lists candidate regexes tried in order — the first one that matches
// wins. Real submitted PDFs (see 利澤國小115年度預算書) use 「基金來源／基金用途」
// wording, not the 「歲入合計／歲出合計」wording the original prototype assumed, so
// both are covered. Anchoring each pattern to the short phrase that follows the
// number in the source document (rather than a wide `[^\d]{0,N}` gap) avoids
// accidentally grabbing an unrelated number from a nearby table cell.
export const IMPORT_FIELDS = [
  {
    id: 'revenueTotal', label: '歲入合計（基金來源）', group: 'info',
    re: [/基金來源\s*([\d,]+)\s*千元/, /歲入合計[^\d]{0,10}([\d,]+)/],
  },
  {
    id: 'expenseTotal', label: '歲出合計（基金用途）', group: 'info',
    re: [/基金用途\s*([\d,]+)\s*千元/, /歲出合計[^\d]{0,10}([\d,]+)/],
  },
  {
    id: 'propertyIncome', label: '財產收入合計（處分／租金／利息，需人工分配明細）', group: 'info',
    re: [/財產收入\s*([\d,]+)\s*財產報廢/, /財產收入[^\d]{0,10}([\d,]+)/],
  },
  {
    id: 'govGrant', label: '政府撥入收入（公庫撥款）', group: 'revenue', revenueLabel: '政府撥入收入（公庫撥款）',
    re: [/政府撥入收入\s*([\d,]+)\s*縣政府/, /政府撥入收入[^\d]{0,10}([\d,]+)/, /公庫撥款收入[^\d]{0,10}([\d,]+)/],
  },
  {
    id: 'eduPlan', label: '國民教育計畫', group: 'expense', expenseLabel: '國民教育計畫',
    re: [/國民教育計畫\s*([\d,]+)\s*辦理/, /國民教育計畫[^\d]{0,10}([\d,]+)/],
  },
  {
    id: 'adminPlan', label: '一般行政管理計畫', group: 'expense', expenseLabel: '一般行政管理計畫',
    re: [/一般行政管理計畫\s*([\d,]+)\s*辦理/, /一般行政管理計畫[^\d]{0,10}([\d,]+)/],
  },
  {
    id: 'buildingPlan', label: '建築及設備計畫', group: 'expense', expenseLabel: '建築及設備計畫',
    re: [/建築及設備計畫\s*([\d,]+)\s*改善/, /建築及設備計畫[^\d]{0,10}([\d,]+)/],
  },
];

/** Extracts the plain text runs (<w:t>...</w:t>) from a .docx file's document.xml. */
async function extractDocxText(file) {
  const zip = await JSZip.loadAsync(file);
  const xml = await zip.file('word/document.xml').async('string');
  const runs = [...xml.matchAll(/<w:t[^>]*>([^<]*)<\/w:t>/g)].map((m) => m[1]);
  return runs.join('');
}

/**
 * Extracts text from a .pdf file using pdf.js (loaded lazily; no reliable OCR
 * layer assumed). Reconstructs line breaks and word spacing from each text
 * item's position instead of blindly concatenating item.str values — table
 * cells on the same PDF row otherwise run together with no separator at all
 * (e.g. "國民教育計畫6157"), which breaks even a generous regex gap.
 */
async function extractPdfText(file) {
  const pdfjsLib = await import('pdfjs-dist/build/pdf.mjs');
  pdfjsLib.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.mjs', import.meta.url).href;
  const buf = await file.arrayBuffer();
  const doc = await pdfjsLib.getDocument({ data: buf }).promise;
  let text = '';
  for (let i = 1; i <= doc.numPages; i += 1) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    let lastY = null;
    let lastX = null;
    for (const item of content.items) {
      if (!item.str) continue;
      const x = item.transform[4];
      const y = item.transform[5];
      if (lastY !== null && Math.abs(y - lastY) > 2) {
        text += '\n';
        lastX = null;
      } else if (lastX !== null && x - lastX > 1.5) {
        text += ' ';
      }
      text += item.str;
      lastY = y;
      lastX = x + (item.width ?? item.str.length * 5);
    }
    text += '\n';
  }
  return text;
}

/** Matches every field in IMPORT_FIELDS against `text`; unmatched fields are omitted. */
function matchFields(text) {
  const found = {};
  for (const field of IMPORT_FIELDS) {
    for (const re of field.re) {
      const m = text.match(re);
      if (m) {
        found[field.id] = m[1].replace(/,/g, '');
        break;
      }
    }
  }
  return found;
}

/**
 * Parses a budget-book PDF/DOCX upload and returns { fields, missing } where
 * `fields` maps IMPORT_FIELDS ids -> parsed integer, and `missing` lists the
 * ids that could not be found (layout drift, scanned image, etc.) so the
 * caller can prompt for manual entry instead of silently leaving them blank.
 */
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
  const found = matchFields(text);
  if (Object.keys(found).length === 0) {
    throw new Error('未能從文件中辨識出已知欄位，請確認文件格式或手動輸入');
  }
  const fields = Object.fromEntries(Object.entries(found).map(([k, v]) => [k, Number(v)]));
  const missing = IMPORT_FIELDS.map((f) => f.id).filter((id) => !(id in fields));
  return { fields, missing };
}
