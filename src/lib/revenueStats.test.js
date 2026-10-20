import { describe, expect, it } from 'vitest';
import { summarizeRevenueSources } from './revenueStats';

describe('summarizeRevenueSources', () => {
  it('groups rows by label, sums amounts, and sorts descending with a percentage of the total', () => {
    const rows = [
      { label: '政府撥入收入', amount: 53599 },
      { label: '租金收入', amount: 40 },
      { label: '利息收入', amount: 2 },
      { label: '財產處分收入', amount: 1 },
    ];
    expect(summarizeRevenueSources(rows)).toEqual([
      { label: '政府撥入收入', amount: 53599, pct: expect.closeTo(99.9, 1) },
      { label: '租金收入', amount: 40, pct: expect.closeTo(0.1, 1) },
      { label: '利息收入', amount: 2, pct: 0 },
      { label: '財產處分收入', amount: 1, pct: 0 },
    ]);
  });

  it('sums multiple rows that share the same label instead of listing them separately', () => {
    const rows = [
      { label: '租金收入', amount: 20 },
      { label: '租金收入', amount: 20 },
    ];
    expect(summarizeRevenueSources(rows)).toEqual([
      { label: '租金收入', amount: 40, pct: 100 },
    ]);
  });

  it('folds sources beyond maxSlices into a trailing 其他 bucket', () => {
    const rows = [
      { label: 'A', amount: 50 }, { label: 'B', amount: 40 }, { label: 'C', amount: 30 },
      { label: 'D', amount: 20 }, { label: 'E', amount: 10 }, { label: 'F', amount: 5 },
    ];
    const result = summarizeRevenueSources(rows, { maxSlices: 3 });
    expect(result).toEqual([
      { label: 'A', amount: 50, pct: expect.closeTo(32.3, 1) },
      { label: 'B', amount: 40, pct: expect.closeTo(25.8, 1) },
      { label: '其他', amount: 65, pct: expect.closeTo(41.9, 1) },
    ]);
  });

  it('omits a label with zero amount', () => {
    const rows = [{ label: '租金收入', amount: 0 }, { label: '利息收入', amount: 5 }];
    expect(summarizeRevenueSources(rows)).toEqual([
      { label: '利息收入', amount: 5, pct: 100 },
    ]);
  });

  it('groups a blank label under 其他', () => {
    const rows = [{ label: '', amount: 5 }, { label: null, amount: 5 }];
    expect(summarizeRevenueSources(rows)).toEqual([
      { label: '其他', amount: 10, pct: 100 },
    ]);
  });

  it('returns an empty list for no rows', () => {
    expect(summarizeRevenueSources([])).toEqual([]);
  });
});
