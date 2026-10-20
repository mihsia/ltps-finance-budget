import * as XLSX from 'xlsx';
import { describe, expect, it } from 'vitest';
import {
  AWARD_IMPORT_HEADERS,
  buildAwardExportWorkbook,
  buildAwardImportTemplateWorkbook,
  parseAwardImportFile,
} from './awardImport';

function workbookFromRows(rows) {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), 'Sheet1');
  return wb;
}

describe('buildAwardImportTemplateWorkbook', () => {
  it('produces a sheet whose header row matches AWARD_IMPORT_HEADERS and round-trips through parseAwardImportFile', () => {
    const wb = buildAwardImportTemplateWorkbook();
    expect(wb.SheetNames).toContain('獲獎紀錄匯入範本');
    expect(wb.SheetNames).toContain('填寫說明');

    const sheet = wb.Sheets['獲獎紀錄匯入範本'];
    const aoa = XLSX.utils.sheet_to_json(sheet, { header: 1 });
    expect(aoa[0]).toEqual(AWARD_IMPORT_HEADERS);

    const { rows, error } = parseAwardImportFile(wb);
    expect(error).toBeNull();
    expect(rows).toEqual([
      { category: '語文類', item: '全國語文競賽－朗讀', level: '特優', date: '2025-10-12' },
      { category: '科學類', item: '宜蘭縣科學展覽會', level: '優等', date: '2025-09-20' },
    ]);
  });

  it('lists every award category and level in the instructions sheet', () => {
    const wb = buildAwardImportTemplateWorkbook();
    const notes = XLSX.utils.sheet_to_json(wb.Sheets['填寫說明'], { header: 1 });
    const flat = notes.map((row) => row.join('|')).join('\n');
    expect(flat).toContain('語文類');
    expect(flat).toContain('佳作');
    expect(flat).toContain('YYYY-MM-DD');
  });
});

describe('parseAwardImportFile', () => {
  it('maps header columns to fields regardless of column order', () => {
    const wb = workbookFromRows([
      ['等級', '類別', '日期', '獲獎項目'],
      ['佳作', '體育類', '2025-05-15', '全縣運動會'],
    ]);
    const { rows, error } = parseAwardImportFile(wb);
    expect(error).toBeNull();
    expect(rows).toEqual([
      { category: '體育類', item: '全縣運動會', level: '佳作', date: '2025-05-15' },
    ]);
  });

  it('trims cell whitespace and skips fully blank rows', () => {
    const wb = workbookFromRows([
      AWARD_IMPORT_HEADERS,
      [' 語文類 ', ' 全國語文競賽 ', ' 特優 ', ' 2025-10-12 '],
      ['', '', '', ''],
      ['科學類', '縣科展', '優等', '2025-09-20'],
    ]);
    const { rows, error } = parseAwardImportFile(wb);
    expect(error).toBeNull();
    expect(rows).toHaveLength(2);
    expect(rows[0]).toEqual({ category: '語文類', item: '全國語文競賽', level: '特優', date: '2025-10-12' });
  });

  it('reports a friendly error when the header row is missing the required columns', () => {
    const wb = workbookFromRows([
      ['Item', 'Date'],
      ['全國語文競賽', '2025-10-12'],
    ]);
    const { rows, error } = parseAwardImportFile(wb);
    expect(rows).toEqual([]);
    expect(error).toMatch(/獲獎項目.*日期|範本格式/);
  });

  it('reports a friendly error for a workbook with no data rows at all', () => {
    const wb = workbookFromRows([AWARD_IMPORT_HEADERS]);
    const { rows, error } = parseAwardImportFile(wb);
    expect(rows).toEqual([]);
    expect(error).toMatch(/資料/);
  });

  it('reports a friendly error for a workbook with no sheets', () => {
    const { rows, error } = parseAwardImportFile(XLSX.utils.book_new());
    expect(rows).toEqual([]);
    expect(error).toMatch(/工作表/);
  });
});

describe('buildAwardExportWorkbook', () => {
  it('exports the given records as rows under the shared AWARD_IMPORT_HEADERS, blank for missing fields', () => {
    const wb = buildAwardExportWorkbook([
      { category: '科學類', item: '縣科展', level: '優等', date: '2025-09-20' },
      { category: '體育類', item: '全縣運動會', level: '', date: '2025-05-15' },
    ]);
    const aoa = XLSX.utils.sheet_to_json(wb.Sheets['獲獎紀錄'], { header: 1 });
    expect(aoa).toEqual([
      AWARD_IMPORT_HEADERS,
      ['科學類', '縣科展', '優等', '2025-09-20'],
      ['體育類', '全縣運動會', '', '2025-05-15'],
    ]);
  });

  it('produces an empty data section for no records', () => {
    const wb = buildAwardExportWorkbook([]);
    const aoa = XLSX.utils.sheet_to_json(wb.Sheets['獲獎紀錄'], { header: 1 });
    expect(aoa).toEqual([AWARD_IMPORT_HEADERS]);
  });
});
