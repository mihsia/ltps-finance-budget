import { describe, expect, it } from 'vitest';
import * as XLSX from 'xlsx';
import { buildCouncilWorkbook } from './councilExport';

describe('council export record authority', () => {
  it('builds all budget sheets from active typed records and excludes soft-deleted rows', () => {
    const workbook = buildCouncilWorkbook({
      year: '115',
      years: ['114', '115'],
      budgetRecordsByYear: {
        114: [
          { id: 'prev-expense', recordType: 'expense', label: '國民教育計畫', formula: '前年', amount: 80, deletedAt: null },
          { id: 'prev-revenue', recordType: 'revenue', label: '政府撥入收入', amount: 90, deletedAt: null },
        ],
        115: [
          { id: 'expense', recordType: 'expense', label: '國民教育計畫', formula: '本年', amount: 100, deletedAt: null },
          { id: 'revenue', recordType: 'revenue', label: '政府撥入收入', amount: 120, deletedAt: null },
          { id: 'deleted', recordType: 'expense', label: '已停用項目', formula: '不可匯出', amount: 999, deletedAt: { seconds: 1 } },
        ],
      },
    });

    const summary = XLSX.utils.sheet_to_json(
      workbook.Sheets['基金來源用途餘絀表'],
      { header: 1 },
    );
    const expenseDetail = XLSX.utils.sheet_to_json(
      workbook.Sheets['基金用途明細表'],
      { header: 1 },
    );

    expect(summary).toContainEqual(['基金來源', 120, 90, 30]);
    expect(summary).toContainEqual(['基金用途', 100, 80, 20]);
    expect(expenseDetail).toContainEqual(['國民教育計畫', 80, 100, '本年']);
    expect(summary.flat()).not.toContain('　已停用項目');
    expect(expenseDetail.flat()).not.toContain('已停用項目');
  });
});
