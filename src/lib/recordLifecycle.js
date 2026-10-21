/**
 * A record whose createdAt still equals its updatedAt has never been edited
 * since it was created — e.g. a row src/hooks/useYearData.js's
 * copyActiveRecords carried forward into a new year as an untouched
 * starting point, before anyone reviewed or confirmed it for that year.
 *
 * Soft-deleting such a row is labeled "移除" (plain removal) rather than
 * "停用" (disable) in the module pages — "停用" implies turning off
 * something that was actively confirmed/in use, which is misleading for
 * data nobody has looked at yet. The underlying action is identical either
 * way (deletedAt/deletedBy via an ordinary update, still reversible via
 * "復原", still kept for audit) — this only changes the button wording.
 */
export function isUntouchedSinceCreation(record) {
  const { createdAt, updatedAt } = record || {};
  if (!createdAt || !updatedAt) return false;
  if (typeof createdAt.isEqual === 'function') return createdAt.isEqual(updatedAt);
  return createdAt === updatedAt;
}

export function softDeleteVerb(record) {
  return isUntouchedSinceCreation(record) ? '移除' : '停用';
}
