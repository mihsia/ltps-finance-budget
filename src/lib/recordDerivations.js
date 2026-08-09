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

export function languageRecordSummary(records) {
  return {
    classRows: activeTypedRecords(records, 'class'),
    certificationRows: activeTypedRecords(records, 'certification'),
    rosterRows: activeTypedRecords(records, 'roster'),
  };
}
