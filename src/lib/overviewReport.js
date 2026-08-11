import { budgetVarianceSummary } from './recordDerivations';

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

  const teacherTotal = num(basic?.regularTeachers) + num(basic?.substitute) + num(basic?.partTimeTeachers);
  const substituteRatio = teacherTotal ? Math.round((num(basic?.substitute) / teacherTotal) * 100) : null;
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
      regularTeachers: basic.regularTeachers, substitute: basic.substitute, partTimeTeachers: basic.partTimeTeachers,
      teacherTotal, substituteRatio, studentTeacherRatio,
      tuitionFeeAvg: basic.tuitionFeeAvg ?? null, lunchSubsidyTotal: basic.lunchSubsidyTotal ?? null,
    } : null,
    modules: {
      library: library ? { generalBooks: num(library.generalBooks), indigenousBooks: num(library.indigenousBooks), total: libraryTotal } : null,
      language: language.classRows.length ? { classTotal: languageClassTotal, passRate: languagePassRate } : null,
      specialNeeds: specialNeedsRows.length ? { total: specialNeedsTotal, rows: specialNeedsRows } : null,
      awards: awardsRows.length ? { count: awardsRows.length } : null,
      club: clubRows.length ? { count: clubRows.length } : null,
      land: landRows.length ? { count: landRows.length } : null,
      inquiry: inquiryRows.length ? { total: inquiryRows.length, resolved: inquiryResolved } : null,
    },
  };
}
