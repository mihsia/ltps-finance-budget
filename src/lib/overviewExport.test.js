import * as XLSX from 'xlsx';
import { describe, expect, it } from 'vitest';
import { buildOverviewReport } from './overviewReport';
import { buildOverviewPdf, buildOverviewWorkbook } from './overviewExport';

function sampleReport() {
  return buildOverviewReport({
    year: '115',
    who: '王小明',
    basic: {
      classes: '13', students: '262', staff: '28',
      regularTeachers: '19', substitute: '9', partTimeTeachers: '2',
      tuitionFeeAvg: '827', lunchSubsidyTotal: '236',
    },
    library: { generalBooks: 17296, indigenousBooks: 36 },
    expenseRows: [
      { label: '國民教育計畫', formula: '教學活動', amount: 6157, actualAmount: 6020, varianceNote: '部分計畫延至次年度' },
      { label: '一般行政管理計畫', formula: '人事費', amount: 48141, actualAmount: null, varianceNote: null },
    ],
    revenueRows: [{ label: '政府撥入收入', amount: 53599 }],
    trend: [
      { year: '114', expenseTotal: 55101 },
      { year: '115', expenseTotal: 54298 },
    ],
    language: { classRows: [{ lang: '閩南語', classes: 13, students: 264 }], certificationRows: [] },
    specialNeedsRows: [{ category: '原住民', count: 17 }],
    generatedAt: new Date('2026-08-11T09:30:00'),
  });
}

describe('buildOverviewWorkbook', () => {
  it('includes the KPI, variance, revenue, basic-profile, and module sections in one sheet', () => {
    const report = sampleReport();
    const wb = buildOverviewWorkbook(report);
    const sheet = wb.Sheets[wb.SheetNames[0]];
    const aoa = XLSX.utils.sheet_to_json(sheet, { header: 1 });
    const flat = aoa.map((row) => row.join('|')).join('\n');

    expect(flat).toContain('115年度 利澤國小基金總覽報表');
    expect(flat).toContain('關鍵指標');
    expect(flat).toContain('業務計畫別預算與決算（千元）');
    expect(flat).toContain('國民教育計畫|教學活動|6,157|6,020');
    expect(flat).toContain('部分計畫延至次年度');
    expect(flat).toContain('歲入明細（千元）');
    expect(flat).toContain('學校基本資料');
    expect(flat).toContain('各模組現況');
    expect(flat).toContain('族語開班（班級數總和）|13 班');
    expect(flat).toContain('特殊生統計（總人數）|17 人');
  });

  it('omits the 各模組現況 section entirely when no optional module has data', () => {
    const report = buildOverviewReport({ year: '115', expenseRows: [], revenueRows: [] });
    const wb = buildOverviewWorkbook(report);
    const sheet = wb.Sheets[wb.SheetNames[0]];
    const aoa = XLSX.utils.sheet_to_json(sheet, { header: 1 });
    expect(aoa.map((row) => row.join('|')).join('\n')).not.toContain('各模組現況');
  });

  it('only lists the caller-selected optional modules when a selection is given', () => {
    const report = sampleReport();
    const wb = buildOverviewWorkbook(report, { selectedModules: ['specialNeeds'] });
    const sheet = wb.Sheets[wb.SheetNames[0]];
    const flat = XLSX.utils.sheet_to_json(sheet, { header: 1 }).map((row) => row.join('|')).join('\n');
    expect(flat).toContain('特殊生統計');
    expect(flat).not.toContain('族語開班');
  });
});

describe('buildOverviewPdf', () => {
  it('registers the Chinese-capable font before rendering and produces a saveable document', async () => {
    const doc = await buildOverviewPdf(sampleReport());
    expect(doc.getFontList().NotoSansTC).toEqual(['normal', 'bold']);
    expect(doc).toHaveProperty('save');
    expect(typeof doc.output('datauristring')).toBe('string');
  });
});
