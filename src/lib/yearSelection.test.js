import { describe, expect, it } from 'vitest';
import { resolveEffectiveYear } from './yearSelection';

describe('resolveEffectiveYear', () => {
  it('follows the latest year when the user has not picked one yet (selectedYear is null)', () => {
    expect(resolveEffectiveYear(['113', '114', '115'], null)).toBe('115');
  });

  it('keeps following the latest year as it changes, as long as nothing has been explicitly picked', () => {
    // Simulates src/App.jsx's Shell: the component re-renders as `years`
    // grows (e.g. the onSnapshot listener resolving after first paint, or a
    // new year being created mid-session), but `selectedYear` stays null
    // the whole time because the user never called setYear.
    expect(resolveEffectiveYear(['113', '114', '115'], null)).toBe('115');
    expect(resolveEffectiveYear(['113', '114', '115', '116'], null)).toBe('116');
  });

  it('honors an explicitly picked year, even when it is not the latest one', () => {
    expect(resolveEffectiveYear(['113', '114', '115', '116'], '114')).toBe('114');
  });

  it('falls back to the latest year once the explicitly picked year no longer exists', () => {
    expect(resolveEffectiveYear(['114', '115', '116'], '113')).toBe('116');
  });
});
