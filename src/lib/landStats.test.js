import { describe, expect, it } from 'vitest';
import { summarizeParcelValues } from './landStats';

describe('summarizeParcelValues', () => {
  it('multiplies 面積 by 公告現值 per parcel, sorted by value descending', () => {
    const records = [
      { parcel: 'A-1', area: 100, announcedValue: 500 },
      { parcel: 'B-2', area: 300, announcedValue: 400 },
    ];
    expect(summarizeParcelValues(records)).toEqual([
      { parcel: 'B-2', value: 120000 },
      { parcel: 'A-1', value: 50000 },
    ]);
  });

  it('folds a blank 地號 into 未填寫', () => {
    const records = [{ parcel: '', area: 10, announcedValue: 10 }];
    expect(summarizeParcelValues(records)).toEqual([{ parcel: '未填寫', value: 100 }]);
  });

  it('returns an empty list for no records', () => {
    expect(summarizeParcelValues([])).toEqual([]);
  });
});
