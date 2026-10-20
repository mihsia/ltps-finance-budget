import { describe, expect, it } from 'vitest';
import { summarizeSpecialNeeds } from './specialNeedsStats';

describe('summarizeSpecialNeeds', () => {
  it('sums counts per category and computes each one\'s share of the whole student body', () => {
    const records = [
      { category: '原住民', count: 17 },
      { category: '低收入戶', count: 10 },
    ];
    expect(summarizeSpecialNeeds(records, 262)).toEqual([
      { category: '原住民', count: 17, pct: expect.closeTo(6.5, 1) },
      { category: '低收入戶', count: 10, pct: expect.closeTo(3.8, 1) },
    ]);
  });

  it('keeps the fixed SPECIAL_NEEDS_CATEGORIES order regardless of input order', () => {
    const records = [
      { category: '單親生', count: 5 },
      { category: '原住民', count: 17 },
      { category: '身障生', count: 14 },
    ];
    expect(summarizeSpecialNeeds(records, 100).map((e) => e.category)).toEqual(['原住民', '身障生', '單親生']);
  });

  it('sums multiple rows for the same category', () => {
    const records = [
      { category: '新住民', count: 15 },
      { category: '新住民', count: 10 },
    ];
    expect(summarizeSpecialNeeds(records, 100)).toEqual([
      { category: '新住民', count: 25, pct: 25 },
    ]);
  });

  it('appends a custom category after the fixed ones, sorted by count descending', () => {
    const records = [
      { category: '原住民', count: 5 },
      { category: '外籍配偶子女', count: 8 },
      { category: '轉學生', count: 2 },
    ];
    expect(summarizeSpecialNeeds(records, 100).map((e) => e.category)).toEqual(['原住民', '外籍配偶子女', '轉學生']);
  });

  it('returns a null pct (not a divide-by-zero NaN) when the total student count is unavailable', () => {
    expect(summarizeSpecialNeeds([{ category: '原住民', count: 5 }], 0)).toEqual([
      { category: '原住民', count: 5, pct: null },
    ]);
  });

  it('returns an empty list for no records', () => {
    expect(summarizeSpecialNeeds([], 262)).toEqual([]);
  });
});
