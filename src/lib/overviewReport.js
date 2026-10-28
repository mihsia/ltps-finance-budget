import { budgetVarianceSummary } from './recordDerivations';
import { summarizeInquiryResolution } from './inquiryStats';
import { fmtNum } from './format';

// One accent color per optional module, taken from the sidebar nav's own
// per-module colors (src/lib/nav.js) — reused by the Report.jsx preview and
// the PDF export so a module reads as "the same color" everywhere it appears.
export const OPTIONAL_MODULE_COLORS = {
  library: '#7D5BA6',
  language: '#2E7DAF',
  specialNeeds: '#A0764A',
  awards: '#A1497E',
  club: '#4F8C3E',
  careSupport: '#D9714E',
  land: '#8C8C3E',
  inquiry: '#B1456B',
};

// Each module's identity as a pale fill + the dark ink of the same hue —
// the "多彩但柔和" (多模版 D，2026-10-27 議會報表設計定案) treatment for a
// whole card or table-header surface, as opposed to OPTIONAL_MODULE_COLORS
// above (kept unchanged; still the saturated data-ink used by the module's
// own chart, e.g. RankedBarChart — a pale tint there would wash the bars
// out). `soft` is the fill, `ink` is text/border on that fill; both pass
// WCAG AA contrast on white and on their own `soft`.
export const OPTIONAL_MODULE_TILE_COLORS = {
  library: { soft: '#F1E9F8', ink: '#4A2E66' },
  language: { soft: '#E6F1F8', ink: '#0F4C66' },
  specialNeeds: { soft: '#F3E9DE', ink: '#6B4423' },
  awards: { soft: '#FBE9F2', ink: '#6B1D44' },
  club: { soft: '#EAF5E6', ink: '#2C5420' },
  careSupport: { soft: '#FBEAE2', ink: '#7A3A1E' },
  land: { soft: '#F5F0DC', ink: '#5C5420' },
  inquiry: { soft: '#FDE8EE', ink: '#85204A' },
};

// Donut-slice colors for the 3 modules Report.jsx charts as a category
// breakdown — moved here (from being Report.jsx-local) so overviewExport.js
// can draw the exact same colors natively in the PDF (方向 B2，2026-10-28
// 設計定案) instead of drifting from whatever the web page uses. Validated
// against the dataviz skill's CVD-safety checks for an all-pairs (every
// slice visually adjacent to every other) categorical context; "其他"
// (legacy/custom data outside the fixed category list) stays neutral gray
// rather than taking another hue.
export const AWARD_CATEGORY_COLORS = {
  語文類: '#2a78d6',
  藝文類: '#eda100',
  體育類: '#e87ba4',
  科學類: '#008300',
  其他: '#8A9089',
};

// Fixed SPECIAL_NEEDS_CATEGORIES order (原住民/新住民/低收入戶/身障生/單親生);
// a ring-adjacent (not all-pairs) CVD check is the right standard here since
// the donut always renders these 5 in this same fixed order, so only true
// neighbors — including the wrap from 單親生 back to 原住民 — ever touch.
export const SPECIAL_NEEDS_CATEGORY_COLORS = {
  原住民: '#2a78d6',
  新住民: '#eb6834',
  低收入戶: '#1baf7a',
  身障生: '#eda100',
  單親生: '#e87ba4',
};
export const SPECIAL_NEEDS_OTHER_COLOR = '#8A9089';

