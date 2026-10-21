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
