export function activeTypedRecords(records, recordType) {
  if (!Array.isArray(records)) return [];
  return records.filter((record) => (
    record
    && !record.deletedAt
    && (!recordType || record.recordType === recordType)
  ));
}

export function budgetRecordSummary(records) {
  const expenseRows = activeTypedRecords(records, 'expense');
  const revenueRows = activeTypedRecords(records, 'revenue');
  return {
    expenseRows,
    revenueRows,
    expenseTotal: expenseRows.reduce((sum, record) => sum + Number(record.amount || 0), 0),
    revenueTotal: revenueRows.reduce((sum, record) => sum + Number(record.amount || 0), 0),
  };
}

// 決算 (actualAmount) is only known after the fiscal year closes, so it's
// filled in progressively — `actualTotal`/`hasActual` reflect only the rows
// that have it set, never a fabricated 0 for the rest. `complete` is true
// once every row has a settled figure, which is when a "年對年決算差異"
// comparison across rows is actually meaningful.
export function budgetVarianceSummary(rows) {
  const settledRows = rows.filter((record) => record.actualAmount != null);
  const budgetTotal = rows.reduce((sum, record) => sum + Number(record.amount || 0), 0);
  const actualTotal = settledRows.reduce((sum, record) => sum + Number(record.actualAmount || 0), 0);
  return {
    budgetTotal,
    actualTotal: settledRows.length > 0 ? actualTotal : null,
    hasActual: settledRows.length > 0,
    complete: rows.length > 0 && settledRows.length === rows.length,
    reasons: rows
      .filter((record) => record.varianceNote)
      .map((record) => ({ label: record.label, note: record.varianceNote })),
  };
}

export function languageRecordSummary(records) {
  return {
    classRows: activeTypedRecords(records, 'class'),
    certificationRows: activeTypedRecords(records, 'certification'),
    rosterRows: activeTypedRecords(records, 'roster'),
  };
}
