import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { registerCjkFont } from './pdfFont';
import { fmtNum, fmtDate } from './format';
import { OPTIONAL_MODULE_DETAIL_FIELDS, OPTIONAL_MODULE_COLORS } from './overviewReport';

const MODULE_LABELS = {
  library: '圖書藏書量',
  language: '族語開班（班級數總和）',
  specialNeeds: '特生統計（總人數）',
  awards: '獲獎紀錄（筆數）',
  club: '課後社團（社團數）',
  land: '土地現值（地號數）',
  inquiry: '議會質詢答詢（已結案／總數）',
};

// One accent color per section, reused from the sidebar nav's per-module
// colors (src/lib/nav.js) so the PDF's colored header blocks stay visually
// consistent with the rest of the app instead of introducing a new palette.
const SECTION_COLORS = {
  kpi: '#1F5F52',
  trend: '#B5533E',
  variance: '#B5533E',
  revenue: '#3E8E7E',
  basicProfile: '#C9832F',
  ...OPTIONAL_MODULE_COLORS,
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
      ['學校基本資料'],
      ['班級數', report.basicProfile.classes, '學生人數', report.basicProfile.students],
      ['教師員額', report.basicProfile.staff, '正式教師', report.basicProfile.regularTeachers],
      ['代理教師（懸缺代理）', report.basicProfile.substituteVacancy, '代理教師（增置員額）', report.basicProfile.substituteAdditional],
      ['兼任教師', report.basicProfile.partTimeTeachers, '代理教師合計', report.basicProfile.substituteTotal],
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

function sectionStyles(fontName, color) {
  return {
    headStyles: { fillColor: hexToRgb(color), textColor: [255, 255, 255], font: fontName, fontStyle: 'bold' },
    bodyStyles: { font: fontName, fontStyle: 'normal' },
    styles: { font: fontName },
  };
}

/** Renders the same report into a jsPDF document with the embedded Chinese font, colored per-section headers, and page-number footers. */
export async function buildOverviewPdf(report, { selectedModules } = {}) {
  const doc = new jsPDF();
  const fontName = await registerCjkFont(doc);

  doc.setFont(fontName, 'bold');
  doc.setFontSize(16);
  doc.text(`${report.meta.year}年度 利澤國小基金總覽報表`, 14, 16);
  doc.setFont(fontName, 'normal');
  doc.setFontSize(10);
  doc.text(`製表：${report.meta.who} · 產出時間：${fmtDate(report.meta.generatedAt)}`, 14, 23);

  autoTable(doc, {
    startY: 28,
    head: [['關鍵指標', '數值']],
    body: [
      [`${report.meta.year}年度歲出預算（千元）`, fmtNum(report.kpi.expenseTotal)],
      [`${report.meta.year}年度歲入預算（千元）`, fmtNum(report.kpi.revenueTotal)],
      ['本期賸餘（短絀為負，千元）', fmtNum(report.kpi.shortfall)],
      ['學生人數 / 班級數', `${report.kpi.students ?? '—'} 人 / ${report.kpi.classes ?? '—'} 班`],
      ['代理教師占比', report.kpi.substituteRatio == null ? '—' : `${report.kpi.substituteRatio}%`],
      ['圖書藏書量', report.kpi.libraryTotal == null ? '—' : `${fmtNum(report.kpi.libraryTotal)} 冊`],
    ],
    ...sectionStyles(fontName, SECTION_COLORS.kpi),
  });

  autoTable(doc, {
    startY: doc.lastAutoTable.finalY + 8,
    head: [['歲出三年比較', '金額（千元）', '較上年增減']],
    body: report.trend.map((entry) => [`${entry.year}年度`, fmtNum(entry.expenseTotal), pctText(entry.deltaPct)]),
    ...sectionStyles(fontName, SECTION_COLORS.trend),
  });

  autoTable(doc, {
    startY: doc.lastAutoTable.finalY + 8,
    head: [['業務計畫別項目', '預算金額', '決算金額', '增減', '差異原因說明']],
    body: [
      ...report.expenseVariance.rows.map((row) => [
        row.label, fmtNum(row.budgetAmount),
        row.actualAmount == null ? '—' : fmtNum(row.actualAmount),
        pctText(row.deltaPct), row.note || '—',
      ]),
      ['合計', fmtNum(report.expenseVariance.budgetTotal), report.expenseVariance.hasActual ? fmtNum(report.expenseVariance.actualTotal) : '—', '', ''],
    ],
    ...sectionStyles(fontName, SECTION_COLORS.variance),
  });

  autoTable(doc, {
    startY: doc.lastAutoTable.finalY + 8,
    head: [['歲入來源', '金額（千元）']],
    body: [
      ...report.revenue.rows.map((row) => [row.label, fmtNum(row.amount)]),
      ['合計', fmtNum(report.revenue.total)],
    ],
    ...sectionStyles(fontName, SECTION_COLORS.revenue),
  });

  if (report.basicProfile) {
    autoTable(doc, {
      startY: doc.lastAutoTable.finalY + 8,
      head: [['學校基本資料', '數值']],
      body: [
        ['班級數', report.basicProfile.classes],
        ['學生人數', report.basicProfile.students],
        ['教師員額（正式／兼任）', `${report.basicProfile.regularTeachers} / ${report.basicProfile.partTimeTeachers}`],
        ['代理教師（懸缺代理／增置員額）', `${report.basicProfile.substituteVacancy} / ${report.basicProfile.substituteAdditional}`],
        ['生師比', report.basicProfile.studentTeacherRatio == null ? '—' : `${report.basicProfile.studentTeacherRatio} : 1`],
        ['學雜費（各年級平均，元）', report.basicProfile.tuitionFeeAvg ?? '—'],
        ['午餐補助（全年度，千元）', report.basicProfile.lunchSubsidyTotal ?? '—'],
      ],
      ...sectionStyles(fontName, SECTION_COLORS.basicProfile),
    });
  }

  const moduleKeys = (selectedModules || Object.keys(MODULE_LABELS)).filter((key) => report.modules[key]);
  if (moduleKeys.length) {
    autoTable(doc, {
      startY: doc.lastAutoTable.finalY + 8,
      head: [['各模組現況', '現況']],
      body: moduleKeys.map((key) => [MODULE_LABELS[key], moduleValueText(key, report.modules[key])]),
      ...sectionStyles(fontName, SECTION_COLORS.kpi),
    });

    // One colored detail table per module — the aggregate table above answers
    // "how much", these answer "which ones" (item5: 要能呈現細項資料).
    for (const key of moduleKeys) {
      const detail = moduleDetailTable(key, report.modules[key]);
      if (!detail.length) continue;
      autoTable(doc, {
        startY: doc.lastAutoTable.finalY + 6,
        head: [[{ content: MODULE_LABELS[key], colSpan: detail[0].length }], detail[0]],
        body: detail.slice(1),
        ...sectionStyles(fontName, SECTION_COLORS[key] || SECTION_COLORS.kpi),
      });
    }
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
