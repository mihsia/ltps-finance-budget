import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { registerCjkFont } from './pdfFont';
import { fmtNum, fmtDate } from './format';

const MODULE_LABELS = {
  library: '圖書藏書量',
  language: '族語開班（班級數總和）',
  specialNeeds: '特殊生統計（總人數）',
  awards: '獲獎紀錄（筆數）',
  club: '課後社團（社團數）',
  land: '土地現值（地號數）',
  inquiry: '議會質詢答詢（已結案／總數）',
};

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
      ['代理教師', report.basicProfile.substitute, '兼任教師', report.basicProfile.partTimeTeachers],
      ['生師比', report.basicProfile.studentTeacherRatio == null ? '—' : `${report.basicProfile.studentTeacherRatio} : 1`, '代理教師占比', report.basicProfile.substituteRatio == null ? '—' : `${report.basicProfile.substituteRatio}%`],
      ['學雜費（各年級平均，元）', report.basicProfile.tuitionFeeAvg ?? '—', '午餐補助（全年度，千元）', report.basicProfile.lunchSubsidyTotal ?? '—'],
    );
  }

  const moduleKeys = (selectedModules || Object.keys(MODULE_LABELS)).filter((key) => report.modules[key]);
  if (moduleKeys.length) {
    rows.push([], ['各模組現況'], ['模組', '現況']);
    for (const key of moduleKeys) rows.push([MODULE_LABELS[key], moduleValueText(key, report.modules[key])]);
  }

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws['!cols'] = [{ wch: 26 }, { wch: 22 }, { wch: 16 }, { wch: 16 }, { wch: 16 }, { wch: 32 }];
  XLSX.utils.book_append_sheet(wb, ws, '基金總覽報表');
  return wb;
}

/** Renders the same report into a jsPDF document with the embedded Chinese font. */
export async function buildOverviewPdf(report, { selectedModules } = {}) {
  const doc = new jsPDF();
  const fontName = await registerCjkFont(doc);
  const headStyles = { fillColor: [31, 95, 82], font: fontName, fontStyle: 'bold' };
  const bodyStyles = { font: fontName, fontStyle: 'normal' };

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
    headStyles, bodyStyles, styles: { font: fontName },
  });

  autoTable(doc, {
    startY: doc.lastAutoTable.finalY + 8,
    head: [['歲出三年比較', '金額（千元）', '較上年增減']],
    body: report.trend.map((entry) => [`${entry.year}年度`, fmtNum(entry.expenseTotal), pctText(entry.deltaPct)]),
    headStyles, bodyStyles, styles: { font: fontName },
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
    headStyles, bodyStyles, styles: { font: fontName },
  });

  autoTable(doc, {
    startY: doc.lastAutoTable.finalY + 8,
    head: [['歲入來源', '金額（千元）']],
    body: [
      ...report.revenue.rows.map((row) => [row.label, fmtNum(row.amount)]),
      ['合計', fmtNum(report.revenue.total)],
    ],
    headStyles, bodyStyles, styles: { font: fontName },
  });

  if (report.basicProfile) {
    autoTable(doc, {
      startY: doc.lastAutoTable.finalY + 8,
      head: [['學校基本資料', '數值']],
      body: [
        ['班級數', report.basicProfile.classes],
        ['學生人數', report.basicProfile.students],
        ['教師員額（正式／代理／兼任）', `${report.basicProfile.regularTeachers} / ${report.basicProfile.substitute} / ${report.basicProfile.partTimeTeachers}`],
        ['生師比', report.basicProfile.studentTeacherRatio == null ? '—' : `${report.basicProfile.studentTeacherRatio} : 1`],
        ['學雜費（各年級平均，元）', report.basicProfile.tuitionFeeAvg ?? '—'],
        ['午餐補助（全年度，千元）', report.basicProfile.lunchSubsidyTotal ?? '—'],
      ],
      headStyles, bodyStyles, styles: { font: fontName },
    });
  }

  const moduleKeys = (selectedModules || Object.keys(MODULE_LABELS)).filter((key) => report.modules[key]);
  if (moduleKeys.length) {
    autoTable(doc, {
      startY: doc.lastAutoTable.finalY + 8,
      head: [['各模組現況', '現況']],
      body: moduleKeys.map((key) => [MODULE_LABELS[key], moduleValueText(key, report.modules[key])]),
      headStyles, bodyStyles, styles: { font: fontName },
    });
  }

  return doc;
}
