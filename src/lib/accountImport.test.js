import * as XLSX from 'xlsx';
import { describe, expect, it } from 'vitest';
import {
  ACCOUNT_IMPORT_HEADERS,
  buildAccountImportTemplateWorkbook,
  parseAccountImportFile,
} from './accountImport';

function workbookFromRows(rows) {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), 'Sheet1');
  return wb;
}

describe('buildAccountImportTemplateWorkbook', () => {
  it('produces a sheet whose header row matches ACCOUNT_IMPORT_HEADERS and round-trips through parseAccountImportFile', () => {
    const wb = buildAccountImportTemplateWorkbook();
    expect(wb.SheetNames).toContain('帳號匯入範本');
    expect(wb.SheetNames).toContain('填寫說明');

    const sheet = wb.Sheets['帳號匯入範本'];
    const aoa = XLSX.utils.sheet_to_json(sheet, { header: 1 });
    expect(aoa[0]).toEqual(ACCOUNT_IMPORT_HEADERS);

    const { rows, error } = parseAccountImportFile(wb);
    expect(error).toBeNull();
    expect(rows).toEqual([
      { name: '王小明', account: 'wang.xm', dept: '總務處', role: '填報人員', modules: '歲入歲出、圖書藏書' },
      { name: '陳小華', account: 'chen.xh', dept: '教務處', role: '管理者', modules: '' },
    ]);
  });

  it('lists every account-assignable module in the instructions sheet, including 特生統計', () => {
    const wb = buildAccountImportTemplateWorkbook();
    const notes = XLSX.utils.sheet_to_json(wb.Sheets['填寫說明'], { header: 1 });
    const flat = notes.map((row) => row.join('|')).join('\n');
    expect(flat).toContain('特生統計');
    expect(flat).toContain('@tmail.ilc.edu.tw');
  });
});

describe('parseAccountImportFile', () => {
  it('maps header columns to fields regardless of column order', () => {
    const wb = workbookFromRows([
      ['權限', '姓名', '帳號', '負責模組', '處室'],
      ['填報人員', '林小美', 'lin', '歲入歲出', '學務處'],
    ]);
    const { rows, error } = parseAccountImportFile(wb);
    expect(error).toBeNull();
    expect(rows).toEqual([
      { name: '林小美', account: 'lin', dept: '學務處', role: '填報人員', modules: '歲入歲出' },
    ]);
  });

  it('trims cell whitespace and skips fully blank rows', () => {
    const wb = workbookFromRows([
      ACCOUNT_IMPORT_HEADERS,
      [' 王小明 ', ' wang.xm ', ' 總務處 ', ' 填報人員 ', ' 歲入歲出 '],
      ['', '', '', '', ''],
      ['陳小華', 'chen.xh', '教務處', '管理者', ''],
    ]);
    const { rows, error } = parseAccountImportFile(wb);
    expect(error).toBeNull();
    expect(rows).toHaveLength(2);
    expect(rows[0]).toEqual({ name: '王小明', account: 'wang.xm', dept: '總務處', role: '填報人員', modules: '歲入歲出' });
  });

  it('reports a friendly error when the header row is missing the required columns', () => {
    const wb = workbookFromRows([
      ['Name', 'Account'],
      ['王小明', 'wang.xm'],
    ]);
    const { rows, error } = parseAccountImportFile(wb);
    expect(rows).toEqual([]);
    expect(error).toMatch(/姓名.*帳號|範本格式/);
  });

  it('reports a friendly error for a workbook with no data rows at all', () => {
    const wb = workbookFromRows([ACCOUNT_IMPORT_HEADERS]);
    const { rows, error } = parseAccountImportFile(wb);
    expect(rows).toEqual([]);
    expect(error).toMatch(/資料/);
  });

  it('reports a friendly error for a workbook with no sheets', () => {
    const { rows, error } = parseAccountImportFile(XLSX.utils.book_new());
    expect(rows).toEqual([]);
    expect(error).toMatch(/工作表/);
  });
});
