import { describe, expect, it } from 'vitest';
import { summarizeParcelValues, totalAreaHectares } from './landStats';

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

describe('totalAreaHectares', () => {
  it('sums 面積(㎡) across every parcel and converts to 公頃 (÷10,000)', () => {
    const records = [
      { parcel: 'A-1', area: 5000, announcedValue: 500 },
      { parcel: 'B-2', area: 15000, announcedValue: 400 },
    ];
    expect(totalAreaHectares(records)).toBe(2);
  });

  it('rounds to 2 decimal places', () => {
    expect(totalAreaHectares([{ parcel: 'A-1', area: 12345 }])).toBe(1.23);
  });

  it('treats a blank/missing 面積 as 0', () => {
    expect(totalAreaHectares([{ parcel: 'A-1', area: '' }, { parcel: 'B-2' }])).toBe(0);
  });

  it('returns 0 for no records', () => {
    expect(totalAreaHectares([])).toBe(0);
  });
});
