export function isNonNegativeIntegerString(value) {
  return typeof value === 'string' && /^\d+$/.test(value);
}

export function validateFixedFields(values, fields) {
  const invalidFields = fields.filter((field) => !isNonNegativeIntegerString(values[field]));
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
