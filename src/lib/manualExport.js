import jsPDF from 'jspdf';
import { registerCjkFont } from './pdfFont';
import { MANUAL_SECTIONS, MANUAL_LAST_REVIEWED_VERSION } from './manualContent';
import { APP_VERSION, APP_UPDATED_AT } from './appInfo';

const MARGIN = 14;
const LINE_HEIGHT = 6;
const TEXT_COLOR = [69, 75, 69];
const HEADING_COLOR = [30, 36, 32];
const NOTE_COLOR = [138, 90, 30];
const MUTED_COLOR = [138, 144, 137];

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`無法載入圖片：${src}`));
    img.src = src;
  });
}

/**
 * Builds the downloadable PDF for 操作手冊 from the same MANUAL_SECTIONS
 * data the online Manual.jsx page renders, so the two never drift apart.
 * Screenshots are fetched at build time (same-origin /manual/*.png) and
 * each gets its own page, scaled to fit — a full-page app screenshot is far
 * taller than it is wide, so fitting it beside running text isn't useful.
 */
export async function buildManualPdf() {
  const doc = new jsPDF();
  const fontName = await registerCjkFont(doc);
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const maxWidth = pageWidth - MARGIN * 2;
  let y = MARGIN;

  function ensureSpace(height) {
    if (y + height > pageHeight - MARGIN) {
      doc.addPage();
      y = MARGIN;
    }
  }

  function startFreshPage() {
    if (y > MARGIN + 0.01) doc.addPage();
    y = MARGIN;
  }

  function writeLines(text, { size = 10.5, weight = 'normal', color = TEXT_COLOR, gapAfter = 3 } = {}) {
    doc.setFont(fontName, weight);
    doc.setFontSize(size);
    doc.setTextColor(...color);
    const lines = doc.splitTextToSize(text, maxWidth);
    for (const line of lines) {
      ensureSpace(LINE_HEIGHT);
      doc.text(line, MARGIN, y);
      y += LINE_HEIGHT;
    }
    y += gapAfter;
  }

  async function writeImage(block) {
    const img = await loadImage(block.src);
    const naturalW = img.naturalWidth || img.width;
    const naturalH = img.naturalHeight || img.height;
    startFreshPage();
    const availH = pageHeight - MARGIN * 2 - 10;
    const scale = Math.min(maxWidth / naturalW, availH / naturalH);
    const w = naturalW * scale;
    const h = naturalH * scale;
    doc.addImage(img, 'PNG', MARGIN, y, w, h);
    y += h + 4;
    if (block.caption) writeLines(block.caption, { size: 9, color: MUTED_COLOR });
  }

  // Cover
  doc.setFont(fontName, 'bold');
  doc.setFontSize(20);
  doc.text('利澤國小基金預算管理系統', pageWidth / 2, 60, { align: 'center' });
  doc.setFontSize(16);
  doc.text('操作手冊', pageWidth / 2, 72, { align: 'center' });
  doc.setFont(fontName, 'normal');
  doc.setFontSize(11);
  doc.setTextColor(...MUTED_COLOR);
  doc.text(`適用系統版本 v${APP_VERSION} · ${APP_UPDATED_AT}`, pageWidth / 2, 86, { align: 'center' });
  if (MANUAL_LAST_REVIEWED_VERSION !== APP_VERSION) {
    const staleNote = doc.splitTextToSize(
      `手冊內容最後確認對應版本 v${MANUAL_LAST_REVIEWED_VERSION}，請一併參考系統內「更新日誌」`,
      maxWidth,
    );
    doc.text(staleNote, pageWidth / 2, 96, { align: 'center' });
  }

  // The cover draws at fixed absolute coordinates rather than advancing
  // `y`, so startFreshPage()'s "only break if y moved" check would not
  // detect it — force the page break unconditionally instead.
  doc.addPage();
  y = MARGIN;

  for (const section of MANUAL_SECTIONS) {
    ensureSpace(14);
    const heading = section.adminOnly ? `${section.title}（管理者專屬）` : section.title;
    writeLines(heading, { size: 14, weight: 'bold', color: HEADING_COLOR, gapAfter: 4 });

    let stepNum = 1;
    for (const block of section.blocks) {
      if (block.type === 'p') {
        writeLines(block.text, { gapAfter: 3 });
      } else if (block.type === 'steps') {
        for (const item of block.items) {
          writeLines(`${stepNum}. ${item}`, { gapAfter: 2 });
          stepNum += 1;
        }
        y += 2;
      } else if (block.type === 'note') {
        writeLines(`※ ${block.text}`, { color: NOTE_COLOR, gapAfter: 3 });
      } else if (block.type === 'image') {
        await writeImage(block);
      }
    }
    y += 6;
  }

  const pageCount = doc.internal.getNumberOfPages();
  for (let p = 1; p <= pageCount; p += 1) {
    doc.setPage(p);
    doc.setFont(fontName, 'normal');
    doc.setFontSize(9);
    doc.setTextColor(...MUTED_COLOR);
    doc.text(`第 ${p} 頁，共 ${pageCount} 頁`, pageWidth - MARGIN, pageHeight - 8, { align: 'right' });
  }

  return doc;
}
