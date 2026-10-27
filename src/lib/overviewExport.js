import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { registerCjkFont } from './pdfFont';
import { fmtNum, fmtDate } from './format';
import { OPTIONAL_MODULE_DETAIL_FIELDS, OPTIONAL_MODULE_TILE_COLORS } from './overviewReport';
import { buildDefaultNarratives } from './overviewNarrative';

const MODULE_LABELS = {
  library: '圖書藏書量',
  language: '族語開班（班級數總和）',
  specialNeeds: '特生統計（總人數）',
  awards: '獲獎紀錄（筆數）',
  club: '課後社團（社團數）',
  careSupport: '課照學扶（班別數）',
  land: '校地概況（地號數）',
  inquiry: '議會質詢答詢（已結案／總數）',
};

// A pale fill + its own dark ink per section — the 議會報表 PDF's 模版 D
// palette (2026-10-27 設計定案), reusing each module's OPTIONAL_MODULE_TILE_COLORS
// pair (src/lib/overviewReport.js) so a module's table looks the same whether
// it's read on screen or in the PDF; the non-module sections below get their
// own pairs in the same family (expense-side tables in the 歲出 terracotta,
// revenue in the 歲入 blue). Pale fill + dark text replaces the old solid-
// colour-fill-with-white-text header, and callers also pass theme:'plain' to
// drop jspdf-autotable's default striped rows — both were flagged as
// generated-dashboard "tells" (saturated header bands, zebra striping) in
// this round's design review.
const SECTION_TILE_COLORS = {
  kpi: { soft: '#E9F1EE', ink: '#0F3A30' },
  trend: { soft: '#FDEEE0', ink: '#8A4A1E' },
  variance: { soft: '#FDF6DC', ink: '#7A5A0A' },
  revenue: { soft: '#DCF1FF', ink: '#0A3A80' },
  basicProfile: { soft: '#F5E9F7', ink: '#5C2E66' },
  ...OPTIONAL_MODULE_TILE_COLORS,
};

function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function pctText(value) {
  if (value == null) return '—';
  return `${value >= 0 ? '▲' : '▼'} ${Math.abs(value).toFixed(2)}%`;
}

