/**
 * Sums 開班資料 (class) records' 班級數 (classes) per 語系, for the "各語系
 * 開班數" bar chart — magnitude comparison across up to 18 languages, so a
 * ranked horizontal bar list is the right form, not a donut. Languages with
 * zero total classes are omitted; a blank 語系 (should not normally happen,
 * since it's a required field) folds into "未填寫" rather than being dropped.
 */
export function summarizeClassesByLang(classRows) {
  const counts = new Map();
  for (const row of classRows) {
    const lang = row?.lang || '未填寫';
    counts.set(lang, (counts.get(lang) || 0) + Number(row?.classes || 0));
  }
  return [...counts.entries()]
    .map(([lang, classes]) => ({ lang, classes }))
    .filter((entry) => entry.classes > 0)
    .sort((a, b) => b.classes - a.classes);
}
