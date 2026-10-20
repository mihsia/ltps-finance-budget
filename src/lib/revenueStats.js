const OTHER_LABEL = '其他';
const DEFAULT_MAX_SLICES = 5;

/**
 * Groups 歲入 rows by label (free-text revenue source name, e.g. 租金收入／
 * 利息收入) and sums amounts, sorted by amount descending so the biggest
 * sources lead. Sources beyond maxSlices fold into a trailing "其他" bucket,
 * keeping the donut's legend short regardless of how many distinct labels a
 * year's data happens to have.
 */
export function summarizeRevenueSources(rows, { maxSlices = DEFAULT_MAX_SLICES } = {}) {
  const totals = new Map();
  for (const row of rows) {
    const label = row?.label || OTHER_LABEL;
    totals.set(label, (totals.get(label) || 0) + Number(row?.amount || 0));
  }
  const total = [...totals.values()].reduce((sum, amount) => sum + amount, 0);
  const entries = [...totals.entries()]
    .map(([label, amount]) => ({ label, amount }))
    .sort((a, b) => b.amount - a.amount);

  const folded = entries.length > maxSlices
    ? [
      ...entries.slice(0, maxSlices - 1),
      {
        label: OTHER_LABEL,
        amount: entries.slice(maxSlices - 1).reduce((sum, entry) => sum + entry.amount, 0),
      },
    ]
    : entries;

  return folded
    .filter((entry) => entry.amount > 0)
    .map((entry) => ({ ...entry, pct: total === 0 ? 0 : Math.round((entry.amount / total) * 1000) / 10 }));
}
