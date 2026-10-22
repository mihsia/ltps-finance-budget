/**
 * Computes each 地號's total 現值 (面積 × 公告現值), for the "各地號現值"
 * bar chart — comparing a handful of parcels' magnitudes is a ranked bar
 * list's job, not a donut's. Sorted by value descending; a blank 地號
 * folds into "未填寫" rather than being dropped.
 */
export function summarizeParcelValues(records) {
  return records
    .map((record) => ({
      parcel: record?.parcel || '未填寫',
      value: Number(record?.area || 0) * Number(record?.announcedValue || 0),
    }))
    .sort((a, b) => b.value - a.value);
}

/**
 * Sums every listed 地號's 面積(㎡) and converts to 公頃 (1 公頃 = 10,000
 * ㎡) — the unit 校地總面積 is conventionally reported in for 議會審查
 * (ha, not raw ㎡). Rounded to 2 decimal places; shared by the「校地概況」
 * module page's own summary stat and the PDF narrative so both read the
 * same number off the same formula.
 */
export function totalAreaHectares(records) {
  const totalSqm = records.reduce((sum, record) => sum + Number(record?.area || 0), 0);
  return Math.round((totalSqm / 10000) * 100) / 100;
}
