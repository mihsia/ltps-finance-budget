import { describe, expect, it } from 'vitest';
import { isUntouchedSinceCreation, softDeleteVerb } from './recordLifecycle';

function timestamp(seconds) {
  return {
    seconds,
    isEqual(other) {
      return other?.seconds === seconds;
    },
  };
}

describe('isUntouchedSinceCreation', () => {
  it('is true when createdAt and updatedAt are the same Firestore Timestamp value', () => {
    expect(isUntouchedSinceCreation({ createdAt: timestamp(100), updatedAt: timestamp(100) })).toBe(true);
  });

  it('is false once updatedAt has moved past createdAt (the record was edited)', () => {
    expect(isUntouchedSinceCreation({ createdAt: timestamp(100), updatedAt: timestamp(200) })).toBe(false);
  });

  it('is false when either timestamp is missing, rather than guessing', () => {
    expect(isUntouchedSinceCreation({ createdAt: timestamp(100), updatedAt: null })).toBe(false);
    expect(isUntouchedSinceCreation({ createdAt: null, updatedAt: timestamp(100) })).toBe(false);
    expect(isUntouchedSinceCreation({})).toBe(false);
    expect(isUntouchedSinceCreation(null)).toBe(false);
  });

  it('falls back to a plain equality check when the value has no isEqual (e.g. a mocked timestamp in tests)', () => {
    const shared = { seconds: 1 };
    expect(isUntouchedSinceCreation({ createdAt: shared, updatedAt: shared })).toBe(true);
    expect(isUntouchedSinceCreation({ createdAt: { seconds: 1 }, updatedAt: { seconds: 1 } })).toBe(false);
  });
});

describe('softDeleteVerb', () => {
  it('returns 移除 for an untouched (just-copied) record and 停用 for an edited one', () => {
    expect(softDeleteVerb({ createdAt: timestamp(1), updatedAt: timestamp(1) })).toBe('移除');
    expect(softDeleteVerb({ createdAt: timestamp(1), updatedAt: timestamp(2) })).toBe('停用');
  });
});