function moduleValueText(key, summary) {
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

function detailCell(value) {
  if (value == null || value === '') return '—';
  return typeof value === 'number' ? fmtNum(value) : value;
}

/** The itemized detail rows for one module, as [[header...], [row...], ...], or [] when there's nothing to itemize. */
function moduleDetailTable(key, summary) {
  const fields = OPTIONAL_MODULE_DETAIL_FIELDS[key];
  if (!fields || !summary.rows || !summary.rows.length) return [];
  return [
    fields.map((field) => field.label),
    ...summary.rows.map((row) => fields.map((field) => detailCell(row[field.key]))),
  ];
}

/** Builds the one-sheet "全貌總覽" Excel workbook from a buildOverviewReport() result. */
export function buildOverviewWorkbook(report, { selectedModules } = {}) {
  const rows = [
    [`${report.meta.year}年度 利澤國小基金總覽報表`],
    [`製表：${report.meta.who} · 產出時間：${fmtDate(report.meta.generatedAt)}`],
    [],
    ['關鍵指標', ''],
    [`${report.meta.year}年度歲出預算（千元）`, fmtNum(report.kpi.expenseTotal)],
    [`${report.meta.year}年度歲入預算（千元）`, fmtNum(report.kpi.revenueTotal)],
    ['本期賸餘（短絀為負）', fmtNum(report.kpi.shortfall)],
    ['學生人數', report.kpi.students ?? '—'],
    ['班級數', report.kpi.classes ?? '—'],
    ['代理教師占比', report.kpi.substituteRatio == null ? '—' : `${report.kpi.substituteRatio}%`],
    ['圖書藏書量', report.kpi.libraryTotal == null ? '—' : fmtNum(report.kpi.libraryTotal)],
    [],
    ['財務概況'],
    ['歲出三年比較（千元）'],
    ['年度', '金額', '較上年增減'],
    ...report.trend.map((entry) => [`${entry.year}年度`, fmtNum(entry.expenseTotal), pctText(entry.deltaPct)]),
    [],
    ['業務計畫別預算與決算（千元）'],
    ['項目', '內容說明', '預算金額', '決算金額', '較預算增減', '差異原因說明'],
    ...report.expenseVariance.rows.map((row) => [
      row.label, row.formula, fmtNum(row.budgetAmount),
      row.actualAmount == null ? '—' : fmtNum(row.actualAmount),
      pctText(row.deltaPct), row.note || '—',
    ]),
    ['合計', '', fmtNum(report.expenseVariance.budgetTotal), report.expenseVariance.hasActual ? fmtNum(report.expenseVariance.actualTotal) : '—', '', ''],
    [],
    ['歲入明細（千元）'],
    ['來源項目', '金額'],
    ...report.revenue.rows.map((row) => [row.label, fmtNum(row.amount)]),
    ['合計', fmtNum(report.revenue.total)],
  ];

  if (report.basicProfile) {
    rows.push(
      [],
      ['校務資料'],
      ['學校基本資料'],
      ['班級數', report.basicProfile.classes, '學生人數', report.basicProfile.students],
      ['教師員額', report.basicProfile.staff, '正式教師', report.basicProfile.regularTeachers],
      ['代理教師（懸缺代理）', report.basicProfile.substituteVacancy, '代理教師（增置員額）', report.basicProfile.substituteAdditional],
      ['代課老師', report.basicProfile.partTimeTeachers, '代理教師合計', report.basicProfile.substituteTotal],
      ['生師比', report.basicProfile.studentTeacherRatio == null ? '—' : `${report.basicProfile.studentTeacherRatio} : 1`, '代理教師占比', report.basicProfile.substituteRatio == null ? '—' : `${report.basicProfile.substituteRatio}%`],
      ['學雜費（各年級平均，元）', report.basicProfile.tuitionFeeAvg ?? '—', '午餐補助（全年度，千元）', report.basicProfile.lunchSubsidyTotal ?? '—'],
    );
  }

  const moduleKeys = (selectedModules || Object.keys(MODULE_LABELS)).filter((key) => report.modules[key]);
  if (moduleKeys.length) {
    rows.push([], ['各模組現況'], ['模組', '現況']);
    for (const key of moduleKeys) {
      const summary = report.modules[key];
      rows.push([MODULE_LABELS[key], moduleValueText(key, summary)]);
      for (const detailRow of moduleDetailTable(key, summary)) rows.push(['', ...detailRow]);
    }
  }

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws['!cols'] = [{ wch: 26 }, { wch: 22 }, { wch: 16 }, { wch: 16 }, { wch: 16 }, { wch: 32 }];
  XLSX.utils.book_append_sheet(wb, ws, '基金總覽報表');
  return wb;
}

function sectionStyles(fontName, tile) {
  return {
    theme: 'plain',
    headStyles: { fillColor: hexToRgb(tile.soft), textColor: hexToRgb(tile.ink), font: fontName, fontStyle: 'bold' },
    bodyStyles: { font: fontName, fontStyle: 'normal', textColor: [30, 36, 32] },
    styles: { font: fontName },
  };
}

/**
 * Renders the same report into a jsPDF document with the embedded Chinese
 * font, colored per-section headers, and page-number footers.
 *
 * The body leads with a short narrative paragraph per zone/module (an
 * admin-editable draft — see src/lib/overviewNarrative.js — auto-generated
 * here when the caller doesn't pass one) plus that zone's chart(s), so a
 * reader gets "what happened" before any table. Every itemized/逐筆 detail
 * table (業務計畫別明細、歲入明細、each module's row-by-row table) is held
 * back and rendered together, in the same order, on a fresh page headed
 * "附件：詳細資料" at the very end — nothing is dropped, it's just grouped
 * as a reference appendix instead of interrupting the narrative flow.
 * 校務資料 is the one exception: its table was already short (≤7 rows), so
 * it's simply replaced by its narrative paragraph in the body, with no
 * appendix counterpart.
 */
export async function buildOverviewPdf(report, {
  selectedModules, chartImages = {}, narratives = buildDefaultNarratives(report),
} = {}) {
  const doc = new jsPDF();
  const fontName = await registerCjkFont(doc);

  doc.setFont(fontName, 'bold');
  doc.setFontSize(16);
  doc.text(`${report.meta.year}年度 利澤國小基金總覽報表`, 14, 16);
  doc.setFont(fontName, 'normal');
  doc.setFontSize(10);
  doc.text(`製表：${report.meta.who} · 產出時間：${fmtDate(report.meta.generatedAt)}`, 14, 23);

  let y = 28;
  const ZONE_GAP = 15;
  const TABLE_GAP = 6;

  function table(opts) {
    autoTable(doc, { startY: y, ...opts });
    y = doc.lastAutoTable.finalY;
  }

  // CSS pixels (the unit img.width/height arrive in — see chartCapture.js)
  // are nominally 96 per inch; converting at that rate lands the image in
  // the PDF at (up to the caps below) the same physical size it had on the
  // web page, instead of always being stretched up to a fixed width. A
  // small 2-bar chart therefore stays small and a wider one stays wider —
  // the earlier fixed-150mm-wide version made every chart balloon to
  // roughly half the page regardless of how little it had to show.
  const PX_TO_MM = 25.4 / 96;

  // Embeds one PNG snapshot of a live web-page chart (captured by Report.jsx
  // via html2canvas just before export, keyed e.g. "finance.expenseTrend" /
  // "module.awards") directly below the table it illustrates, so the PDF
  // reads with the same charts as the 議會報表匯出 page instead of tables
  // alone. A no-op when that chart wasn't captured (e.g. older callers/tests
  // that don't pass chartImages) — table spacing stays exactly as before.
  // maxWidth/maxHeight here are only a safety ceiling (a chart captured from
  // an unusually wide browser window), not the default display size.
  function addChartImage(img, { maxWidth = 100, maxHeight = 55 } = {}) {
    if (!img) return;
    if (y > doc.internal.pageSize.getHeight() - 50) {
      doc.addPage();
      y = 20;
    } else {
      y += TABLE_GAP;
    }
    let w = img.width * PX_TO_MM;
    let h = img.height * PX_TO_MM;
    if (w > maxWidth) {
      h *= maxWidth / w;
      w = maxWidth;
    }
    if (h > maxHeight) {
      w *= maxHeight / h;
      h = maxHeight;
    }
    doc.addImage(img.dataUrl, 'PNG', 14, y, w, h);
    y += h + TABLE_GAP;
  }

  function zoneHeader(label) {
    if (y > doc.internal.pageSize.getHeight() - 30) {
      doc.addPage();
      y = 20;
    } else {
      y += ZONE_GAP;
    }
    doc.setFont(fontName, 'bold');
    doc.setFontSize(12);
    doc.setTextColor(30, 36, 32);
    doc.text(label, 14, y);
    doc.setDrawColor(227, 223, 211);
    doc.setLineWidth(0.4);
    doc.line(14, y + 2.5, doc.internal.pageSize.getWidth() - 14, y + 2.5);
    y += 8;
  }

  // One paragraph of admin-editable draft text per zone/module (see
  // src/lib/overviewNarrative.js), wrapped to the page width and placed
  // before that section's chart(s), so a reader gets "what happened" before
  // any number. A no-op for an empty string (e.g. 校務資料 when no basic
  // profile was ever filled in).
  function addNarrative(text) {
    if (!text) return;
    const maxWidth = doc.internal.pageSize.getWidth() - 28;
    const lines = doc.splitTextToSize(text, maxWidth);
    const lineHeight = 5.2;
    const blockHeight = lines.length * lineHeight;
    if (y + blockHeight > doc.internal.pageSize.getHeight() - 20) {
      doc.addPage();
      y = 20;
    } else {
      y += TABLE_GAP;
    }
    doc.setFont(fontName, 'normal');
    doc.setFontSize(10.5);
    doc.setTextColor(69, 75, 69);
    doc.text(lines, 14, y);
    y += blockHeight + TABLE_GAP;
  }

  // A smaller, module-colored heading for one module's own subsection inside
  // 各模組現況 — lighter than zoneHeader (no rule, no big gap before it)
  // since it introduces one module among several in the same zone, not a
  // new zone.
  function moduleSubHeading(label, color) {
    if (y > doc.internal.pageSize.getHeight() - 30) {
      doc.addPage();
      y = 20;
    } else {
      y += TABLE_GAP + 2;
    }
    doc.setFont(fontName, 'bold');
    doc.setFontSize(11.5);
    doc.setTextColor(...hexToRgb(color));
    doc.text(label, 14, y);
    y += 6;
  }

  // 分組審查摘要 — placed before even 關鍵指標 so it's the very first thing
  // on the page: a 1-2 段文字的 school-side summary built for the 議會分組
  // 預算審查「每校報告不超過 1 分鐘」場合(see overviewNarrative.js's
  // reviewSummaryNarrative). A no-op when there's nothing to report yet.
  if (narratives.reviewSummary) {
    zoneHeader('分組審查摘要（審查報告用）');
    addNarrative(narratives.reviewSummary);
  }

  // 關鍵指標 — the headline summary, shown before any zone (matches the web
  // page's top KPI row, which also sits outside the zone grouping).
  table({
    head: [['關鍵指標', '數值']],
    body: [
      [`${report.meta.year}年度歲出預算（千元）`, fmtNum(report.kpi.expenseTotal)],
      [`${report.meta.year}年度歲入預算（千元）`, fmtNum(report.kpi.revenueTotal)],
      ['本期賸餘（短絀為負，千元）', fmtNum(report.kpi.shortfall)],
      ['學生人數 / 班級數', `${report.kpi.students ?? '—'} 人 / ${report.kpi.classes ?? '—'} 班`],
      ['代理教師占比', report.kpi.substituteRatio == null ? '—' : `${report.kpi.substituteRatio}%`],
      ['圖書藏書量', report.kpi.libraryTotal == null ? '—' : `${fmtNum(report.kpi.libraryTotal)} 冊`],
    ],
    ...sectionStyles(fontName, SECTION_TILE_COLORS.kpi),
  });

  zoneHeader('財務概況');
  addNarrative(narratives.finance);
  addChartImage(chartImages['finance.expenseTrend']);
  addChartImage(chartImages['finance.revenueSource']);

  if (report.basicProfile) {
    zoneHeader('校務資料');
    addNarrative(narratives.basicProfile);
  }

  const moduleKeys = (selectedModules || Object.keys(MODULE_LABELS)).filter((key) => report.modules[key]);
  if (moduleKeys.length) {
    zoneHeader('各模組現況');
    for (const key of moduleKeys) {
      moduleSubHeading(MODULE_LABELS[key], (SECTION_TILE_COLORS[key] || SECTION_TILE_COLORS.kpi).ink);
      addNarrative(narratives.modules[key]);
      addChartImage(chartImages[`module.${key}`]);
    }
  }

  // --- 附件：詳細資料 --- every itemized/逐筆 table the body above used to
  // show inline now lives here instead, on its own fresh page: 財務概況's
  // three tables (unconditional, same as the zone above), then one colored
  // detail table per module that actually has itemized rows, in the same
  // order as the body's module loop just walked.
  doc.addPage();
  y = 20;
  doc.setFont(fontName, 'bold');
  doc.setFontSize(14);
  doc.setTextColor(30, 36, 32);
  doc.text('附件：詳細資料', 14, y);
  doc.setDrawColor(227, 223, 211);
  doc.setLineWidth(0.6);
  doc.line(14, y + 3, doc.internal.pageSize.getWidth() - 14, y + 3);
  y += 12;

  table({
    head: [['歲出三年比較', '金額（千元）', '較上年增減']],
    body: report.trend.map((entry) => [`${entry.year}年度`, fmtNum(entry.expenseTotal), pctText(entry.deltaPct)]),
    ...sectionStyles(fontName, SECTION_TILE_COLORS.trend),
  });
  y += TABLE_GAP;
  table({
    head: [['業務計畫別項目', '預算金額', '決算金額', '增減', '差異原因說明']],
    body: [
      ...report.expenseVariance.rows.map((row) => [
        row.label, fmtNum(row.budgetAmount),
        row.actualAmount == null ? '—' : fmtNum(row.actualAmount),
        pctText(row.deltaPct), row.note || '—',
      ]),
      ['合計', fmtNum(report.expenseVariance.budgetTotal), report.expenseVariance.hasActual ? fmtNum(report.expenseVariance.actualTotal) : '—', '', ''],
    ],
    ...sectionStyles(fontName, SECTION_TILE_COLORS.variance),
  });
  y += TABLE_GAP;
  table({
    head: [['歲入來源', '金額（千元）']],
    body: [
      ...report.revenue.rows.map((row) => [row.label, fmtNum(row.amount)]),
      ['合計', fmtNum(report.revenue.total)],
    ],
    ...sectionStyles(fontName, SECTION_TILE_COLORS.revenue),
  });

  for (const key of moduleKeys) {
    const detail = moduleDetailTable(key, report.modules[key]);
    if (!detail.length) continue;
    y += TABLE_GAP;
    table({
      head: [[{ content: MODULE_LABELS[key], colSpan: detail[0].length }], detail[0]],
      body: detail.slice(1),
      ...sectionStyles(fontName, SECTION_TILE_COLORS[key] || SECTION_TILE_COLORS.kpi),
    });
  }

  const totalPages = doc.internal.getNumberOfPages();
  for (let page = 1; page <= totalPages; page += 1) {
    doc.setPage(page);
    doc.setFont(fontName, 'normal');
    doc.setFontSize(9);
    doc.setTextColor(138, 144, 137);
    doc.text(
      `第 ${page} 頁，共 ${totalPages} 頁`,
      doc.internal.pageSize.getWidth() - 14,
      doc.internal.pageSize.getHeight() - 8,
      { align: 'right' },
    );
  }

  return doc;
}
