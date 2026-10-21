import { AWARD_CATEGORIES } from './recordSchemas';

const OTHER_CATEGORY = '其他';

/**
 * Counts records by 類別, preserving fixedCategories' order so a donut
 * chart's slice order and legend stay stable across renders. A category
 * outside that fixed list (e.g. a custom-entered value, or older free-text
 * data predating a dropdown) folds into a trailing "其他" bucket rather than
 * being dropped. Categories with zero records are omitted — nothing to show
 * a slice for. Defaults to AWARD_CATEGORIES so existing 獲獎紀錄 callers are
 * unaffected; other modules (e.g. 課照學扶) pass their own fixed list.
 */
export function summarizeByCategory(records, fixedCategories = AWARD_CATEGORIES) {
  const counts = new Map(fixedCategories.map((category) => [category, 0]));
  let other = 0;
  for (const record of records) {
    const category = record?.category;
    if (counts.has(category)) counts.set(category, counts.get(category) + 1);
    else other += 1;
  }
  const total = records.length;
  const entries = fixedCategories.map((category) => ({ category, count: counts.get(category) }));
  if (other > 0) entries.push({ category: OTHER_CATEGORY, count: other });
  return entries
    .filter((entry) => entry.count > 0)
    .map((entry) => ({ ...entry, pct: total === 0 ? 0 : Math.round((entry.count / total) * 1000) / 10 }));
}

/**
 * Counts award records by 等級, sorted by count descending (ties keep
 * first-seen order, via Array#sort's stability). Levels are free-form
 * (a fixed preset plus custom entry), so unlike category there's no fixed
 * display order to preserve — magnitude order is the useful one here.
 */
export function summarizeByLevel(records) {
  const counts = new Map();
  for (const record of records) {
    const level = record?.level || '未填寫';
    counts.set(level, (counts.get(level) || 0) + 1);
  }
  return [...counts.entries()]
    .map(([level, count]) => ({ level, count }))
    .sort((a, b) => b.count - a.count);
}
