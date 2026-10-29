import { fmtNum } from './format';
import { summarizeByCategory } from './awardStats';
import { summarizeSpecialNeeds } from './specialNeedsStats';
import { summarizeClubParticipation } from './clubStats';
import { summarizeParcelValues, SCHOOL_LAND_TOTAL_AREA_HECTARES } from './landStats';
import { LANGUAGE_OPTIONS } from './recordSchemas';

// LANGUAGE_OPTIONS lists 本土語（閩南語、客語）first, then every 原住民族語
// — reused here to split a school's open 族語班 into those two groups for
// 分組審查摘要, without a second hardcoded language list to keep in sync.
const LOCAL_LANGUAGES = new Set(LANGUAGE_OPTIONS.slice(0, 2));

function pctWord(value) {
  return `${value >= 0 ? '增加' : '減少'} ${Math.abs(value).toFixed(2)}%`;
}

// "（占全校 X%）", or '' when there's no student total to divide by — used
// by reviewSummaryNarrative's 原住民／新住民學生 clauses (2026-10-29 補充：
// 分組審查口頭報告原本只唸人數，沒有占比，比對校長實際使用的講稿後加上）.
function pctClause(count, totalStudents) {
  if (!totalStudents) return '';
  const pct = Math.round((count / totalStudents) * 1000) / 10;
  return `（占全校 ${pct}%）`;
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
  sentence += '。';
  if (summary.budget) {
    sentence += `本年度圖書經費規劃 ${fmtNum(Number(summary.budget))} 千元`;
    sentence += summary.plan ? `，用途：${summary.plan}。` : '。';
  }
  return sentence;
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
  let sentence = `校地總面積 ${SCHOOL_LAND_TOTAL_AREA_HECTARES} 公頃，列管土地共 ${fmtNum(summary.count)} 筆`;
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

function specialNeedsCategoryCount(rows, category) {
  return (rows || [])
    .filter((row) => row.category === category)
    .reduce((sum, row) => sum + (Number(row.count) || 0), 0);
}

/**
 * Compiles the two paragraphs a校長 reads aloud for 議會分組預算審查（小組
 * 審查以每校不超過 1 分鐘為原則）— one 校務現況段落 covering 校長服務年
 * 資／班級學生數（含原住民、新住民）／族語認證／族語與本土語開課／競賽
 * 成績／特色社團, one 預算與人力段落 covering 歲出年增減／代理教師／運
 * 動教練／校護／AED／圖書經費規劃. Everything here is read straight off
 * buildOverviewReport()'s own result — no separate data entry — so a
 * missing figure just drops its clause instead of showing a placeholder.
 * 補辦預算之情形與族語認證報名人數目前系統沒有對應資料，不在此自動產
 * 生；需要時可由管理者在這段文字後手動補上一句，儲存即成為自訂版本。
 */
function reviewSummaryNarrative(report) {
  const basic = report.basicProfile;
  const specialNeedsRows = report.modules.specialNeeds?.rows;
  const language = report.modules.language;
  const library = report.modules.library;
  const awards = report.modules.awards;
  const club = report.modules.club;

  const part1 = [];
  if (basic?.principalTotalTenure || basic?.principalTenure) {
    part1.push(`校長服務總年資 ${basic.principalTotalTenure || '—'} 年（擔任校長 ${basic.principalTenure || '—'} 年）`);
  }
  if (basic) {
    const indigenous = specialNeedsCategoryCount(specialNeedsRows, '原住民');
    const newResident = specialNeedsCategoryCount(specialNeedsRows, '新住民');
    let sentence = `全校 ${basic.classes ?? '—'} 班、${basic.students ?? '—'} 位學生`;
    if (indigenous || newResident) {
      const totalStudents = Number(basic.students) || 0;
      const subClauses = [];
      if (indigenous) subClauses.push(`原住民學生 ${indigenous} 人${pctClause(indigenous, totalStudents)}`);
      if (newResident) subClauses.push(`新住民學生 ${newResident} 人${pctClause(newResident, totalStudents)}`);
      sentence += `，其中${subClauses.join('、')}`;
    }
    part1.push(sentence);
  }
  if (language) {
    const langs = [...new Set((language.rows || []).map((row) => row.lang).filter(Boolean))];
    const indigenousLangs = langs.filter((lang) => !LOCAL_LANGUAGES.has(lang));
    const localLangs = langs.filter((lang) => LOCAL_LANGUAGES.has(lang));
    const clauses = [];
    if (indigenousLangs.length) clauses.push(`開設原住民族語班（${indigenousLangs.join('、')}）`);
    if (localLangs.length) clauses.push(`開設本土語班（${localLangs.join('、')}）`);
    if (language.certifiedStudents) clauses.push(`學生通過族語認證 ${language.certifiedStudents} 人`);
    if (clauses.length) part1.push(clauses.join('，'));
  }
  if (awards) {
    const categories = summarizeByCategory(awards.rows);
    let sentence = `本年度獲獎紀錄共 ${fmtNum(awards.count)} 筆`;
    if (categories.length) {
      const top = categories.reduce((a, b) => (b.count > a.count ? b : a));
      sentence += `，以「${top.category}」類別最多`;
    }
    part1.push(sentence);
  }
  if (club) part1.push(`特色社團共 ${fmtNum(club.count)} 個`);
  // 「各位議座好，」起手式——比對校長實際議會分組審查口頭報告講稿後加上
  // 的開場問候語，讓這段唸起來像一段完整報告的開頭，而不是從「校長服務
  // 年資…」這句中途開始（2026-10-29 補充）。沒有任何其他資料可唸時（見
  // 下方「omits every clause…」的空字串情形）不附加問候語，維持原本的
  // 空字串語意。
  const paragraph1 = part1.length ? `各位議座好，${part1.join('；')}。` : '';

  const part2 = [];
  const deltaPct = report.trend.length ? report.trend[report.trend.length - 1].deltaPct : null;
  if (deltaPct != null) part2.push(`本年度歲出預算較上年度${pctWord(deltaPct)}`);
  if (basic) {
    const staffing = [];
    if (basic.substituteTotal != null) staffing.push(`代理教師 ${basic.substituteTotal} 人`);
    if (basic.sportsCoaches) staffing.push(`運動教練 ${basic.sportsCoaches} 人`);
    if (basic.schoolNurses) staffing.push(`校護 ${basic.schoolNurses} 人`);
    if (staffing.length) part2.push(staffing.join('、'));
    if (basic.aedCount || basic.aedCertifiedTeachers) {
      part2.push(`AED ${basic.aedCount || 0} 台，有證照可操作教師 ${basic.aedCertifiedTeachers || 0} 人`);
    }
  }
  if (library?.budget) {
    let sentence = `圖書經費規劃 ${fmtNum(Number(library.budget))} 千元`;
    if (library.plan) sentence += `（${library.plan}）`;
    part2.push(sentence);
  }
  const paragraph2 = part2.length ? `${part2.join('；')}。` : '';

  return [paragraph1, paragraph2].filter(Boolean).join('\n\n');
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
    reviewSummary: reviewSummaryNarrative(report),
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
    reviewSummary: saved?.reviewSummary ?? defaults.reviewSummary,
    finance: saved?.finance ?? defaults.finance,
    basicProfile: saved?.basicProfile ?? defaults.basicProfile,
    modules,
  };
}
