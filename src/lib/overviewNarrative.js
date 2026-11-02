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
// by reviewSummaryNarrative's 新住民學生 clause (2026-10-29 補充：分組審查
// 口頭報告原本只唸人數，沒有占比，比對校長實際使用的講稿後加上）.
function pctClause(count, totalStudents) {
  if (!totalStudents) return '';
  const pct = Math.round((count / totalStudents) * 1000) / 10;
  return `（占全校 ${pct}%）`;
}

// "（占全校 X%，阿美族 10 人、泰雅族 7 人）" — combines the 占全校 X% figure
// with the optional 原住民學生族別 breakdown into one parenthetical instead
// of two back-to-back ones, which read awkwardly aloud (2026-11-02 分組審查
// 講稿比對收尾階段).
function pctAndEthnicityClause(count, totalStudents, breakdown) {
  const pct = totalStudents ? `占全校 ${Math.round((count / totalStudents) * 1000) / 10}%` : '';
  const parts = [pct, breakdown].filter(Boolean);
  return parts.length ? `（${parts.join('，')}）` : '';
}

// Formats a 千元-denominated amount (the unit every budget figure in this
// app is stored and tabulated in) as spoken 中文萬／千 grouping — "5,608
// 萬 9 千元" — instead of "56,089 千元", which is how every table in the
// report shows the same number but reads awkwardly aloud (the "千元" unit
// label doubling up against a number already grouped in thousands). Only
// used inside 分組審查摘要's own sentences below; every table and chart
// elsewhere keeps its existing fmtNum(...) + "千元" convention unchanged
// (2026-11-02 比對校長實際議會報告講稿後新增).
function fmtWan(thousandYuanAmount) {
  const yuan = Math.round(Number(thousandYuanAmount) || 0) * 1000;
  const wan = Math.trunc(yuan / 10000);
  const qian = Math.round((yuan - wan * 10000) / 1000);
  if (wan === 0) return `${qian} 千元`;
  if (qian === 0) return `${fmtNum(wan)} 萬元`;
  return `${fmtNum(wan)} 萬 ${qian} 千元`;
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

function buildingNarrative(summary) {
  if (!summary) return '';
  const totalArea = summary.rows.reduce((sum, row) => sum + (Number(row.floorArea) || 0), 0);
  const retrofitted = summary.rows.filter((row) => row.seismicStatus === '已完成耐震補強').length;
  let sentence = `校舍共 ${fmtNum(summary.count)} 棟`;
  if (totalArea > 0) sentence += `，總樓地板面積 ${fmtNum(totalArea)} ㎡`;
  if (retrofitted > 0) sentence += `，其中 ${fmtNum(retrofitted)} 棟已完成耐震補強`;
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

// "阿美族 10 人、泰雅族 7 人" — 原住民學生按族別分組加總人數，只用在類別
// 為「原住民」且有填族別（ethnicity）的列；沒有填族別的列仍計入原住民學
// 生總數（見上方 specialNeedsCategoryCount），只是不會出現在這個細分裡
// （2026-11-02 分組審查講稿比對收尾階段新增）。
function specialNeedsEthnicityBreakdown(rows, category) {
  const counts = new Map();
  for (const row of rows || []) {
    if (row.category !== category || !row.ethnicity) continue;
    counts.set(row.ethnicity, (counts.get(row.ethnicity) || 0) + (Number(row.count) || 0));
  }
  return [...counts.entries()].map(([ethnicity, count]) => `${ethnicity} ${count} 人`).join('、');
}

/**
 * Compiles the paragraphs a校長 reads aloud for 議會分組預算審查——one 校務
 * 現況段落 covering 校長服務年資／班級學生數（含原住民、新住民及原住民學
 * 生族別）／族語認證與報名／族語與本土語開課（含授課方式）／競賽成績／
 * 特色社團, one 預算與人力段落 covering 歲出年增減（含主要原因）／代理
 * 教師／原住民籍教師／運動教練／校護／AED／圖書經費規劃, and an optional
 * closing 學校願景／辦學特色 paragraph. Everything here is read straight
 * off buildOverviewReport()'s own result — no separate data entry — so a
 * missing figure just drops its clause instead of showing a placeholder.
 * （原本的「不超過 1 分鐘」原則已於 2026-11-02 放寬，見 README；本函式
 * 現在涵蓋校長實際講稿的每一項內容。）
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
      if (indigenous) {
        const ethnicityDetail = specialNeedsEthnicityBreakdown(specialNeedsRows, '原住民');
        subClauses.push(`原住民學生 ${indigenous} 人${pctAndEthnicityClause(indigenous, totalStudents, ethnicityDetail)}`);
      }
      if (newResident) subClauses.push(`新住民學生 ${newResident} 人${pctClause(newResident, totalStudents)}`);
      sentence += `，其中${subClauses.join('、')}`;
    }
    part1.push(sentence);
  }
  if (language) {
    // Per-language 班／人數 instead of just the language names — the
    // counts were already sitting in language.rows (classRows), just not
    // surfaced in this clause's wording (2026-11-02 比對校長實際講稿後
    // 加上，講稿裡每個語言都報了開班數跟學生數，不是只唸語言名稱清單).
    // 同一語系可能分成好幾列登記（例如同一語系的實體授課跟直播共學各一
    // 列），所以用加總而不是只取第一列；授課方式有登記的話一併附註，同一
    // 語系出現超過一種授課方式就全部列出（2026-11-02 分組審查講稿比對收
    // 尾階段：族語開班新增「授課方式」欄位後，這段文字才開始使用它）。
    const langDetail = (lang) => {
      const rows = (language.rows || []).filter((r) => r.lang === lang);
      const classes = rows.reduce((sum, r) => sum + (Number(r.classes) || 0), 0);
      const students = rows.reduce((sum, r) => sum + (Number(r.students) || 0), 0);
      const modes = [...new Set(rows.map((r) => r.deliveryMode).filter(Boolean))];
      return `${lang} ${classes} 班、${students} 人${modes.length ? `（${modes.join('、')}）` : ''}`;
    };
    const langs = [...new Set((language.rows || []).map((row) => row.lang).filter(Boolean))];
    const indigenousLangs = langs.filter((lang) => !LOCAL_LANGUAGES.has(lang));
    const localLangs = langs.filter((lang) => LOCAL_LANGUAGES.has(lang));
    const clauses = [];
    if (indigenousLangs.length) clauses.push(`開設原住民族語班（${indigenousLangs.map(langDetail).join('；')}）`);
    if (localLangs.length) clauses.push(`開設本土語班（${localLangs.map(langDetail).join('；')}）`);
    // 通過人數同樣改為按語系／級別細分，而非只報一個總數——這份細節其實
    // 早就存在「族語認證」通過名冊裡（language.certifiedRows），只是這段
    // 文字原本沒有拿來用，只用了總筆數（2026-11-02）。
    if (language.certifiedRows?.length) {
      const counts = new Map();
      for (const row of language.certifiedRows) {
        const key = `${row.lang}\u0000${row.level}`;
        const entry = counts.get(key) || { lang: row.lang, level: row.level, count: 0 };
        entry.count += 1;
        counts.set(key, entry);
      }
      const detail = [...counts.values()].map((c) => `${c.lang}${c.level} ${c.count} 位`).join('；');
      clauses.push(`學生通過族語認證共 ${language.certifiedStudents} 人（${detail}）`);
    } else if (language.certifiedStudents) {
      clauses.push(`學生通過族語認證 ${language.certifiedStudents} 人`);
    }
    // 預計報名下一場族語認證考試、還不確定會不會通過的學生——跟上面已經
    // 通過的 certifiedRows 是分開的兩份名冊（見「族語認證」頁的「族語認
    // 證報名名冊」，2026-11-02 分組審查講稿比對收尾階段新增）。
    if (language.registrationRows?.length) {
      const counts = new Map();
      for (const row of language.registrationRows) {
        const key = `${row.lang}\u0000${row.level}`;
        const entry = counts.get(key) || { lang: row.lang, level: row.level, count: 0 };
        entry.count += 1;
        counts.set(key, entry);
      }
      const detail = [...counts.values()].map((c) => `${c.lang}${c.level} ${c.count} 位`).join('；');
      clauses.push(`預計報名族語認證共 ${language.registrationRows.length} 人（${detail}）`);
    }
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
  // 金額唸法改用「5,608 萬 9 千元」中文萬／千分組，比對校長實際講稿後
  // 發現「56,089 千元」這種純千元逗號分組唸起來不自然；同時把「增加多
  // 少金額」也唸出來，不是只有百分比（2026-11-02）。只在有上一年度可
  // 比較時才顯示，沒有比較基準時維持原本整句省略（不是只省略百分比）。
  if (report.trend.length) {
    const last = report.trend[report.trend.length - 1];
    if (last.deltaPct != null) {
      const prev = report.trend[report.trend.length - 2];
      const delta = last.expenseTotal - prev.expenseTotal;
      const verb = delta >= 0 ? '增加' : '減少';
      const magnitudeWord = delta >= 0 ? '增幅' : '減幅';
      let sentence = `${report.meta.year} 年度預算編列為 ${fmtWan(last.expenseTotal)}，較上年度的 ${fmtWan(prev.expenseTotal)}，${verb} ${fmtWan(Math.abs(delta))}，${magnitudeWord}約 ${Math.abs(last.deltaPct).toFixed(2)}%`;
      // 歲出增減主要原因——校長在基本資料頁填寫的一句話說明（2026-11-02
      // 分組審查講稿比對收尾階段新增，見 Basic.jsx 的 expenseChangeReason）。
      if (basic?.expenseChangeReason) sentence += `，${basic.expenseChangeReason}`;
      part2.push(sentence);
    }
  }
  if (basic) {
    const staffing = [];
    if (basic.substituteTotal != null) staffing.push(`代理教師 ${basic.substituteTotal} 人`);
    if (basic.indigenousTeachers) {
      const ethnicityNote = basic.indigenousTeacherEthnicities ? `（${basic.indigenousTeacherEthnicities}）` : '';
      staffing.push(`原住民籍教師 ${basic.indigenousTeachers} 人${ethnicityNote}`);
    }
    if (basic.sportsCoaches) staffing.push(`運動教練 ${basic.sportsCoaches} 人`);
    if (basic.schoolNurses) staffing.push(`校護 ${basic.schoolNurses} 人`);
    if (staffing.length) part2.push(staffing.join('、'));
    if (basic.aedCount || basic.aedCertifiedTeachers) {
      part2.push(`AED ${basic.aedCount || 0} 台，有證照可操作教師 ${basic.aedCertifiedTeachers || 0} 人`);
    }
  }
  if (library?.budget) {
    let sentence = `圖書經費規劃 ${fmtWan(Number(library.budget))}`;
    if (library.plan) sentence += `（${library.plan}）`;
    part2.push(sentence);
  }
  const paragraph2 = part2.length ? `${part2.join('；')}。` : '';

  // 學校願景／辦學特色——校長在基本資料頁填寫的一段自由文字，原樣當作
  // 收尾段落（不加其他措辭），管理者填的就是要唸的（2026-11-02 分組審查
  // 講稿比對收尾階段新增，見 Basic.jsx 的 schoolVision）。
  const paragraph3 = basic?.schoolVision ? basic.schoolVision.trim() : '';

  return [paragraph1, paragraph2, paragraph3].filter(Boolean).join('\n\n');
}

const MODULE_NARRATIVE_BUILDERS = {
  library: (summary) => libraryNarrative(summary),
  language: (summary) => languageNarrative(summary),
  specialNeeds: (summary, students) => specialNeedsNarrative(summary, students),
  awards: (summary) => awardsNarrative(summary),
  club: (summary, students) => clubNarrative(summary, students),
  careSupport: (summary, students) => careSupportNarrative(summary, students),
  land: (summary) => landNarrative(summary),
  building: (summary) => buildingNarrative(summary),
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
