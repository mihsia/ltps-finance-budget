import { describe, expect, it } from 'vitest';
import { summarizeParcelValues, SCHOOL_LAND_TOTAL_AREA_SQM, SCHOOL_LAND_TOTAL_AREA_HECTARES } from './landStats';

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

describe('SCHOOL_LAND_TOTAL_AREA_HECTARES', () => {
  it('is the official 21,390㎡ converted to 公頃 (÷10,000), rounded to 2 decimal places', () => {
    expect(SCHOOL_LAND_TOTAL_AREA_SQM).toBe(21390);
    expect(SCHOOL_LAND_TOTAL_AREA_HECTARES).toBe(2.14);
  });
});
