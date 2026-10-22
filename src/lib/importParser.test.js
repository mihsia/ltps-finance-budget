import { describe, expect, it } from 'vitest';
import { IMPORT_FIELDS } from './importParser';

function matchField(id, text) {
  const field = IMPORT_FIELDS.find((f) => f.id === id);
  for (const re of field.re) {
    const m = text.match(re);
    if (m) return m[1].replace(/,/g, '');
  }
  return undefined;
}

// A reconstructed excerpt of the real 利澤國小 115/116 年度預算書's
// 「基金來源、用途及餘絀預計表」, in the same row-per-line, space-separated
// shape src/lib/importParser.js's extractPdfText() produces (column order:
// 前年度決算數 / 項目 / 本年度預算數 / 上年度預算數 / 比較增減).
const FUND_TABLE_EXCERPT = `
前年度決算數 項目 本年度預算數 上年度預算數 比較增減(一)
58,502 基金來源 55,361 53,642 1,719
58,413 基金用途 56,089 54,358 1,731
90 本期賸餘 (短絀－) -728 -716 -12
1,355 期初基金餘額 728 717 12
0 解繳公庫 0 0 0
1,444 期末基金餘額 0 1 0
`;

describe('IMPORT_FIELDS openingFundBalance', () => {
  it('extracts this year\'s 期初基金餘額 (the number right after the label) from the real fund table layout', () => {
    expect(matchField('openingFundBalance', FUND_TABLE_EXCERPT)).toBe('728');
  });

  it('matches the 115 年度 document\'s own opening balance row too', () => {
    const text115 = `
前年度決算數 項目 本年度預算數 上年度預算數 比較增減(一)
1,166 期初基金餘額 717 639 78
1,355 期末基金餘額 1 1 0
`;
    expect(matchField('openingFundBalance', text115)).toBe('717');
  });

  it('is listed under the budgetbook group, not revenue/expense/info', () => {
    const field = IMPORT_FIELDS.find((f) => f.id === 'openingFundBalance');
    expect(field.group).toBe('budgetbook');
  });

  it('returns undefined when the label never appears', () => {
    expect(matchField('openingFundBalance', '完全不相關的文字內容')).toBeUndefined();
  });
});
