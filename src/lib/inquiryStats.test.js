import { describe, expect, it } from 'vitest';
import { summarizeInquiryResolution } from './inquiryStats';

describe('summarizeInquiryResolution', () => {
  it('counts records whose status contains 已 as resolved and computes a percentage', () => {
    const records = [{ status: '已答詢' }, { status: '待答詢' }, { status: '已答詢' }, { status: '待答詢' }];
    expect(summarizeInquiryResolution(records)).toEqual({ total: 4, resolved: 2, pct: 50 });
  });

  it('treats a custom status containing 已 as resolved too', () => {
    const records = [{ status: '已處理完畢' }];
    expect(summarizeInquiryResolution(records)).toEqual({ total: 1, resolved: 1, pct: 100 });
  });

  it('returns a null pct (not a divide-by-zero) for no records', () => {
    expect(summarizeInquiryResolution([])).toEqual({ total: 0, resolved: 0, pct: null });
  });
});
