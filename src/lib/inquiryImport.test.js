import * as XLSX from 'xlsx';
import { describe, expect, it } from 'vitest';
import {
  INQUIRY_IMPORT_HEADERS,
  buildInquiryExportWorkbook,
  buildInquiryImportTemplateWorkbook,
  parseInquiryImportFile,
} from './inquiryImport';

function workbookFromRows(rows) {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), 'Sheet1');
  return wb;
}

describe('buildInquiryImportTemplateWorkbook', () => {
  it('produces a sheet whose header row matches INQUIRY_IMPORT_HEADERS and round-trips through parseInquiryImportFile', () => {
    const wb = buildInquiryImportTemplateWorkbook();
    expect(wb.SheetNames).toContain('議會質詢答詢匯入範本');
    expect(wb.SheetNames).toContain('填寫說明');

    const sheet = wb.Sheets['議會質詢答詢匯入範本'];
    const aoa = XLSX.utils.sheet_to_json(sheet, { header: 1 });
    expect(aoa[0]).toEqual(INQUIRY_IMPORT_HEADERS);

    const { rows, error } = parseInquiryImportFile(wb);
    expect(error).toBeNull();
    expect(rows).toEqual([
      {
        date: '2025-11-08', councilor: '王議員', subject: '代理教師人力', answer: '目前代理教師到職率已達 100%，無缺額。', status: '已答詢',
      },
      {
        date: '2026-05-20', councilor: '陳議員', subject: '課後社團經費', answer: '', status: '待答詢',
      },
    ]);
  });

  it('lists both inquiry status options and the required date format in the instructions sheet', () => {
    const wb = buildInquiryImportTemplateWorkbook();
    const notes = XLSX.utils.sheet_to_json(wb.Sheets['填寫說明'], { header: 1 });
    const flat = notes.map((row) => row.join('|')).join('\n');
    expect(flat).toContain('待答詢');
    expect(flat).toContain('已答詢');
    expect(flat).toContain('YYYY-MM-DD');
  });
});

describe('parseInquiryImportFile', () => {
  it('maps header columns to fields regardless of column order', () => {
    const wb = workbookFromRows([
      ['答詢狀態', '日期', '題目', '議員', '答案'],
      ['已答詢', '2025-05-15', '圖書館藏書更新', '李議員', '已於本學期完成採購。'],
    ]);
    const { rows, error } = parseInquiryImportFile(wb);
    expect(error).toBeNull();
    expect(rows).toEqual([
      {
        date: '2025-05-15', councilor: '李議員', subject: '圖書館藏書更新', answer: '已於本學期完成採購。', status: '已答詢',
      },
    ]);
  });

  it('trims cell whitespace and skips fully blank rows', () => {
    const wb = workbookFromRows([
      INQUIRY_IMPORT_HEADERS,
      [' 2025-10-12 ', ' 王議員 ', ' 代理教師人力 ', ' 已完成 ', ' 已答詢 '],
      ['', '', '', '', ''],
      ['2025-09-20', '陳議員', '課後社團經費', '', '待答詢'],
    ]);
    const { rows, error } = parseInquiryImportFile(wb);
    expect(error).toBeNull();
    expect(rows).toHaveLength(2);
    expect(rows[0]).toEqual({
      date: '2025-10-12', councilor: '王議員', subject: '代理教師人力', answer: '已完成', status: '已答詢',
    });
  });

  it('reports a friendly error when the header row is missing the required columns', () => {
    const wb = workbookFromRows([
      ['Councilor', 'Status'],
      ['王議員', '已答詢'],
    ]);
    const { rows, error } = parseInquiryImportFile(wb);
    expect(rows).toEqual([]);
    expect(error).toMatch(/題目.*日期|範本格式/);
  });

  it('reports a friendly error for a workbook with no data rows at all', () => {
    const wb = workbookFromRows([INQUIRY_IMPORT_HEADERS]);
    const { rows, error } = parseInquiryImportFile(wb);
    expect(rows).toEqual([]);
    expect(error).toMatch(/資料/);
  });

  it('reports a friendly error for a workbook with no sheets', () => {
    const { rows, error } = parseInquiryImportFile(XLSX.utils.book_new());
    expect(rows).toEqual([]);
    expect(error).toMatch(/工作表/);
  });
});

describe('buildInquiryExportWorkbook', () => {
  it('exports the given records as rows under the shared INQUIRY_IMPORT_HEADERS, blank for missing fields', () => {
    const wb = buildInquiryExportWorkbook([
      {
        date: '2025-09-20', councilor: '陳議員', subject: '課後社團經費', answer: '', status: '待答詢',
      },
      {
        date: '2025-05-15', councilor: '王議員', subject: '代理教師人力', answer: '已完成', status: '',
      },
    ]);
    const aoa = XLSX.utils.sheet_to_json(wb.Sheets['議會質詢答詢'], { header: 1 });
    expect(aoa).toEqual([
      INQUIRY_IMPORT_HEADERS,
      ['2025-09-20', '陳議員', '課後社團經費', '', '待答詢'],
      ['2025-05-15', '王議員', '代理教師人力', '已完成', ''],
    ]);
  });

  it('produces an empty data section for no records', () => {
    const wb = buildInquiryExportWorkbook([]);
    const aoa = XLSX.utils.sheet_to_json(wb.Sheets['議會質詢答詢'], { header: 1 });
    expect(aoa).toEqual([INQUIRY_IMPORT_HEADERS]);
  });
});
