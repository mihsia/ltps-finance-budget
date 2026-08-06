import * as XLSX from 'xlsx';

// Reproduces the column order / sheet structure of the school's actual
// 地方教育發展基金 submission to 宜蘭縣議會 (see 115年利澤國小預算(說明)給校長-議會用.xls
// and 利澤國小115年度預算書PDF檔.pdf, both provided by 總務處): three sheets ---
// 基金來源、用途及餘絀預計表 (balance summary), 基金來源明細表 (revenue detail),
// 基金用途明細表 (expense detail, multi-year) --- instead of the generic
// two-column list the export previously produced.

const titleBlock = (year, sheetName) => [
  ['宜蘭縣五結鄉利澤國民小學'],
  ['地方教育發展基金'],
  [sheetName],
  [`中華民國${year}年度`],
  ['單位：新臺幣千元'],
  [],
];

// The Firestore revenue.rows schema doesn't tag each row with its official
// 科目 category, so it's inferred from the label (matches the labels
// Budget.jsx's REVENUE_DEFAULT / scripts/seed.js already use).
function revenueCategory(label) {
  return label.includes('政府撥入') || label.includes('公庫') ? '政府撥入收入' : '財產收入';
}

function sumAmount(rows) {
  return (rows || []).reduce((s, r) => s + Number(r.amount || 0), 0);
}

function buildSummarySheet(year, prevYear, budgetByYear) {
  const cur = budgetByYear[year] || {};
  const prev = budgetByYear[prevYear] || {};
  const revenueRows = cur.revenue?.rows || [];
  const expenseRows = cur.expense?.breakdown || [];
  const revenueTotal = sumAmount(revenueRows);
  const expenseTotal = sumAmount(expenseRows);

  // Archived years may only have an expense *total* on file (see
  // scripts/seed.js's "歷史年度僅存總額，未逐項留存") with no revenue breakdown at
  // all — an empty array there means "not recorded", not "recorded as zero",
  // so the comparison column must stay blank rather than show a fabricated
  // 100%-drop delta against a phantom 0.
  const hasPrevRevenue = (prev.revenue?.rows || []).length > 0;
  const hasPrevExpense = (prev.expense?.breakdown || []).length > 0;
  const prevRevenueTotal = hasPrevRevenue ? sumAmount(prev.revenue.rows) : null;
  const prevExpenseTotal = hasPrevExpense ? sumAmount(prev.expense.breakdown) : null;
  const hasPrevBoth = hasPrevRevenue && hasPrevExpense;

  const rows = [
    ...titleBlock(year, '基金來源、用途及餘絀預計表'),
    ['項　目', '本年度預算數', '上年度預算數', '比較增減(－)'],
    ['基金來源', revenueTotal, hasPrevRevenue ? prevRevenueTotal : '—', hasPrevRevenue ? revenueTotal - prevRevenueTotal : ''],
    ...revenueRows.map((r) => [`　${r.label}`, Number(r.amount || 0), '', '']),
    ['基金用途', expenseTotal, hasPrevExpense ? prevExpenseTotal : '—', hasPrevExpense ? expenseTotal - prevExpenseTotal : ''],
    ...expenseRows.map((r) => [`　${r.label}`, Number(r.amount || 0), '', '']),
    [
      '本期賸餘（短絀－）',
      revenueTotal - expenseTotal,
      hasPrevBoth ? prevRevenueTotal - prevExpenseTotal : '—',
      hasPrevBoth ? (revenueTotal - expenseTotal) - (prevRevenueTotal - prevExpenseTotal) : '',
    ],
  ];
  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws['!cols'] = [{ wch: 30 }, { wch: 14 }, { wch: 14 }, { wch: 14 }];
  return ws;
}

function buildRevenueDetailSheet(year, revenueRows) {
  const revenueTotal = sumAmount(revenueRows);
  const byCategory = { 財產收入: [], 政府撥入收入: [] };
  for (const r of revenueRows) byCategory[revenueCategory(r.label)].push(r);

  const rows = [
    ...titleBlock(year, '基金來源明細表'),
    ['科目及業務項目', '單位', '數量', '金額（千元）', '說明'],
  ];
  for (const [category, catRows] of Object.entries(byCategory)) {
    if (catRows.length === 0) continue;
    rows.push([category, '', '', sumAmount(catRows), '']);
    for (const r of catRows) rows.push([`　${r.label}`, '年', 1, Number(r.amount || 0), '']);
  }
  rows.push(['總　計：', '', '', revenueTotal, '']);

  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws['!cols'] = [{ wch: 32 }, { wch: 8 }, { wch: 8 }, { wch: 14 }, { wch: 30 }];
  return ws;
}

function buildExpenseDetailSheet(year, years, budgetByYear) {
  const expenseRows = budgetByYear[year]?.expense?.breakdown || [];
  const yearCols = years.length ? years : [year];

  const rows = [
    ...titleBlock(year, '基金用途明細表'),
    ['業務計畫及用途別科目', ...yearCols.map((y) => `${y}年度預算數`), '計畫內容說明'],
  ];
  for (const item of expenseRows) {
    rows.push([
      item.label,
      ...yearCols.map((y) => {
        const match = (budgetByYear[y]?.expense?.breakdown || []).find((r) => r.label === item.label);
        return match ? Number(match.amount || 0) : '';
      }),
      item.formula || '',
    ]);
  }
  rows.push([
    '合　計',
    ...yearCols.map((y) => sumAmount(budgetByYear[y]?.expense?.breakdown)),
    '',
  ]);

  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws['!cols'] = [{ wch: 22 }, ...yearCols.map(() => ({ wch: 14 })), { wch: 44 }];
  return ws;
}

/**
 * Builds a workbook mirroring the council's own submission format.
 * `budgetByYear` maps year -> that year's `modules/budget` doc data
 * ({ expense: { breakdown }, revenue: { rows } }); `years` is the set of
 * years to show as comparison columns in the 基金用途明細表 sheet (ascending).
 */
export function buildCouncilWorkbook({ year, years, budgetByYear }) {
  const prevYear = String(Number(year) - 1);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, buildSummarySheet(year, prevYear, budgetByYear), '基金來源用途餘絀表');
  XLSX.utils.book_append_sheet(wb, buildRevenueDetailSheet(year, budgetByYear[year]?.revenue?.rows || []), '基金來源明細表');
  XLSX.utils.book_append_sheet(wb, buildExpenseDetailSheet(year, years, budgetByYear), '基金用途明細表');
  return wb;
}
