// Maps each module's Firestore doc to a fill-progress percentage for the dashboard.
// `basic` uses its explicit draft/submitted workflow; the rest are binary
// (has real data written vs. never touched) since the design only shows a
// draft/submit distinction on the 基本資料 form.
export function moduleCompletionPct(moduleKey, data) {
  if (!data) return 0;
  if (Array.isArray(data)) {
    const active = data.filter((record) => record && !record.deletedAt);
    if (moduleKey === 'budget') {
      return active.some((record) => record.recordType === 'expense')
        && active.some((record) => record.recordType === 'revenue') ? 100 : 0;
    }
    if (moduleKey === 'language') {
      return active.some((record) => record.recordType === 'class') ? 100 : 0;
    }
    return active.length > 0 ? 100 : 0;
  }
  if (moduleKey === 'basic') {
    if (data.status === 'submitted') return 100;
    if (data.status === 'draft') return 50;
    return 0;
  }
  if (moduleKey === 'language') {
    return (data.classes?.length > 0) ? 100 : 0;
  }
  if (['awards', 'club', 'land', 'inquiry'].includes(moduleKey)) {
    return (data.rows?.length > 0) ? 100 : 0;
  }
  if (moduleKey === 'budget') {
    return (data.expense && data.revenue) ? 100 : 0;
  }
  if (moduleKey === 'library') {
    return (data.generalBooks != null && data.indigenousBooks != null) ? 100 : 0;
  }
  return Object.keys(data).length > 1 ? 100 : 0;
}

export function completionColor(pct) {
  if (pct === 100) return '#2F8F5B';
  if (pct === 0) return '#E3DFD3';
  return '#C9832F';
}
