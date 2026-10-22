import * as XLSX from 'xlsx';

// Must match functions/accountAdmin.cjs's DEFAULT_IMPORT_EMAIL_DOMAIN — kept
// as a separate constant (rather than importing across the client/functions
// boundary) since the two are different deployable packages; the server is
// authoritative and re-normalizes every row itself, this is only shown to
// the admin before upload.
export const DEFAULT_IMPORT_EMAIL_DOMAIN = '@tmail.ilc.edu.tw';

export const ACCOUNT_IMPORT_HEADERS = ['姓名', '帳號', '處室', '權限', '負責模組'];

const DEPT_LIST = ['校長室', '教務處', '學務處', '總務處', '人事室', '會計室'];
const MODULE_LABEL_LIST = [
  '基本資料', '特生統計', '歲入歲出', '圖書藏書', '族語開班', '獲獎紀錄',
  '課後社團', '校地概況', '質詢答詢', '預算書表', '報表匯出', '歷史歸檔', '帳號管理',
];

/** The downloadable 帳號匯入範本.xlsx — a filled-in example sheet plus a plain-language instructions sheet. */
export function buildAccountImportTemplateWorkbook() {
  const wb = XLSX.utils.book_new();

  const exampleRows = [
    ACCOUNT_IMPORT_HEADERS,
    ['王小明', 'wang.xm', '總務處', '填報人員', '歲入歲出、圖書藏書'],
    ['陳小華', 'chen.xh', '教務處', '管理者', ''],
  ];
  const sheet = XLSX.utils.aoa_to_sheet(exampleRows);
  sheet['!cols'] = [{ wch: 10 }, { wch: 18 }, { wch: 10 }, { wch: 10 }, { wch: 30 }];
  XLSX.utils.book_append_sheet(wb, sheet, '帳號匯入範本');

  const notes = [
    ['欄位', '說明'],
    ['姓名', '必填。'],
    ['帳號', `必填。只要輸入帳號名稱（@ 之前的部分），系統會自動加上「${DEFAULT_IMPORT_EMAIL_DOMAIN}」；如需使用其他網域，請直接輸入完整 Email。`],
    ['處室', `必填，請填入以下其中一項：${DEPT_LIST.join('、')}。`],
    ['權限', '必填，請填入「管理者」或「填報人員」。'],
    ['負責模組', '僅「填報人員」需要填寫；管理者可存取全部模組，此欄留空即可。多個模組請用頓號（、）或逗號分隔。'],
    ['可填入的模組名稱', MODULE_LABEL_LIST.join('、')],
  ];
  const notesSheet = XLSX.utils.aoa_to_sheet(notes);
  notesSheet['!cols'] = [{ wch: 16 }, { wch: 70 }];
  XLSX.utils.book_append_sheet(wb, notesSheet, '填寫說明');

  return wb;
}

const HEADER_TO_FIELD = {
  姓名: 'name', 帳號: 'account', 處室: 'dept', 權限: 'role', 負責模組: 'modules',
};

function cellText(value) {
  if (value == null) return '';
  return String(value).trim();
}

/**
 * Reads an already-parsed xlsx workbook (XLSX.read(...) is the caller's
 * job, so this stays testable with a plain workbook object) into the raw
 * row shape functions/index.js's importAccounts callable expects — no
 * business validation here, that's the server's job (see accountAdmin.cjs's
 * normalizeImportRow + validateAccountProfile); this only turns spreadsheet
 * cells into {name, account, dept, role, modules} strings, one per data row.
 */
export function parseAccountImportFile(workbook) {
  const sheetName = workbook?.SheetNames?.[0];
  const sheet = sheetName && workbook.Sheets[sheetName];
  if (!sheet) return { rows: [], error: '找不到工作表內容，請確認檔案格式正確。' };

  const aoa = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
  if (aoa.length === 0) return { rows: [], error: '檔案是空的，請至少填寫一筆帳號資料。' };

  const headerRow = aoa[0].map((cell) => cellText(cell));
  const fieldByColumn = headerRow.map((header) => HEADER_TO_FIELD[header] || null);
  if (!fieldByColumn.includes('name') || !fieldByColumn.includes('account')) {
    return {
      rows: [],
      error: `找不到「姓名」或「帳號」欄位標題，請使用「下載帳號範例檔」提供的範本格式（標題列：${ACCOUNT_IMPORT_HEADERS.join('、')}）。`,
    };
  }

  const rows = aoa
    .slice(1)
    .map((line) => {
      const row = { name: '', account: '', dept: '', role: '', modules: '' };
      fieldByColumn.forEach((field, i) => {
        if (field) row[field] = cellText(line[i]);
      });
      return row;
    })
    // A blank line (e.g. trailing rows in the sheet) carries no data to import.
    .filter((row) => row.name || row.account);

  if (rows.length === 0) return { rows: [], error: '找不到任何帳號資料列，請確認範本中至少有一筆資料。' };

  return { rows, error: null };
}
