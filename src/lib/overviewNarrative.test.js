import { describe, expect, it } from 'vitest';
import { buildOverviewReport } from './overviewReport';
import { buildDefaultNarratives, resolveNarratives } from './overviewNarrative';

function sampleReport(overrides = {}) {
  return buildOverviewReport({
    year: '115',
    who: '王小明',
    basic: {
      classes: 13, students: 262, staff: 28,
      regularTeachers: 19, substituteVacancy: 6, substituteAdditional: 3, partTimeTeachers: 2,
    },
    library: { generalBooks: 3205, indigenousBooks: 215 },
    expenseRows: [
      { label: '教學設備', formula: '班級教學設備更新', amount: 3200, actualAmount: 3150, varianceNote: '議價節省' },
      { label: '圖書充實', formula: '館藏購置', amount: 1500, actualAmount: 1500, varianceNote: null },
      { label: '環境維護', formula: '校舍修繕', amount: 2100, actualAmount: 2260, varianceNote: '漏水搶修' },
    ],
    revenueRows: [{ label: '教育局補助', amount: 6800 }],
    trend: [
      { year: '114', expenseTotal: 6500 },
      { year: '115', expenseTotal: 6800 },
    ],
    language: { classRows: [{ lang: '閩南語', classes: 3, students: 60 }], teacherRows: [] },
    specialNeedsRows: [{ category: '原住民', count: 17 }, { category: '低收入戶', count: 2 }],
    awardsRows: [
      { category: '語文類', item: 'A', level: '縣', date: '2026-01-01' },
      { category: '語文類', item: 'B', level: '縣', date: '2026-02-01' },
      { category: '藝文類', item: 'C', level: '縣', date: '2026-03-01' },
    ],
    clubRows: [{ name: '桌遊社', participants: 20 }, { name: '直笛社', participants: 15 }],
    careSupportRows: [{ category: '課照班', name: 'A班', participants: 18 }],
    landRows: [{ parcel: 'A-1', area: 100, announcedValue: 500 }],
    inquiryRows: [{ status: '已答詢' }, { status: '已答詢' }, { status: '待答詢' }],
    generatedAt: new Date('2026-08-11T09:30:00'),
    ...overrides,
  });
}

describe('buildDefaultNarratives', () => {
  it('describes an expense increase and names the biggest noted variance', () => {
    const narratives = buildDefaultNarratives(sampleReport());
    expect(narratives.finance).toContain('115年度歲出預算為 6,800 千元，較上年度增加 4.62%');
    expect(narratives.finance).toContain('歲入預算為 6,800 千元，收支打平');
    expect(narratives.finance).toContain('「環境維護」因漏水搶修超支 7.6%');
  });

  it('describes an expense decrease', () => {
    const report = sampleReport({
      trend: [{ year: '114', expenseTotal: 7000 }, { year: '115', expenseTotal: 6800 }],
    });
    expect(buildDefaultNarratives(report).finance).toContain('較上年度減少 2.86%');
  });

  it('notes when decision data is still incomplete', () => {
    const report = sampleReport({
      expenseRows: [
        { label: '教學設備', formula: '', amount: 3200, actualAmount: 3150, varianceNote: '' },
        { label: '圖書充實', formula: '', amount: 1500, actualAmount: null, varianceNote: '' },
      ],
    });
    expect(buildDefaultNarratives(report).finance).toContain('業務計畫別決算資料尚有 1 項未填列決算。');
  });

  it('notes when no decision data has been filed at all', () => {
    const report = sampleReport({
      expenseRows: [{ label: '教學設備', formula: '', amount: 3200, actualAmount: null, varianceNote: '' }],
    });
    expect(buildDefaultNarratives(report).finance).toContain('業務計畫別決算資料尚未填列。');
  });

  it('falls back to a plain "全數到位" sentence when nothing varied', () => {
    const report = sampleReport({
      expenseRows: [{ label: '教學設備', formula: '', amount: 3200, actualAmount: 3200, varianceNote: '' }],
    });
    expect(buildDefaultNarratives(report).finance).toContain('業務計畫別決算資料已全數到位，各項目均在預算內。');
  });

  it('describes 校務資料 with substitute ratio and student-teacher ratio', () => {
    const narratives = buildDefaultNarratives(sampleReport());
    expect(narratives.basicProfile).toBe('全校共 13 班、262 位學生，教師員額 30 人（其中代理教師 9 人，占比 30%），生師比約 8.7 : 1。');
  });

  it('returns an empty basicProfile narrative when there is no basic-profile data', () => {
    const report = sampleReport({ basic: undefined });
    expect(buildDefaultNarratives(report).basicProfile).toBe('');
  });

  it('describes each module present in the report', () => {
    const { modules } = buildDefaultNarratives(sampleReport());
    expect(modules.library).toBe('圖書藏書量共 3,420 冊，其中族語／原住民書籍 215 冊，占整體 6.3%。');
    expect(modules.language).toBe('開設族語班共 3 班，合計 60 位學生參與。');
    expect(modules.specialNeeds).toBe('特殊教育學生共 19 人，以「原住民」17 人最多。');
    expect(modules.awards).toBe('本年度獲獎紀錄共 3 筆，以「語文類」類別最多，計 2 筆。');
    expect(modules.club).toBe('開設課後社團共 2 個，參與學生 35 人，占全校學生 13.4%。');
    expect(modules.careSupport).toBe('開設課照／學扶班共 1 班，參與學生 18 人，占全校學生 6.9%。');
    expect(modules.land).toBe('校地總面積約 0.01 公頃，列管土地共 1 筆，總公告現值合計 50,000 元。');
    expect(modules.inquiry).toBe('議會質詢／答詢共 3 案，已結案 2 案，結案率 66.7%。');
  });

  it('omits modules that have no data in the report', () => {
    const report = buildOverviewReport({ year: '115', expenseRows: [], revenueRows: [] });
    const { modules } = buildDefaultNarratives(report);
    expect(modules).toEqual({});
  });
});

describe('resolveNarratives', () => {
  it('uses the saved override for a section when one exists, and the default otherwise', () => {
    const defaults = buildDefaultNarratives(sampleReport());
    const saved = { finance: '自訂的財務說明文字。', modules: { library: '自訂的圖書說明。' } };
    const resolved = resolveNarratives(defaults, saved);
    expect(resolved.finance).toBe('自訂的財務說明文字。');
    expect(resolved.basicProfile).toBe(defaults.basicProfile);
    expect(resolved.modules.library).toBe('自訂的圖書說明。');
    expect(resolved.modules.awards).toBe(defaults.modules.awards);
  });

  it('returns the defaults untouched when nothing has been saved', () => {
    const defaults = buildDefaultNarratives(sampleReport());
    expect(resolveNarratives(defaults, null)).toEqual(defaults);
  });
});
