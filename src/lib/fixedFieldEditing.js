export function isNonNegativeIntegerString(value) {
  return typeof value === 'string' && /^\d+$/.test(value);
}

// A blank field is treated as "not yet filled in" rather than invalid — these
// fields are all counts that default to 0 when unset (see Basic.jsx's own
// Number(value || 0) totals), so leaving one empty must not block saving the
// rest of the form.
export function validateFixedFields(values, fields) {
  const invalidFields = fields.filter((field) => {
    const value = values[field];
    return value !== '' && !isNonNegativeIntegerString(value);
  });
  return { valid: invalidFields.length === 0, invalidFields };
}

export function parseLocalDeadlineEndOfDay(value) {
  if (typeof value !== 'string') return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;

  const [, yearText, monthText, dayText] = match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;

  const parsed = new Date(0);
  parsed.setHours(23, 59, 59, 999);
  parsed.setFullYear(year, month - 1, day);
  if (
    parsed.getFullYear() !== year
    || parsed.getMonth() !== month - 1
    || parsed.getDate() !== day
  ) return null;
  return parsed;
}

// One system-wide 填報截止日 (not per-module) — `deadline` is a single
// "YYYY-MM-DD" string (or absent) directly on /years/{year}, set via the
// 歷史歸檔 admin UI's updateYearDeadline(). Every data-entry module checks
// this same value, so moving it earlier or later, or clearing it, changes
// the deadline for the whole system at once rather than module by module.
export function getDeadlineState(deadline) {
  if (deadline === null || deadline === undefined) {
    return { configured: false, invalid: false, deadline: null };
  }

  const parsed = parseLocalDeadlineEndOfDay(deadline);
  if (parsed === null) return { configured: true, invalid: true, deadline: null };
  return { configured: true, invalid: false, deadline: parsed };
}

/**
 * The `extraCheck(yearDecision)` callback `useRecordCrudActions` accepts,
 * enforcing the system-wide 填報截止日 the same way Basic.jsx's own
 * hand-written checkInvocation already does — shared here so every module
 * page reports the deadline the same way instead of re-deriving the
 * wording. No deadline configured means always allowed.
 */
export function deadlineExtraCheck(yearDecision) {
  const state = getDeadlineState(yearDecision.meta?.deadline);
  if (!state.configured) return { allowed: true };
  if (state.invalid) return { allowed: false, reason: '填報截止日格式錯誤，無法編輯。' };
  if (Date.now() > state.deadline.getTime()) {
    return { allowed: false, reason: '已超過填報截止日，無法編輯或儲存。' };
  }
  return { allowed: true };
}

/**
 * Calendar-day distance from `now` to a parsed deadline (as returned by
 * parseLocalDeadlineEndOfDay), ignoring time-of-day on both sides — 0 means
 * "today is the deadline", positive means days remaining, negative means
 * days overdue. Used by the Dashboard reminder card to phrase "剩 N 天" /
 * "已截止 N 天" without off-by-one surprises from the deadline's own
 * 23:59:59.999 time component.
 */
export function daysUntilDeadline(deadline, now = new Date()) {
  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);
  const startOfDeadlineDay = new Date(deadline);
  startOfDeadlineDay.setHours(0, 0, 0, 0);
  return Math.round((startOfDeadlineDay.getTime() - startOfToday.getTime()) / 86400000);
}

export function exactValueEqual(left, right) {
  if (Object.is(left, right)) return true;
  if (typeof left !== typeof right || left === null || right === null) return false;
  if (Array.isArray(left) || Array.isArray(right)) {
    if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) return false;
    return left.every((value, index) => exactValueEqual(value, right[index]));
  }
  if (typeof left !== 'object') return false;
  if (Object.getPrototypeOf(left) !== Object.getPrototypeOf(right)) return false;
  if (left instanceof Date) return left.getTime() === right.getTime();

  const leftKeys = Object.keys(left);
  const rightKeys = Object.keys(right);
  if (leftKeys.length !== rightKeys.length) return false;
  return leftKeys.every(
    (key) => Object.hasOwn(right, key) && exactValueEqual(left[key], right[key]),
  );
}
