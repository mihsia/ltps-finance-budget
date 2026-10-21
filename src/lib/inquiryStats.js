/**
 * Counts 議會質詢答詢 records by resolution state, for the "答詢完成率"
 * meter — a count-against-its-own-total ratio is a meter's job (same
 * reasoning as ClubParticipationMeter), not a 2-slice donut. A status
 * "contains 已" (已答詢, or any custom status someone enters that still
 * reads as done) counts as resolved, matching the same rule
 * overviewReport.js's own moduleValueText already uses for "已結案／總數".
 */
export function summarizeInquiryResolution(records) {
  const total = records.length;
  const resolved = records.filter((record) => (record?.status || '').includes('已')).length;
  return {
    total,
    resolved,
    pct: total === 0 ? null : Math.round((resolved / total) * 1000) / 10,
  };
}
