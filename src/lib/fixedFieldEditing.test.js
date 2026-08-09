import { describe, expect, it } from 'vitest';
import {
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
});

describe('local deadline parsing', () => {
  it('treats only an absent own deadline property as no deadline', () => {
    const inheritedDeadline = Object.create({ basic: '2026-08-10' });

    expect(getDeadlineState({}, 'basic')).toMatchObject({ configured: false, invalid: false, deadline: null });
    expect(getDeadlineState(inheritedDeadline, 'basic')).toMatchObject({ configured: false, invalid: false, deadline: null });
    expect(getDeadlineState({ basic: '2026-08-10' }, 'basic')).toMatchObject({ configured: true, invalid: false });
  });

  it.each(['', null, 0, false, Number.NaN, undefined, '2026-02-30', 'not-a-date'])(
    'fails closed when the own deadline property has invalid value %s',
    (value) => {
      expect(getDeadlineState({ basic: value }, 'basic')).toEqual({
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
