import * as XLSX from 'xlsx';
import { INQUIRY_STATUS_OPTIONS } from './recordSchemas';

export const INQUIRY_IMPORT_HEADERS = ['日期', '議員', '題目', '答案', '答詢狀態'];

/** The downloadable 議會質詢答詢匯入範本.xlsx — a filled-in example sheet plus a plain-language instructions sheet. */
export function buildInquiryImportTemplateWorkbook() {
  const wb = XLSX.utils.book_new();

  const exampleRows = [
    INQUIRY_IMPORT_HEADERS,
    ['2025-11-08', '王議員', '代理教師人力', '目前代理教師到職率已達 100%，無缺額。', '已答詢'],
    ['2026-05-20', '陳議員', '課後社團經費', '', '待答詢'],
  ];
  const sheet = XLSX.utils.aoa_to_sheet(exampleRows);
  sheet['!cols'] = [{ wch: 12 }, { wch: 12 }, { wch: 28 }, { wch: 40 }, { wch: 10 }];
  XLSX.utils.book_append_sheet(wb, sheet, '議會質詢答詢匯入範本');

  const notes = [
    ['欄位', '說明'],
    ['日期', '必填，格式為 YYYY-MM-DD（例如 2025-11-08）。'],
    ['議員', '必填，請填寫提出質詢的議員姓名。'],
    ['題目', '必填，請填寫質詢題目。'],
    ['答案', '選填，尚未答詢可留空，答詢後再補上答覆內容。'],
    ['答詢狀態', `必填，請填入以下其中一項：${INQUIRY_STATUS_OPTIONS.join('、')}，或自行輸入其他狀態名稱。`],
  ];
  const notesSheet = XLSX.utils.aoa_to_sheet(notes);
  notesSheet['!cols'] = [{ wch: 14 }, { wch: 70 }];
  XLSX.utils.book_append_sheet(wb, notesSheet, '填寫說明');

  return wb;
}

const HEADER_TO_FIELD = {
  日期: 'date', 議員: 'councilor', 題目: 'subject', 答案: 'answer', 答詢狀態: 'status',
};

// A 日期 cell the user typed or pasted as a real Excel date (not plain text)
// arrives here as a JS Date, not a string — Generic.jsx reads the upload
// with cellDates:true for exactly this reason. SheetJS anchors that Date at
// UTC midnight for a date-only cell, so UTC getters (matching
// recordSchemas.js's own dateValue()) avoid a timezone-dependent off-by-one.
function formatCellDate(date) {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function cellText(value) {
  if (value == null) return '';
  if (value instanceof Date) return formatCellDate(value);
  return String(value).trim();
}

/**
 * Reads an already-parsed xlsx workbook (XLSX.read(...) is the caller's job,
 * so this stays testable with a plain workbook object) into the raw row
 * shape {date, councilor, subject, answer, status} — no business validation
 * here, that's validateGenericRecord('inquiry', ...)'s job; this only turns
 * spreadsheet cells into strings, one row per data row.
 */
export function parseInquiryImportFile(workbook) {
  const sheetName = workbook?.SheetNames?.[0];
  const sheet = sheetName && workbook.Sheets[sheetName];
  if (!sheet) return { rows: [], error: '找不到工作表內容，請確認檔案格式正確。' };

  const aoa = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
  if (aoa.length === 0) return { rows: [], error: '檔案是空的，請至少填寫一筆質詢紀錄。' };

  const headerRow = aoa[0].map((cell) => cellText(cell));
  const fieldByColumn = headerRow.map((header) => HEADER_TO_FIELD[header] || null);
  if (!fieldByColumn.includes('subject') || !fieldByColumn.includes('date')) {
    return {
      rows: [],
      error: `找不到「題目」或「日期」欄位標題，請使用「下載範本」提供的範本格式（標題列：${INQUIRY_IMPORT_HEADERS.join('、')}）。`,
    };
  }

  const rows = aoa
    .slice(1)
    .map((line) => {
      const row = {
        date: '', councilor: '', subject: '', answer: '', status: '',
      };
      fieldByColumn.forEach((field, i) => {
        if (field) row[field] = cellText(line[i]);
      });
      return row;
    })
    // A blank line (e.g. trailing rows in the sheet) carries no data to import.
    .filter((row) => row.subject || row.date);

  if (rows.length === 0) return { rows: [], error: '找不到任何質詢紀錄，請確認範本中至少有一筆資料。' };

  return { rows, error: null };
}

/** The current 議會質詢答詢 table as a downloadable .xlsx — standalone from the 議會報表 exports in Report.jsx. */
export function buildInquiryExportWorkbook(records) {
  const wb = XLSX.utils.book_new();
  const rows = [
    INQUIRY_IMPORT_HEADERS,
    ...records.map((r) => [
      r.date || '', r.councilor || '', r.subject || '', r.answer || '', r.status || '',
    ]),
  ];
  const sheet = XLSX.utils.aoa_to_sheet(rows);
  sheet['!cols'] = [{ wch: 12 }, { wch: 12 }, { wch: 28 }, { wch: 40 }, { wch: 10 }];
  XLSX.utils.book_append_sheet(wb, sheet, '議會質詢答詢');
  return wb;
}
