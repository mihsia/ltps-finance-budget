import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  daysUntilDeadline,
  deadlineExtraCheck,
  exactValueEqual,
  getDeadlineState,
  isNonNegativeIntegerString,
  parseLocalDeadlineEndOfDay,
  validateFixedFields,
} from './fixedFieldEditing.js';

describe('fixed-field validation', () => {
  it.each(['0', '7', '0012'])("accepts the nonnegative integer string '%s'", (value) => {
    expect(isNonNegativeIntegerString(value)).toBe(true);
  });

  it.each(['', ' 1', '1 ', '-1', '1.5', 1, null, undefined])(
    "rejects the non-integer-string value '%s'",
    (value) => {
      expect(isNonNegativeIntegerString(value)).toBe(false);
    },
  );

  it('checks every named fixed field instead of validating only one count', () => {
    const fields = ['classes', 'students', 'staff'];

    expect(validateFixedFields({ classes: '1', students: '2', staff: '-1' }, fields))
      .toEqual({ valid: false, invalidFields: ['staff'] });
    expect(validateFixedFields({ classes: '1', students: '2', staff: '0' }, fields))
      .toEqual({ valid: true, invalidFields: [] });
  });

  it('treats a blank field as not-yet-filled-in rather than invalid', () => {
    const fields = ['classes', 'students', 'staff'];

    expect(validateFixedFields({ classes: '1', students: '', staff: '0' }, fields))
      .toEqual({ valid: true, invalidFields: [] });
    expect(validateFixedFields({ classes: '1', students: '', staff: '-1' }, fields))
      .toEqual({ valid: false, invalidFields: ['staff'] });
  });
});

describe('local deadline parsing', () => {
  it('treats a missing deadline (null/undefined) as not configured', () => {
    expect(getDeadlineState(null)).toEqual({ configured: false, invalid: false, deadline: null });
    expect(getDeadlineState(undefined)).toEqual({ configured: false, invalid: false, deadline: null });
    expect(getDeadlineState('2026-08-10')).toMatchObject({ configured: true, invalid: false });
  });

  it.each(['', 0, false, Number.NaN, '2026-02-30', 'not-a-date'])(
    'fails closed when the deadline value %s is present but invalid',
    (value) => {
      expect(getDeadlineState(value)).toEqual({
        configured: true,
        invalid: true,
        deadline: null,
      });
    },
  );

  it('uses local end-of-day and preserves years from 0000 through 0099', () => {
    const deadline = parseLocalDeadlineEndOfDay('0099-02-03');

    expect(deadline?.getFullYear()).toBe(99);
    expect(deadline?.getMonth()).toBe(1);
    expect(deadline?.getDate()).toBe(3);
    expect(deadline?.getHours()).toBe(23);
    expect(deadline?.getMinutes()).toBe(59);
    expect(deadline?.getSeconds()).toBe(59);
    expect(deadline?.getMilliseconds()).toBe(999);
  });

  it.each(['not-a-date', '2026-02-30', '2026-13-01', '26-08-09', null, ''])(
    "rejects invalid deadline '%s'",
    (value) => {
      expect(parseLocalDeadlineEndOfDay(value)).toBeNull();
    },
  );
});

describe('daysUntilDeadline', () => {
  it('returns 0 when the deadline falls today, regardless of the current time of day', () => {
    const deadline = parseLocalDeadlineEndOfDay('2026-08-10');
    expect(daysUntilDeadline(deadline, new Date(2026, 7, 10, 0, 0, 1))).toBe(0);
    expect(daysUntilDeadline(deadline, new Date(2026, 7, 10, 23, 0, 0))).toBe(0);
  });

  it('counts whole calendar days remaining for a future deadline', () => {
    const deadline = parseLocalDeadlineEndOfDay('2026-08-13');
    expect(daysUntilDeadline(deadline, new Date(2026, 7, 10, 9, 0, 0))).toBe(3);
  });

  it('returns a negative count for an overdue deadline', () => {
    const deadline = parseLocalDeadlineEndOfDay('2026-08-10');
    expect(daysUntilDeadline(deadline, new Date(2026, 7, 13, 9, 0, 0))).toBe(-3);
  });
});

describe('deadlineExtraCheck', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('allows the write when there is no configured system-wide deadline', () => {
    expect(deadlineExtraCheck({ meta: { deadline: null } })).toEqual({ allowed: true });
    expect(deadlineExtraCheck({ meta: {} })).toEqual({ allowed: true });
  });

  it('blocks the write once past the one system-wide deadline', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 7, 10, 0, 0, 1));

    expect(deadlineExtraCheck({ meta: { deadline: '2026-08-09' } }))
      .toEqual({ allowed: false, reason: '已超過填報截止日，無法編輯或儲存。' });
    expect(deadlineExtraCheck({ meta: { deadline: '2026-08-10' } })).toEqual({ allowed: true });
  });

  it('blocks the write when the deadline value is invalid', () => {
    expect(deadlineExtraCheck({ meta: { deadline: 'not-a-date' } }))
      .toEqual({ allowed: false, reason: '填報截止日格式錯誤，無法編輯。' });
  });
});

describe('exact source comparisons', () => {
  it('is recursive and type-preserving', () => {
    expect(exactValueEqual(
      { counts: ['1', { value: 2 }], note: null },
      { counts: ['1', { value: 2 }], note: null },
    )).toBe(true);
    expect(exactValueEqual({ value: '2' }, { value: 2 })).toBe(false);
    expect(exactValueEqual({ value: 2 }, { value: 2, unrelated: true })).toBe(false);
  });

  it('does not mistake different Date values or object prototypes for exact echoes', () => {
    expect(exactValueEqual(new Date(0), new Date(1))).toBe(false);
    expect(exactValueEqual(new Date(0), new Date(0))).toBe(true);
    expect(exactValueEqual(Object.create(null), {})).toBe(false);
  });
});
