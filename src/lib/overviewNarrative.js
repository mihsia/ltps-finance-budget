import { fmtNum } from './format';
import { summarizeByCategory } from './awardStats';
import { summarizeSpecialNeeds } from './specialNeedsStats';
import { summarizeClubParticipation } from './clubStats';
import { summarizeParcelValues } from './landStats';

function pctWord(value) {
  return `${value >= 0 ? '增加' : '減少'} ${Math.abs(value).toFixed(2)}%`;
}

function financeNarrative(report) {
  const { kpi, trend, expenseVariance } = report;
  const deltaPct = trend.length ? trend[trend.length - 1].deltaPct : null;
  const deltaClause = deltaPct == null ? '' : `，較上年度${pctWord(deltaPct)}`;
  const shortfallClause = kpi.shortfall > 0
    ? `賸餘 ${fmtNum(kpi.shortfall)} 千元`
    : kpi.shortfall < 0
      ? `短絀 ${fmtNum(Math.abs(kpi.shortfall))} 千元`
      : '收支打平';
  const sentence1 = `${report.meta.year}年度歲出預算為 ${fmtNum(kpi.expenseTotal)} 千元${deltaClause}；歲入預算為 ${fmtNum(kpi.revenueTotal)} 千元，${shortfallClause}。`;

  if (!expenseVariance.rows.length) return sentence1;

  let sentence2;
  if (!expenseVariance.hasActual) {
    sentence2 = '業務計畫別決算資料尚未填列。';
  } else if (!expenseVariance.complete) {
    const missing = expenseVariance.rows.filter((row) => row.actualAmount == null).length;
    sentence2 = `業務計畫別決算資料尚有 ${missing} 項未填列決算。`;
  } else {
    const noted = expenseVariance.rows.filter((row) => row.note && row.deltaPct != null);
    if (noted.length) {
      const biggest = noted.reduce((a, b) => (Math.abs(b.deltaPct) > Math.abs(a.deltaPct) ? b : a));
      const verb = biggest.deltaPct >= 0 ? '超支' : '節省';
      sentence2 = `業務計畫別決算資料已全數到位，其中「${biggest.label}」因${biggest.note}${verb} ${Math.abs(biggest.deltaPct).toFixed(1)}%，其餘項目均在預算內。`;
    } else {
      sentence2 = '業務計畫別決算資料已全數到位，各項目均在預算內。';
    }
  }
  return `${sentence1}${sentence2}`;
}

function basicProfileNarrative(basicProfile) {
  if (!basicProfile) return '';
  const { classes, students, teacherTotal, substituteTotal, substituteRatio, studentTeacherRatio } = basicProfile;
  let sentence = `全校共 ${classes ?? '—'} 班、${students ?? '—'} 位學生，教師員額 ${teacherTotal ?? '—'} 人`;
  if (substituteTotal != null && substituteRatio != null) {
    sentence += `（其中代理教師 ${substituteTotal} 人，占比 ${substituteRatio}%）`;
  }
  sentence += studentTeacherRatio != null ? `，生師比約 ${studentTeacherRatio} : 1。` : '。';
  return sentence;
}

function libraryNarrative(summary) {
  if (!summary) return '';
  let sentence = `圖書藏書量共 ${fmtNum(summary.total)} 冊`;
  if (summary.indigenousBooks > 0) {
    sentence += `，其中族語／原住民書籍 ${fmtNum(summary.indigenousBooks)} 冊`;
    if (summary.total > 0) {
      const pct = Math.round((summary.indigenousBooks / summary.total) * 1000) / 10;
      sentence += `，占整體 ${pct}%`;
    }
  }
  return `${sentence}。`;
}

function languageNarrative(summary) {
  if (!summary) return '';
  const totalStudents = summary.rows.reduce((sum, row) => sum + (Number(row.students) || 0), 0);
  let sentence = `開設族語班共 ${summary.classTotal} 班`;
  if (totalStudents > 0) sentence += `，合計 ${fmtNum(totalStudents)} 位學生參與`;
  return `${sentence}。`;
}

function specialNeedsNarrative(summary, totalStudents) {
  if (!summary) return '';
  let sentence = `特殊教育學生共 ${fmtNum(summary.total)} 人`;
  const categories = summarizeSpecialNeeds(summary.rows, totalStudents);
  if (categories.length) {
    const top = categories.reduce((a, b) => (b.count > a.count ? b : a));
    sentence += `，以「${top.category}」${fmtNum(top.count)} 人最多`;
  }
  return `${sentence}。`;
}

