import { describe, expect, it } from 'vitest';
import { buildOverviewReport } from './overviewReport';

const EXPENSE_ROWS = [
  { label: '國民教育計畫', formula: '教學活動', amount: 6157, actualAmount: null, varianceNote: null },
  { label: '一般行政管理計畫', formula: '人事費', amount: 48141, actualAmount: null, varianceNote: null },
  { label: '建築及設備計畫', formula: '設備購置', amount: 60, actualAmount: null, varianceNote: null },
];
const REVENUE_ROWS = [
  { label: '政府撥入收入', amount: 53599 },
  { label: '租金收入', amount: 40 },
  { label: '利息收入', amount: 2 },
  { label: '財產處分收入', amount: 1 },
];
const BASIC = {
  classes: '13', students: '262', staff: '28',
  regularTeachers: '19', substituteVacancy: '6', substituteAdditional: '3', partTimeTeachers: '2',
  tuitionFeeAvg: '827', lunchSubsidyTotal: '236',
};

describe('buildOverviewReport', () => {
  it('computes core KPIs from expense/revenue rows and the basic profile', () => {
    const report = buildOverviewReport({
      year: '115', who: '王小明', basic: BASIC, library: { generalBooks: 17296, indigenousBooks: 36 },
      expenseRows: EXPENSE_ROWS, revenueRows: REVENUE_ROWS,
    });
    expect(report.kpi.expenseTotal).toBe(54358);
    expect(report.kpi.revenueTotal).toBe(53642);
    expect(report.kpi.shortfall).toBe(-716);
    expect(report.kpi.students).toBe('262');
    expect(report.kpi.substituteRatio).toBe(30); // (6+3) / (19+9+2) = 30%
    expect(report.kpi.libraryTotal).toBe(17332);
    expect(report.meta).toEqual({ year: '115', who: '王小明', generatedAt: expect.any(Date) });
    expect(report.basicProfile).toMatchObject({
      substituteVacancy: '6', substituteAdditional: '3', substituteTotal: 9,
    });
    expect(report.modules.library).toMatchObject({
      rows: [
        { label: '一般書籍', value: 17296 },
        { label: '族語／原住民書籍', value: 36 },
      ],
    });
  });

  it('leaves substitute ratio and library totals null when the source module has no data', () => {
    const report = buildOverviewReport({ year: '115', basic: null, library: null, expenseRows: [], revenueRows: [] });
    expect(report.kpi.substituteRatio).toBeNull();
    expect(report.kpi.libraryTotal).toBeNull();
    expect(report.basicProfile).toBeNull();
    expect(report.modules.library).toBeNull();
    expect(report.meta.who).toBe('未知使用者');
  });

  it('computes year-over-year expense delta percentages, leaving the first year null', () => {
    const report = buildOverviewReport({
      year: '115', expenseRows: [], revenueRows: [],
      trend: [
        { year: '113', expenseTotal: 56463 },
        { year: '114', expenseTotal: 55101 },
        { year: '115', expenseTotal: 54358 },
      ],
    });
    expect(report.trend[0].deltaPct).toBeNull();
    expect(report.trend[1].deltaPct).toBeCloseTo(-2.412, 2);
    expect(report.trend[2].deltaPct).toBeCloseTo(-1.349, 2);
    expect(report.kpi.expenseDeltaPct).toBeCloseTo(-1.349, 2);
  });

  it('reports 決算/差異原因 per expense row and flags completeness only once every row is settled', () => {
    const partiallySettled = buildOverviewReport({
      year: '115',
      expenseRows: [
        { label: '國民教育計畫', amount: 6157, actualAmount: 6020, varianceNote: '部分計畫延至次年度執行' },
        { label: '一般行政管理計畫', amount: 48141, actualAmount: null, varianceNote: null },
      ],
      revenueRows: [],
    });
    expect(partiallySettled.expenseVariance.complete).toBe(false);
    expect(partiallySettled.expenseVariance.actualTotal).toBe(6020);
    expect(partiallySettled.expenseVariance.reasons).toEqual([{ label: '國民教育計畫', note: '部分計畫延至次年度執行' }]);
    expect(partiallySettled.expenseVariance.rows[0]).toMatchObject({
      label: '國民教育計畫', budgetAmount: 6157, actualAmount: 6020,
    });
    expect(partiallySettled.expenseVariance.rows[0].deltaPct).toBeCloseTo(-2.225, 2);
    expect(partiallySettled.expenseVariance.rows[1].actualAmount).toBeNull();
    expect(partiallySettled.expenseVariance.rows[1].deltaPct).toBeNull();

    const fullySettled = buildOverviewReport({
      year: '115',
      expenseRows: [
        { label: 'A', amount: 100, actualAmount: 90, varianceNote: null },
        { label: 'B', amount: 200, actualAmount: 210, varianceNote: null },
      ],
      revenueRows: [],
    });
    expect(fullySettled.expenseVariance.complete).toBe(true);
    expect(fullySettled.expenseVariance.actualTotal).toBe(300);
  });

  it('omits optional module summaries entirely when a module has no active records, rather than showing zero', () => {
    const report = buildOverviewReport({
      year: '115', expenseRows: [], revenueRows: [],
      language: { classRows: [], certificationRows: [] },
      specialNeedsRows: [], awardsRows: [], clubRows: [], landRows: [], inquiryRows: [],
    });
    expect(report.modules).toEqual({
      library: null, language: null, specialNeeds: null, awards: null, club: null, land: null, inquiry: null,
    });
  });

  it('summarizes populated optional modules, including a status heuristic for 議會質詢答詢', () => {
    const report = buildOverviewReport({
      year: '115', expenseRows: [], revenueRows: [],
      language: {
        classRows: [{ lang: '閩南語', classes: 13, students: 264 }, { lang: '客語', classes: 1, students: 4 }],
        certificationRows: [{ lang: '閩南語', tested: 264, passed: 138 }],
      },
      specialNeedsRows: [{ category: '原住民', count: 17 }, { category: '新住民', count: 25 }],
      awardsRows: [{ category: '科學類', item: '縣科展' }],
      clubRows: [{ name: '桌球社' }, { name: '直笛隊' }],
      landRows: [],
      inquiryRows: [
        { subject: '代理教師人力', status: '已答詢' },
        { subject: '課後社團經費', status: '待答詢' },
      ],
    });
    const languageRows = [{ lang: '閩南語', classes: 13, students: 264 }, { lang: '客語', classes: 1, students: 4 }];
    expect(report.modules.language).toEqual({ classTotal: 14, passRate: (138 / 264) * 100, rows: languageRows });
    expect(report.modules.specialNeeds).toEqual({
      total: 42,
      rows: [{ category: '原住民', count: 17 }, { category: '新住民', count: 25 }],
    });
    expect(report.modules.awards).toEqual({ count: 1, rows: [{ category: '科學類', item: '縣科展' }] });
    expect(report.modules.club).toEqual({
      count: 2,
      rows: [{ name: '桌球社' }, { name: '直笛隊' }],
    });
    expect(report.modules.land).toBeNull();
    expect(report.modules.inquiry).toEqual({
      total: 2,
      resolved: 1,
      rows: [
        { subject: '代理教師人力', status: '已答詢' },
        { subject: '課後社團經費', status: '待答詢' },
      ],
    });
  });
});