// Same fixed-order-then-gray-其他 pattern as AWARD_CATEGORY_COLORS above,
// continuing the app's categorical hue order (blue, amber, pink, …) rather
// than reusing award's own 3 hues out of order.
export const CARE_SUPPORT_CATEGORY_COLORS = {
  課照班: '#2a78d6',
  特教課照: '#eda100',
  學扶班: '#e87ba4',
  其他: '#8A9089',
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
    { key: 'competitionType', label: '賽事類型' },
    { key: 'studentName', label: '學生姓名' },
    { key: 'level', label: '等級' },
    { key: 'date', label: '日期' },
  ],
  club: [
    { key: 'name', label: '社團名稱' },
    { key: 'instructor', label: '指導老師' },
    { key: 'participants', label: '人數' },
    { key: 'weekday', label: '上課星期' },
    { key: 'startTime', label: '開始時間' },
    { key: 'endTime', label: '結束時間' },
    { key: 'venue', label: '上課場地' },
    { key: 'feePerStudent', label: '每生費用（元）' },
  ],
  careSupport: [
    { key: 'category', label: '班別類別' },
    { key: 'name', label: '班別名稱' },
    { key: 'teacher', label: '任課老師' },
    { key: 'participants', label: '學生人數' },
    { key: 'schedule', label: '開課時段' },
    { key: 'venue', label: '上課地點' },
  ],
  land: [
    { key: 'parcel', label: '地號' },
    { key: 'area', label: '面積(㎡)' },
    { key: 'announcedValue', label: '公告現值(元/㎡)' },
  ],
  // 答案內容不列入議會報表的精簡明細表（可能很長，會撐爆表格寬度）；
  // 完整答案請到「議會質詢／答詢紀錄」模組頁面查看。
  inquiry: [
    { key: 'date', label: '日期' },
    { key: 'councilor', label: '議員' },
    { key: 'subject', label: '題目' },
    { key: 'status', label: '答詢狀態' },
  ],
};

// Each optional module's headline number, in one place — Report.jsx's module
// cards, the Excel/PDF exports (overviewExport.js) and Dashboard.jsx's 各模組
//現況 cards all call this instead of keeping their own copy, so the number
// shown for a module is identical wherever it appears.
export function moduleValueText(key, summary) {
  if (!summary) return '—';
  if (key === 'library') return `${fmtNum(summary.total)} 冊`;
  if (key === 'language') return `${summary.classTotal} 班`;
  if (key === 'specialNeeds') return `${summary.total} 人`;
  if (key === 'awards') return `${summary.count} 筆`;
  if (key === 'club') return `${summary.count} 個`;
  if (key === 'careSupport') return `${summary.count} 班`;
  if (key === 'land') return `${summary.count} 筆`;
  if (key === 'inquiry') return `${summary.resolved} / ${summary.total} 已結案`;
  return '—';
}

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
  language = { classRows: [], teacherRows: [] },
  specialNeedsRows = [],
  awardsRows = [],
  clubRows = [],
  careSupportRows = [],
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
  const inquiryResolution = summarizeInquiryResolution(inquiryRows);

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
      principalTotalTenure: basic.principalTotalTenure ?? null, principalTenure: basic.principalTenure ?? null,
      sportsCoaches: basic.sportsCoaches ?? null, schoolNurses: basic.schoolNurses ?? null,
      aedCount: basic.aedCount ?? null, aedCertifiedTeachers: basic.aedCertifiedTeachers ?? null,
    } : null,
    modules: {
      library: library ? {
        generalBooks: num(library.generalBooks), indigenousBooks: num(library.indigenousBooks), total: libraryTotal,
        budget: library.libraryBudget || null, plan: library.libraryPlan || null,
        rows: [
          { label: '一般書籍', value: num(library.generalBooks) },
          { label: '族語／原住民書籍', value: num(library.indigenousBooks) },
        ],
      } : null,
      language: (language.classRows.length || language.rosterRows?.length)
        ? { classTotal: languageClassTotal, certifiedStudents: language.rosterRows?.length || 0, rows: language.classRows }
        : null,
      specialNeeds: specialNeedsRows.length ? { total: specialNeedsTotal, rows: specialNeedsRows } : null,
      awards: awardsRows.length ? { count: awardsRows.length, rows: awardsRows } : null,
      club: clubRows.length ? { count: clubRows.length, rows: clubRows } : null,
      careSupport: careSupportRows.length ? { count: careSupportRows.length, rows: careSupportRows } : null,
      land: landRows.length ? { count: landRows.length, rows: landRows } : null,
      inquiry: inquiryRows.length
        ? { total: inquiryRows.length, resolved: inquiryResolution.resolved, rows: inquiryRows }
        : null,
    },
  };
}
