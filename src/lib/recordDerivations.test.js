import { describe, expect, it } from 'vitest';
import {
  activeTypedRecords,
  budgetRecordSummary,
  budgetVarianceSummary,
  languageRecordSummary,
} from './recordDerivations';

describe('activeTypedRecords', () => {
  it('returns an empty list for non-array input', () => {
    expect(activeTypedRecords(null)).toEqual([]);
    expect(activeTypedRecords(undefined)).toEqual([]);
  });

  it('excludes soft-deleted records and filters by recordType when given', () => {
    const records = [
      { recordType: 'expense', label: 'A', deletedAt: null },
      { recordType: 'expense', label: 'B', deletedAt: { seconds: 1 } },
      { recordType: 'revenue', label: 'C', deletedAt: null },
    ];
    expect(activeTypedRecords(records, 'expense')).toEqual([records[0]]);
    expect(activeTypedRecords(records)).toEqual([records[0], records[2]]);
  });
});

describe('budgetRecordSummary', () => {
  it('splits expense/revenue rows and sums each total', () => {
    const records = [
      { recordType: 'expense', label: '國民教育計畫', amount: 6157, deletedAt: null },
      { recordType: 'expense', label: '一般行政管理計畫', amount: 48141, deletedAt: null },
      { recordType: 'revenue', label: '政府撥入收入', amount: 53599, deletedAt: null },
    ];
    expect(budgetRecordSummary(records)).toMatchObject({
      expenseTotal: 54298,
      revenueTotal: 53599,
    });
  });
});

describe('languageRecordSummary', () => {
  it('splits by recordType into class/certification/roster buckets', () => {
    const records = [
      { recordType: 'class', lang: '閩南語', classes: 13, students: 264, deletedAt: null },
      { recordType: 'certification', lang: '閩南語', tested: 264, passed: 138, deletedAt: null },
      { recordType: 'roster', lang: '閩南語', name: '陳○安', deletedAt: null },
    ];
    const summary = languageRecordSummary(records);
    expect(summary.classRows).toHaveLength(1);
    expect(summary.certificationRows).toHaveLength(1);
    expect(summary.rosterRows).toHaveLength(1);
  });
});

describe('budgetVarianceSummary', () => {
  it('reports no settled figures yet when actualAmount is unset on every row', () => {
    const rows = [
      { label: '國民教育計畫', amount: 6157, actualAmount: null, varianceNote: null },
      { label: '一般行政管理計畫', amount: 48141, actualAmount: null, varianceNote: null },
    ];
    expect(budgetVarianceSummary(rows)).toEqual({
      budgetTotal: 54298,
      actualTotal: null,
      hasActual: false,
      complete: false,
      reasons: [],
    });
  });

  it('sums only the rows with a settled figure and collects variance notes', () => {
    const rows = [
      { label: '國民教育計畫', amount: 6157, actualAmount: 6020, varianceNote: '部分計畫延至次年度執行' },
      { label: '一般行政管理計畫', amount: 48141, actualAmount: null, varianceNote: null },
    ];
    expect(budgetVarianceSummary(rows)).toEqual({
      budgetTotal: 54298,
      actualTotal: 6020,
      hasActual: true,
      complete: false,
      reasons: [{ label: '國民教育計畫', note: '部分計畫延至次年度執行' }],
    });
  });

  it('marks complete once every row has a settled figure', () => {
    const rows = [
      { label: '國民教育計畫', amount: 6157, actualAmount: 6020, varianceNote: null },
      { label: '一般行政管理計畫', amount: 48141, actualAmount: 47790, varianceNote: null },
    ];
    expect(budgetVarianceSummary(rows)).toMatchObject({ complete: true, actualTotal: 53810 });
  });

  it('treats an empty row list as incomplete rather than trivially complete', () => {
    expect(budgetVarianceSummary([])).toMatchObject({ complete: false, hasActual: false });
  });
});
