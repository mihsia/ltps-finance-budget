import { AWARD_CATEGORIES } from './recordSchemas';

const OTHER_CATEGORY = '其他';

/**
 * Counts award records by 類別, preserving AWARD_CATEGORIES' fixed order so
 * the donut chart's slice order and legend stay stable across renders. A
 * category outside that fixed list (e.g. older free-text data predating the
 * dropdown) folds into a trailing "其他" bucket rather than being dropped.
 * Categories with zero records are omitted — nothing to show a slice for.
 */
export function summarizeByCategory(records) {
  const counts = new Map(AWARD_CATEGORIES.map((category) => [category, 0]));
  let other = 0;
  for (const record of records) {
    const category = record?.category;
    if (counts.has(category)) counts.set(category, counts.get(category) + 1);
    else other += 1;
  }
  const total = records.length;
  const entries = AWARD_CATEGORIES.map((category) => ({ category, count: counts.get(category) }));
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
