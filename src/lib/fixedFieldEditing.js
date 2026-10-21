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

export function getDeadlineState(deadlines, moduleKey) {
  if (
    deadlines === null
    || deadlines === undefined
    || !Object.hasOwn(deadlines, moduleKey)
  ) {
    return { configured: false, invalid: false, deadline: null };
  }

  const deadline = parseLocalDeadlineEndOfDay(deadlines[moduleKey]);
  if (deadline === null) return { configured: true, invalid: true, deadline: null };
  return { configured: true, invalid: false, deadline };
}

/**
 * Builds the `extraCheck(yearDecision)` callback `useRecordCrudActions`
 * accepts, enforcing a module's 填報截止日 the same way Basic.jsx's own
 * hand-written checkInvocation already does — shared here so every module
 * page reports the deadline the same way instead of re-deriving the wording.
 * A module with no configured deadline is always allowed.
 */
export function deadlineExtraCheck(moduleKey, moduleTitle) {
  return (yearDecision) => {
    const state = getDeadlineState(yearDecision.meta?.deadlines, moduleKey);
    if (!state.configured) return { allowed: true };
    if (state.invalid) return { allowed: false, reason: `${moduleTitle}填報截止日格式錯誤，無法編輯。` };
    if (Date.now() > state.deadline.getTime()) {
      return { allowed: false, reason: `已超過${moduleTitle}填報截止日，無法編輯或儲存。` };
    }
    return { allowed: true };
  };
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
