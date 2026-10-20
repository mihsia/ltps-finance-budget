import { describe, expect, it } from 'vitest';
import { summarizeByCategory, summarizeByLevel } from './awardStats';

describe('summarizeByCategory', () => {
  it('counts records per category in AWARD_CATEGORIES order and computes a percentage of the total', () => {
    const records = [
      { category: '科學類' }, { category: '語文類' }, { category: '語文類' }, { category: '語文類' },
      { category: '體育類' },
    ];
    expect(summarizeByCategory(records)).toEqual([
      { category: '語文類', count: 3, pct: 60 },
      { category: '體育類', count: 1, pct: 20 },
      { category: '科學類', count: 1, pct: 20 },
    ]);
  });

  it('omits categories with no records instead of showing a zero-count slice', () => {
    const records = [{ category: '語文類' }];
    expect(summarizeByCategory(records)).toEqual([
      { category: '語文類', count: 1, pct: 100 },
    ]);
  });

  it('folds a category outside the fixed list into a trailing 其他 bucket', () => {
    const records = [
      { category: '語文類' }, { category: '舊資料類別' }, { category: '舊資料類別' },
    ];
    expect(summarizeByCategory(records)).toEqual([
      { category: '語文類', count: 1, pct: expect.closeTo(33.3, 1) },
      { category: '其他', count: 2, pct: expect.closeTo(66.7, 1) },
    ]);
  });

  it('returns an empty list for no records', () => {
    expect(summarizeByCategory([])).toEqual([]);
  });
});

describe('summarizeByLevel', () => {
  it('counts records per level, sorted by count descending', () => {
    const records = [
      { level: '佳作' }, { level: '特優' }, { level: '特優' }, { level: '優等' }, { level: '特優' },
    ];
    expect(summarizeByLevel(records)).toEqual([
      { level: '特優', count: 3 },
      { level: '佳作', count: 1 },
      { level: '優等', count: 1 },
    ]);
  });

  it('keeps first-seen order among tied counts', () => {
    const records = [{ level: '甲等' }, { level: '佳作' }];
    expect(summarizeByLevel(records)).toEqual([
      { level: '甲等', count: 1 },
      { level: '佳作', count: 1 },
    ]);
  });

  it('groups a blank level under 未填寫', () => {
    const records = [{ level: '' }, { level: null }, { level: '特優' }];
    expect(summarizeByLevel(records)).toEqual([
      { level: '未填寫', count: 2 },
      { level: '特優', count: 1 },
    ]);
  });

  it('returns an empty list for no records', () => {
    expect(summarizeByLevel([])).toEqual([]);
  });
});
