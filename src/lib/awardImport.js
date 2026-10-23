import * as XLSX from 'xlsx';
import { AWARD_CATEGORIES, AWARD_COMPETITION_TYPES, AWARD_LEVELS } from './recordSchemas';

export const AWARD_IMPORT_HEADERS = ['類別', '獲獎項目', '賽事類型', '學生姓名', '等級', '日期'];

/** The downloadable 獲獎紀錄匯入範本.xlsx — a filled-in example sheet plus a plain-language instructions sheet. */
export function buildAwardImportTemplateWorkbook() {
  const wb = XLSX.utils.book_new();

  const exampleRows = [
    AWARD_IMPORT_HEADERS,
    ['語文類', '宜蘭縣語文競賽－朗讀', '個人賽', '陳○安', '特優', '2025-10-12'],
    ['科學類', '宜蘭縣科學展覽會', '團體賽', '', '優等', '2025-09-20'],
  ];
  const sheet = XLSX.utils.aoa_to_sheet(exampleRows);
  sheet['!cols'] = [{ wch: 10 }, { wch: 28 }, { wch: 10 }, { wch: 12 }, { wch: 10 }, { wch: 12 }];
  XLSX.utils.book_append_sheet(wb, sheet, '獲獎紀錄匯入範本');

  const notes = [
    ['欄位', '說明'],
    ['類別', `必填，請填入以下其中一項：${AWARD_CATEGORIES.join('、')}。`],
    ['獲獎項目', '必填，可參考系統下拉選單提供的常見比賽名稱，或自行輸入其他項目名稱。'],
    ['賽事類型', `必填，請填入以下其中一項：${AWARD_COMPETITION_TYPES.join('、')}。`],
    ['學生姓名', '團體賽可留空；個人賽必填，請填入得獎學生姓名。'],
    ['等級', `必填，請填入以下其中一項：${AWARD_LEVELS.join('、')}，或自行輸入其他等級名稱。`],
    ['日期', '必填，格式為 YYYY-MM-DD（例如 2025-10-12）。'],
  ];
  const notesSheet = XLSX.utils.aoa_to_sheet(notes);
  notesSheet['!cols'] = [{ wch: 14 }, { wch: 70 }];
  XLSX.utils.book_append_sheet(wb, notesSheet, '填寫說明');

  return wb;
}

const HEADER_TO_FIELD = {
  類別: 'category', 獲獎項目: 'item', 賽事類型: 'competitionType', 學生姓名: 'studentName', 等級: 'level', 日期: 'date',
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
 * shape {category, item, competitionType, studentName, level, date} — no
 * business validation here, that's validateGenericRecord('awards', ...)'s
 * job; this only turns spreadsheet cells into strings, one row per data row.
 */
export function parseAwardImportFile(workbook) {
  const sheetName = workbook?.SheetNames?.[0];
  const sheet = sheetName && workbook.Sheets[sheetName];
  if (!sheet) return { rows: [], error: '找不到工作表內容，請確認檔案格式正確。' };

  const aoa = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
  if (aoa.length === 0) return { rows: [], error: '檔案是空的，請至少填寫一筆獲獎紀錄。' };

  const headerRow = aoa[0].map((cell) => cellText(cell));
  const fieldByColumn = headerRow.map((header) => HEADER_TO_FIELD[header] || null);
  if (!fieldByColumn.includes('item') || !fieldByColumn.includes('date')) {
    return {
      rows: [],
      error: `找不到「獲獎項目」或「日期」欄位標題，請使用「下載範本」提供的範本格式（標題列：${AWARD_IMPORT_HEADERS.join('、')}）。`,
    };
  }

  const rows = aoa
    .slice(1)
    .map((line) => {
      const row = {
        category: '', item: '', competitionType: '', studentName: '', level: '', date: '',
      };
      fieldByColumn.forEach((field, i) => {
        if (field) row[field] = cellText(line[i]);
      });
      return row;
    })
    // A blank line (e.g. trailing rows in the sheet) carries no data to import.
    .filter((row) => row.item || row.date);

  if (rows.length === 0) return { rows: [], error: '找不到任何獲獎紀錄，請確認範本中至少有一筆資料。' };

  return { rows, error: null };
}

/** The current 獲獎紀錄 table as a downloadable .xlsx — standalone from the 議會報表 exports in Report.jsx. */
export function buildAwardExportWorkbook(records) {
  const wb = XLSX.utils.book_new();
  const rows = [
    AWARD_IMPORT_HEADERS,
    ...records.map((r) => [
      r.category || '', r.item || '', r.competitionType || '', r.studentName || '', r.level || '', r.date || '',
    ]),
  ];
  const sheet = XLSX.utils.aoa_to_sheet(rows);
  sheet['!cols'] = [{ wch: 10 }, { wch: 28 }, { wch: 10 }, { wch: 12 }, { wch: 10 }, { wch: 12 }];
  XLSX.utils.book_append_sheet(wb, sheet, '獲獎紀錄');
  return wb;
}
