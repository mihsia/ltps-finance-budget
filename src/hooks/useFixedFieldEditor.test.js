import { createElement } from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { describe, expect, it } from 'vitest';
import { useFixedFieldEditor } from './useFixedFieldEditor.js';

const FIELDS = ['generalBooks', 'indigenousBooks'];

function mountEditor(data, scopeKey = '115\0library') {
  let current;
  let renderer;
  function Probe({ source, scope }) {
    current = useFixedFieldEditor({
      scopeKey: scope,
      data: source,
      fields: FIELDS,
    });
    return null;
  }
  act(() => {
    renderer = TestRenderer.create(createElement(Probe, { source: data, scope: scopeKey }));
  });
  return {
    get current() { return current; },
    rerender(source, scope = scopeKey) {
      act(() => renderer.update(createElement(Probe, { source, scope })));
    },
    unmount() { act(() => renderer.unmount()); },
  };
}

function startSubmission(mounted, nextValue = '11') {
  act(() => {
    mounted.current.beginEditing();
    mounted.current.updateField('generalBooks', nextValue);
  });
  let token;
  act(() => {
    token = mounted.current.beginSave({
      generalBooks: nextValue,
      indigenousBooks: '2',
    });
  });
  return token;
}

describe('useFixedFieldEditor source-version lifecycle', () => {
  it('freezes synchronously against duplicate saves and succeeds when the source does not change', () => {
    const source = { generalBooks: 1, indigenousBooks: 2, unrelated: { keep: true } };
    const mounted = mountEditor(source);
    const token = startSubmission(mounted);

    expect(token).toBeTruthy();
    expect(mounted.current.pending).toBe(true);
    expect(mounted.current.beginSave(mounted.current.form)).toBeNull();

    act(() => mounted.current.saveSucceeded(token));
    expect(mounted.current).toMatchObject({
      editing: false,
      pending: false,
      message: '儲存成功。',
    });
    mounted.unmount();
  });

  it('uses a successful no-echo submission as the baseline for the next edit', () => {
    const source = { generalBooks: 1, indigenousBooks: 2, unrelated: { keep: true } };
    const mounted = mountEditor(source);
    const token = startSubmission(mounted);

    act(() => mounted.current.saveSucceeded(token));
    act(() => mounted.current.beginEditing());

    expect(mounted.current).toMatchObject({
      form: { generalBooks: '11', indigenousBooks: '2' },
      editing: true,
      pending: false,
      message: null,
    });
    mounted.unmount();
  });

  it('does not cancel a newer edit when the successful no-echo submission arrives later', () => {
    const source = {
      generalBooks: 1,
      indigenousBooks: 2,
      unrelated: { keep: true },
      updatedAt: { seconds: 1 },
    };
    const mounted = mountEditor(source);
    const token = startSubmission(mounted);

    act(() => mounted.current.saveSucceeded(token));
    act(() => {
      mounted.current.beginEditing();
      mounted.current.updateField('generalBooks', '12');
    });
    mounted.rerender({
      generalBooks: '11',
      indigenousBooks: '2',
      unrelated: { keep: true },
      updatedAt: { seconds: 2 },
    });

    expect(mounted.current).toMatchObject({
      form: { generalBooks: '12', indigenousBooks: '2' },
      editing: true,
      pending: false,
      message: null,
    });
    mounted.unmount();
  });

  it('accepts exactly one exact type-preserving echo of the submitted fixed fields', () => {
    const source = {
      generalBooks: 1,
      indigenousBooks: 2,
      unrelated: { keep: true },
      updatedAt: { seconds: 1 },
    };
    const mounted = mountEditor(source);
    const token = startSubmission(mounted);

    mounted.rerender({
      generalBooks: '11',
      indigenousBooks: '2',
      unrelated: { keep: true },
      updatedAt: { seconds: 2 },
    });
    act(() => mounted.current.saveSucceeded(token));

    expect(mounted.current).toMatchObject({
      form: { generalBooks: '11', indigenousBooks: '2' },
      editing: false,
      pending: false,
      message: '儲存成功。',
    });
    mounted.unmount();
  });

  it('still rejects a repeated exact source publication during one pending save', () => {
    const source = {
      generalBooks: 1,
      indigenousBooks: 2,
      unrelated: { keep: true },
    };
    const mounted = mountEditor(source);
    const token = startSubmission(mounted);
    const echo = {
      generalBooks: '11',
      indigenousBooks: '2',
      unrelated: { keep: true },
    };

    mounted.rerender(echo);
    mounted.rerender({ ...echo });
    act(() => mounted.current.saveSucceeded(token));

    expect(mounted.current).toMatchObject({
      editing: false,
      pending: false,
      message: '資料已在儲存期間變更，已重新載入最新內容。',
    });
    mounted.unmount();
  });

  it.each([
    ['an intermediate value', { generalBooks: '10', indigenousBooks: '2', unrelated: { keep: true } }],
    ['an unrelated edit', { generalBooks: '11', indigenousBooks: '2', unrelated: { keep: false } }],
    ['a type mismatch', { generalBooks: 11, indigenousBooks: '2', unrelated: { keep: true } }],
  ])('resets safely when the source publishes %s', (_label, nextSource) => {
    const mounted = mountEditor({
      generalBooks: 1,
      indigenousBooks: 2,
      unrelated: { keep: true },
    });
    const token = startSubmission(mounted);

    mounted.rerender(nextSource);
    expect(mounted.current).toMatchObject({
      editing: false,
      pending: true,
      message: '資料已在儲存期間變更，已重新載入最新內容。',
    });
    act(() => mounted.current.saveSucceeded(token));
    expect(mounted.current).toMatchObject({
      editing: false,
      pending: false,
      message: '資料已在儲存期間變更，已重新載入最新內容。',
    });
    mounted.unmount();
  });

  it('invalidates retained controls and pending completion after a scope change or unmount', () => {
    const mounted = mountEditor({ generalBooks: 1, indigenousBooks: 2 });
    const retained = mounted.current;
    const token = startSubmission(mounted);

    mounted.rerender({ generalBooks: 5, indigenousBooks: 6 }, '114\0library');
    expect(mounted.current).toMatchObject({
      form: { generalBooks: '5', indigenousBooks: '6' },
      editing: false,
      pending: false,
    });
    act(() => {
      retained.beginEditing();
      retained.saveSucceeded(token);
    });
    expect(mounted.current.editing).toBe(false);

    const current = mounted.current;
    mounted.unmount();
    expect(current.beginEditing()).toBe(false);
  });
});
