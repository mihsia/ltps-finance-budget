import { describe, expect, it } from 'vitest';
import { summarizeClassesByLang } from './languageStats';

describe('summarizeClassesByLang', () => {
  it('sums 班級數 per 語系, sorted by total descending', () => {
    const rows = [
      { lang: '阿美語', classes: 2 },
      { lang: '太魯閣語', classes: 1 },
      { lang: '阿美語', classes: 1 },
    ];
    expect(summarizeClassesByLang(rows)).toEqual([
      { lang: '阿美語', classes: 3 },
      { lang: '太魯閣語', classes: 1 },
    ]);
  });

  it('folds a blank 語系 into 未填寫', () => {
    const rows = [{ lang: '', classes: 1 }, { lang: null, classes: 2 }];
    expect(summarizeClassesByLang(rows)).toEqual([{ lang: '未填寫', classes: 3 }]);
  });

  it('omits languages with zero total classes', () => {
    const rows = [{ lang: '客語', classes: 0 }, { lang: '閩南語', classes: 1 }];
    expect(summarizeClassesByLang(rows)).toEqual([{ lang: '閩南語', classes: 1 }]);
  });

  it('returns an empty list for no records', () => {
    expect(summarizeClassesByLang([])).toEqual([]);
  });
});
