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

// 校地總面積固定為教育部全球資訊網公告的 21,390 平方公尺（約 2.14 公頃）
// —一筆法定的校地事實，不會隨著「校地概況」模組逐筆填寫的地號資料增減
// 而改變，所以直接存成常數，不再由地號面積加總推算（加總值可能因地號
// 資料有缺漏或調整而與官方公告數字脫節）。「校地概況」模組頁的總面積
// 顯示、PDF 文字說明都讀這個常數，兩處永遠一致。
export const SCHOOL_LAND_TOTAL_AREA_SQM = 21390;
export const SCHOOL_LAND_TOTAL_AREA_HECTARES = Math.round((SCHOOL_LAND_TOTAL_AREA_SQM / 10000) * 100) / 100;
