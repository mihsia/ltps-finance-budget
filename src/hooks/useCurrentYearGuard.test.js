import { createElement } from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { describe, expect, it } from 'vitest';
import { useCurrentYearGuard } from './useCurrentYearGuard.js';

function mountGuard(year) {
  let current;
  let renderer;
  function Probe({ selectedYear }) {
    current = useCurrentYearGuard(selectedYear);
    return null;
  }
  act(() => {
    renderer = TestRenderer.create(createElement(Probe, { selectedYear: year }));
  });
  return {
    get current() { return current; },
    rerender(nextYear) {
      act(() => renderer.update(createElement(Probe, { selectedYear: nextYear })));
    },
    unmount() { act(() => renderer.unmount()); },
  };
}

describe('useCurrentYearGuard', () => {
  it('invalidates retained callbacks on year changes and unmount without crossing lifetimes', () => {
    const firstShell = mountGuard('114');
    const old114 = firstShell.current;
    expect(old114()).toBe(true);

    firstShell.rerender('115');
    const current115 = firstShell.current;
    expect(old114()).toBe(false);
    expect(current115()).toBe(true);

    firstShell.unmount();
    expect(current115()).toBe(false);

    const secondShell = mountGuard('115');
    const new115 = secondShell.current;
    expect(new115()).toBe(true);
    expect(current115()).toBe(false);

    secondShell.unmount();
    expect(new115()).toBe(false);
  });
});