function awardsNarrative(summary) {
  if (!summary) return '';
  let sentence = `本年度獲獎紀錄共 ${fmtNum(summary.count)} 筆`;
  const categories = summarizeByCategory(summary.rows);
  if (categories.length) {
    const top = categories.reduce((a, b) => (b.count > a.count ? b : a));
    sentence += `，以「${top.category}」類別最多，計 ${fmtNum(top.count)} 筆`;
  }
  return `${sentence}。`;
}

function clubNarrative(summary, totalStudents) {
  if (!summary) return '';
  const { totalParticipants, pct } = summarizeClubParticipation(summary.rows, totalStudents);
  let sentence = `開設課後社團共 ${fmtNum(summary.count)} 個，參與學生 ${fmtNum(totalParticipants)} 人`;
  if (pct != null) sentence += `，占全校學生 ${pct}%`;
  return `${sentence}。`;
}

function careSupportNarrative(summary, totalStudents) {
  if (!summary) return '';
  const { totalParticipants, pct } = summarizeClubParticipation(summary.rows, totalStudents);
  let sentence = `開設課照／學扶班共 ${fmtNum(summary.count)} 班，參與學生 ${fmtNum(totalParticipants)} 人`;
  if (pct != null) sentence += `，占全校學生 ${pct}%`;
  return `${sentence}。`;
}

function landNarrative(summary) {
  if (!summary) return '';
  const totalValue = summarizeParcelValues(summary.rows).reduce((sum, entry) => sum + entry.value, 0);
  let sentence = `列管土地共 ${fmtNum(summary.count)} 筆`;
  if (totalValue > 0) sentence += `，總公告現值合計 ${fmtNum(totalValue)} 元`;
  return `${sentence}。`;
}

function inquiryNarrative(summary) {
  if (!summary) return '';
  const pct = summary.total > 0 ? Math.round((summary.resolved / summary.total) * 1000) / 10 : null;
  let sentence = `議會質詢／答詢共 ${fmtNum(summary.total)} 案，已結案 ${fmtNum(summary.resolved)} 案`;
  if (pct != null) sentence += `，結案率 ${pct}%`;
  return `${sentence}。`;
}

const MODULE_NARRATIVE_BUILDERS = {
  library: (summary) => libraryNarrative(summary),
  language: (summary) => languageNarrative(summary),
  specialNeeds: (summary, students) => specialNeedsNarrative(summary, students),
  awards: (summary) => awardsNarrative(summary),
  club: (summary, students) => clubNarrative(summary, students),
  careSupport: (summary, students) => careSupportNarrative(summary, students),
  land: (summary) => landNarrative(summary),
  inquiry: (summary) => inquiryNarrative(summary),
};

/**
 * Builds the system's default draft narrative text for every section of the
 * PDF overview report — one paragraph for 財務概況, one for 校務資料, and one
 * per optional module that has data — purely from the already-built
 * buildOverviewReport() result, so the wording always matches the numbers
 * shown in the report's own tables and charts. These are drafts: an admin
 * can override any of them (see src/hooks/useYearData.js's
 * updateYearReportNarrative + resolveNarratives below), and this function is
 * only ever the fallback when no override has been saved yet.
 */
export function buildDefaultNarratives(report) {
  const modules = {};
  for (const [key, builder] of Object.entries(MODULE_NARRATIVE_BUILDERS)) {
    const summary = report.modules[key];
    if (summary) modules[key] = builder(summary, report.kpi.students);
  }
  return {
    finance: financeNarrative(report),
    basicProfile: basicProfileNarrative(report.basicProfile),
    modules,
  };
}

/**
 * Merges an admin's saved narrative overrides (whatever shape was last
 * written to /years/{year}.reportNarratives — any key may be missing) over
 * the system-generated defaults, section by section. A missing or null
 * `saved` leaves every default untouched.
 */
export function resolveNarratives(defaults, saved) {
  const savedModules = saved?.modules || {};
  const modules = {};
  for (const key of Object.keys(defaults.modules)) {
    modules[key] = savedModules[key] ?? defaults.modules[key];
  }
  return {
    finance: saved?.finance ?? defaults.finance,
    basicProfile: saved?.basicProfile ?? defaults.basicProfile,
    modules,
  };
}
