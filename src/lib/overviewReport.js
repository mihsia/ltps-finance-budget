import { budgetVarianceSummary } from './recordDerivations';

// One accent color per optional module, taken from the sidebar nav's own
// per-module colors (src/lib/nav.js) — reused by the Report.jsx preview and
// the PDF export so a module reads as "the same color" everywhere it appears.
export const OPTIONAL_MODULE_COLORS = {
  library: '#7D5BA6',
  language: '#2E7DAF',
  specialNeeds: '#A0764A',
  awards: '#A1497E',
  club: '#4F8C3E',
  land: '#8C8C3E',
  inquiry: '#B1456B',
};

// Column spec for each optional module's itemized detail table — shared by
// the live Report.jsx preview and both export builders so the "細項資料"
// shown on screen, in the PDF, and in the Excel workbook never drift apart.
export const OPTIONAL_MODULE_DETAIL_FIELDS = {
  library: [
    { key: 'label', label: '項目' },
    { key: 'value', label: '冊數' },
  ],
  language: [
    { key: 'lang', label: '語系' },
    { key: 'classes', label: '班級數' },
    { key: 'students', label: '學生人數' },
  ],
  specialNeeds: [
    { key: 'category', label: '類別' },
    { key: 'count', label: '人數' },
    { key: 'note', label: '說明' },
  ],
  awards: [
    { key: 'category', label: '類別' },
    { key: 'item', label: '獲獎項目' },
    { key: 'level', label: '等級' },
    { key: 'date', label: '日期' },
  ],
  club: [
    { key: 'name', label: '社團名稱' },
    { key: 'instructor', label: '指導老師' },
    { key: 'participants', label: '人數' },
    { key: 'schedule', label: '上課時間' },
  ],
  land: [
    { key: 'parcel', label: '地號' },
    { key: 'area', label: '面積(㎡)' },
    { key: 'announcedValue', label: '公告現值(元/㎡)' },
  ],
  inquiry: [
    { key: 'date', label: '日期' },
    { key: 'subject', label: '議員/題目' },
    { key: 'status', label: '答詢狀態' },
  ],
};

function pct(current, previous) {
  if (previous == null || previous === 0 || current == null) return null;
  return ((current - previous) / previous) * 100;
}

function num(value) {
  return Number(value || 0);
}

/**
 * Normalizes every module's live data into one plain-object "full picture"
 * report — the single source of truth rendered by the Report.jsx preview
 * and handed to both the PDF and Excel builders below, so all three always
 * agree on the numbers.
 */
export function buildOverviewReport({
  year,
  who,
  basic,
  library,
  expenseRows = [],
  revenueRows = [],
  trend = [],
  language = { classRows: [], certificationRows: [] },
  specialNeedsRows = [],
  awardsRows = [],
  clubRows = [],
  landRows = [],
  inquiryRows = [],
  generatedAt = new Date(),
}) {
  const expenseTotal = expenseRows.reduce((sum, row) => sum + num(row.amount), 0);
  const revenueTotal = revenueRows.reduce((sum, row) => sum + num(row.amount), 0);
  const shortfall = revenueTotal - expenseTotal;

  const substituteTotal = num(basic?.substituteVacancy) + num(basic?.substituteAdditional);
  const teacherTotal = num(basic?.regularTeachers) + substituteTotal + num(basic?.partTimeTeachers);
  const substituteRatio = teacherTotal ? Math.round((substituteTotal / teacherTotal) * 100) : null;
  const studentTeacherRatio = teacherTotal ? (num(basic?.students) / teacherTotal).toFixed(1) : null;

  const libraryTotal = library ? num(library.generalBooks) + num(library.indigenousBooks) : null;

  const languageClassTotal = language.classRows.reduce((sum, row) => sum + num(row.classes), 0);
  const languageTested = language.certificationRows.reduce((sum, row) => sum + num(row.tested), 0);
  const languagePassed = language.certificationRows.reduce((sum, row) => sum + num(row.passed), 0);
  const languagePassRate = languageTested ? (languagePassed / languageTested) * 100 : null;

  const trendWithDelta = trend.map((entry, index) => ({
    year: entry.year,
    expenseTotal: entry.expenseTotal,
    deltaPct: index === 0 ? null : pct(entry.expenseTotal, trend[index - 1].expenseTotal),
  }));

  const variance = budgetVarianceSummary(expenseRows);
  const expenseVarianceRows = expenseRows.map((row) => ({
    label: row.label,
    formula: row.formula || '',
    budgetAmount: num(row.amount),
    actualAmount: row.actualAmount == null ? null : num(row.actualAmount),
    deltaPct: row.actualAmount == null ? null : pct(num(row.actualAmount), num(row.amount)),
    note: row.varianceNote || '',
  }));

  const specialNeedsTotal = specialNeedsRows.reduce((sum, row) => sum + num(row.count), 0);
  const inquiryResolved = inquiryRows.filter((row) => (row.status || '').includes('已')).length;

  return {
    meta: { year, who: who || '未知使用者', generatedAt },
    kpi: {
      expenseTotal,
      revenueTotal,
      shortfall,
      expenseDeltaPct: trendWithDelta.length ? trendWithDelta[trendWithDelta.length - 1].deltaPct : null,
      students: basic?.students ?? null,
      classes: basic?.classes ?? null,
      staff: basic?.staff ?? null,
      substituteRatio,
      libraryTotal,
      libraryIndigenous: library ? num(library.indigenousBooks) : null,
      languageClassTotal,
    },
    trend: trendWithDelta,
    expenseVariance: {
      rows: expenseVarianceRows,
      budgetTotal: variance.budgetTotal,
      actualTotal: variance.actualTotal,
      hasActual: variance.hasActual,
      complete: variance.complete,
      reasons: variance.reasons,
    },
    revenue: { rows: revenueRows.map((row) => ({ label: row.label, amount: num(row.amount) })), total: revenueTotal },
    basicProfile: basic ? {
      classes: basic.classes, students: basic.students, staff: basic.staff,
      regularTeachers: basic.regularTeachers,
      substituteVacancy: basic.substituteVacancy, substituteAdditional: basic.substituteAdditional,
      substituteTotal, partTimeTeachers: basic.partTimeTeachers,
      teacherTotal, substituteRatio, studentTeacherRatio,
      tuitionFeeAvg: basic.tuitionFeeAvg ?? null, lunchSubsidyTotal: basic.lunchSubsidyTotal ?? null,
    } : null,
    modules: {
      library: library ? {
        generalBooks: num(library.generalBooks), indigenousBooks: num(library.indigenousBooks), total: libraryTotal,
        rows: [
          { label: '一般書籍', value: num(library.generalBooks) },
          { label: '族語／原住民書籍', value: num(library.indigenousBooks) },
        ],
      } : null,
      language: language.classRows.length
        ? { classTotal: languageClassTotal, passRate: languagePassRate, rows: language.classRows }
        : null,
      specialNeeds: specialNeedsRows.length ? { total: specialNeedsTotal, rows: specialNeedsRows } : null,
      awards: awardsRows.length ? { count: awardsRows.length, rows: awardsRows } : null,
      club: clubRows.length ? { count: clubRows.length, rows: clubRows } : null,
      land: landRows.length ? { count: landRows.length, rows: landRows } : null,
      inquiry: inquiryRows.length
        ? { total: inquiryRows.length, resolved: inquiryResolved, rows: inquiryRows }
        : null,
    },
  };
}
