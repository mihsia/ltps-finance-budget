import { SPECIAL_NEEDS_CATEGORIES } from './recordSchemas';

/**
 * Groups 特生統計 records by 類別, summing their 人數, and computes each
 * category's share of the whole student body — not of the sum of these
 * counts, since the categories aren't mutually exclusive partitions of a
 * single population (a student can be both 原住民 and 低收入戶, for
 * instance), so a share of the category total would overstate each slice.
 * Fixed SPECIAL_NEEDS_CATEGORIES come first in their documented order (so
 * the chart's color assignment stays stable); any custom category typed in
 * via 其他（自訂） follows, sorted by count descending.
 */
export function summarizeSpecialNeeds(records, totalStudents) {
  const totals = new Map();
  for (const record of records) {
    const category = record?.category || '未分類';
    const count = Number(record?.count) || 0;
    totals.set(category, (totals.get(category) || 0) + count);
  }

  const pctOf = (count) => (totalStudents > 0 ? Math.round((count / totalStudents) * 1000) / 10 : null);

  const fixed = SPECIAL_NEEDS_CATEGORIES
    .filter((category) => totals.has(category))
    .map((category) => ({ category, count: totals.get(category), pct: pctOf(totals.get(category)) }));

  const custom = [...totals.entries()]
    .filter(([category]) => !SPECIAL_NEEDS_CATEGORIES.includes(category))
    .map(([category, count]) => ({ category, count, pct: pctOf(count) }))
    .sort((a, b) => b.count - a.count);

  return [...fixed, ...custom];
}
