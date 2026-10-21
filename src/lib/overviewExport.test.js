import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildOverviewReport } from './overviewReport';
import { buildDefaultNarratives } from './overviewNarrative';
import { buildOverviewPdf, buildOverviewWorkbook } from './overviewExport';

function sampleReport() {
  return buildOverviewReport({
    year: '115',
    who: '王小明',
    basic: {
      classes: '13', students: '262', staff: '28',
      regularTeachers: '19', substituteVacancy: '6', substituteAdditional: '3', partTimeTeachers: '2',
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
    language: { classRows: [{ lang: '閩南語', classes: 13, students: 264 }], teacherRows: [] },
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
    expect(flat).toContain('特生統計（總人數）|17 人');
    // Itemized detail rows, not just the aggregate line.
    expect(flat).toContain('|語系|班級數|學生人數');
    expect(flat).toContain('|閩南語|13|264');
    expect(flat).toContain('|類別|人數|說明');
    expect(flat).toContain('|原住民|17|—');
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
    expect(flat).toContain('特生統計');
    expect(flat).not.toContain('族語開班');
  });
});

// A real (if trivial) 1x1 transparent PNG — jsPDF's addImage decodes the
// PNG bytes for real rather than trusting the caller's width/height, so a
// placeholder string like "data:image/png;base64,AAAA" throws "Incomplete
// or corrupt PNG file" instead of standing in as a lightweight fixture.
const ONE_PIXEL_PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';

describe('buildOverviewPdf', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('registers the Chinese-capable font before rendering and produces a saveable document', async () => {
    const doc = await buildOverviewPdf(sampleReport());
    expect(doc.getFontList().NotoSansTC).toEqual(['normal', 'bold']);
    expect(doc).toHaveProperty('save');
    expect(typeof doc.output('datauristring')).toBe('string');
    // The body (narrative + charts) and the "附件：詳細資料" appendix (every
    // itemized table) always land on at least two separate pages, and every
    // page should have gotten a "第 x 頁，共 y 頁" footer stamped on it.
    expect(doc.internal.getNumberOfPages()).toBeGreaterThanOrEqual(2);
  });

  it('embeds a chart image (captured by Report.jsx via html2canvas) under its matching table', async () => {
    const addImageSpy = vi.spyOn(jsPDF.API, 'addImage');
    const chartImages = {
      'finance.expenseTrend': { dataUrl: ONE_PIXEL_PNG, width: 300, height: 150 },
      'module.specialNeeds': { dataUrl: ONE_PIXEL_PNG, width: 200, height: 200 },
    };
    await buildOverviewPdf(sampleReport(), { chartImages });
    expect(addImageSpy).toHaveBeenCalledTimes(2);
    expect(addImageSpy.mock.calls.every((call) => call[0] === ONE_PIXEL_PNG)).toBe(true);
  });

  it('calls addImage not at all when no chart was captured for any key', async () => {
    const addImageSpy = vi.spyOn(jsPDF.API, 'addImage');
    await buildOverviewPdf(sampleReport());
    expect(addImageSpy).not.toHaveBeenCalled();
  });
});

// jsPDF's own text()/addPage() are bound directly onto each instance inside
// its constructor (not copied from a shared, spy-able prototype object the
// way jspdf-autotable-style plugins are), so they can't be intercepted with
// vi.spyOn the way addImage is below. splitTextToSize, like addImage, IS a
// plugin attached to the shared jsPDF.API object and copied onto each new
// instance at construction time — spying on it (before the `new jsPDF()`
// buildOverviewPdf does internally) captures addNarrative()'s exact input
// text, pre-wrapping, which is the only point in this pipeline a narrative
// string exists as a single untouched value.
function narrativeCalls(splitSpy) {
  return splitSpy.mock.calls.map(([text]) => text);
}

describe('buildOverviewPdf narrative + appendix structure', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('auto-generates narrative text (via overviewNarrative.js) when the caller passes none', async () => {
    const report = sampleReport();
    const splitSpy = vi.spyOn(jsPDF.API, 'splitTextToSize');
    await buildOverviewPdf(report);
    const defaults = buildDefaultNarratives(report);
    const drawn = narrativeCalls(splitSpy);
    expect(drawn).toContain(defaults.finance);
    expect(drawn).toContain(defaults.basicProfile);
    expect(drawn).toContain(defaults.modules.library);
  });

  it('draws a caller-supplied narrative override instead of the auto-generated draft', async () => {
    const report = sampleReport();
    const splitSpy = vi.spyOn(jsPDF.API, 'splitTextToSize');
    const narratives = {
      ...buildDefaultNarratives(report),
      finance: '管理者自訂的財務概況說明文字。',
    };
    await buildOverviewPdf(report, { narratives });
    const drawn = narrativeCalls(splitSpy);
    expect(drawn).toContain('管理者自訂的財務概況說明文字。');
    expect(drawn).not.toContain(buildDefaultNarratives(report).finance);
  });

  it('still draws the 財務概況 narrative off zero rows, with no basicProfile/module narratives to draw alongside it', async () => {
    const report = buildOverviewReport({ year: '115', expenseRows: [], revenueRows: [] });
    const splitSpy = vi.spyOn(jsPDF.API, 'splitTextToSize');
    await buildOverviewPdf(report);
    const defaults = buildDefaultNarratives(report);
    expect(defaults.basicProfile).toBe('');
    expect(Object.keys(defaults.modules)).toHaveLength(0);
    expect(narrativeCalls(splitSpy)).toContain(defaults.finance);
  });

  it('always adds a trailing 附件 page, even for a report with nothing to itemize', async () => {
    const report = buildOverviewReport({ year: '115', expenseRows: [], revenueRows: [] });
    const doc = await buildOverviewPdf(report);
    // No basicProfile/module zones and a short KPI table easily fit on page
    // 1, so page 2 existing at all demonstrates the appendix page break
    // fires unconditionally rather than only when content overflows.
    expect(doc.internal.getNumberOfPages()).toBe(2);
  });
});
