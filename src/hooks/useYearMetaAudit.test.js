import { createElement } from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const firebaseMocks = vi.hoisted(() => ({ db: { name: 'ltps-finance-data' } }));
const firestoreMocks = vi.hoisted(() => ({
  addDoc: vi.fn(),
  collection: vi.fn(),
  doc: vi.fn(),
  documentId: vi.fn(),
  getDoc: vi.fn(),
  getDocFromServer: vi.fn(),
  limit: vi.fn(),
  onSnapshot: vi.fn(),
  orderBy: vi.fn(),
  query: vi.fn(),
  serverTimestamp: vi.fn(),
  where: vi.fn(),
  writeBatch: vi.fn(),
}));

vi.mock('../firebase', () => ({
  db: firebaseMocks.db,
  isFirebaseConfigured: true,
}));
vi.mock('firebase/firestore', () => firestoreMocks);

const hookModule = await import('./useYearData.js');

function snapshot(data) {
  return data === null
    ? { exists: () => false, data: () => undefined }
    : { exists: () => true, data: () => data };
}

function auditSnapshot(entries) {
  return {
    docs: entries.map(({ id, ...data }) => ({ id, data: () => data })),
  };
}

function installHarness() {
  const subscriptions = [];
  firestoreMocks.collection.mockImplementation((_database, ...path) => ({ kind: 'collection', path }));
  firestoreMocks.doc.mockImplementation((_database, ...path) => ({ kind: 'doc', path }));
  firestoreMocks.where.mockImplementation((field, operator, value) => ({ type: 'where', field, operator, value }));
  firestoreMocks.orderBy.mockImplementation((field, direction) => ({ type: 'orderBy', field, direction }));
  firestoreMocks.limit.mockImplementation((value) => ({ type: 'limit', value }));
  firestoreMocks.query.mockImplementation((source, ...constraints) => ({ source, constraints }));
  firestoreMocks.onSnapshot.mockImplementation((target, onNext, onError) => {
    const subscription = { target, onNext, onError, unsubscribe: vi.fn() };
    subscriptions.push(subscription);
    return subscription.unsubscribe;
  });
  return { subscriptions };
}

function mountHook(useHook, initialArgs) {
  let current;
  let renderer;
  function Probe({ hookArgs }) {
    current = useHook(...hookArgs);
    return null;
  }
  act(() => {
    renderer = TestRenderer.create(createElement(Probe, { hookArgs: initialArgs }));
  });
  return {
    get current() { return current; },
    rerender(args) {
      act(() => renderer.update(createElement(Probe, { hookArgs: args })));
    },
    unmount() { act(() => renderer.unmount()); },
  };
}

describe('mounted useYearMeta write readiness', () => {
  beforeEach(() => vi.clearAllMocks());

  it('requires the active year document to be loaded, present, and unlocked, then revokes on error', () => {
    const harness = installHarness();
    const mounted = mountHook(hookModule.useYearMeta, ['115']);

    expect(mounted.current).toMatchObject({ meta: null, loading: true, exists: false, error: null });
    expect(mounted.current.authorizeWrite()).toMatchObject({ allowed: false, code: 'year-loading' });

    act(() => harness.subscriptions[0].onNext(snapshot(null)));
    expect(mounted.current).toMatchObject({ meta: null, loading: false, exists: false, error: null });
    expect(mounted.current.authorizeWrite()).toMatchObject({ allowed: false, code: 'year-missing' });

    act(() => harness.subscriptions[0].onNext(snapshot({ locked: false, deadlines: {} })));
    expect(mounted.current.authorizeWrite()).toMatchObject({
      allowed: true,
      code: 'year-writable',
      meta: { locked: false, deadlines: {} },
    });

    act(() => harness.subscriptions[0].onNext(snapshot({ locked: true, deadlines: {} })));
    expect(mounted.current.authorizeWrite()).toMatchObject({ allowed: false, code: 'year-locked' });

    const listenerError = new Error('permission denied');
    act(() => harness.subscriptions[0].onError(listenerError));
    expect(mounted.current).toMatchObject({ meta: null, loading: false, exists: false, error: listenerError });
    expect(mounted.current.authorizeWrite()).toMatchObject({ allowed: false, code: 'year-error' });
    mounted.unmount();
  });

  it('masks prior-year state and denies retained authorization callbacks after a year switch', () => {
    const harness = installHarness();
    const mounted = mountHook(hookModule.useYearMeta, ['114']);
    act(() => harness.subscriptions[0].onNext(snapshot({ locked: false })));
    const retained = mounted.current.authorizeWrite;

    mounted.rerender(['115']);
    expect(mounted.current).toMatchObject({ meta: null, loading: true, exists: false, error: null });
    expect(retained()).toMatchObject({ allowed: false });

    act(() => {
      harness.subscriptions[0].onNext(snapshot({ locked: false, stale: true }));
      harness.subscriptions[0].onError(new Error('stale error'));
    });
    expect(mounted.current).toMatchObject({ meta: null, loading: true, error: null });
    mounted.unmount();
  });

  it.each([
    ['missing', {}],
    ['null', { locked: null }],
    ['zero', { locked: 0 }],
    ['string false', { locked: 'false' }],
    ['boolean true', { locked: true }],
  ])('denies writes when locked is %s instead of exactly false', (_label, meta) => {
    const harness = installHarness();
    const mounted = mountHook(hookModule.useYearMeta, ['115']);

    act(() => harness.subscriptions[0].onNext(snapshot(meta)));

    expect(mounted.current).toMatchObject({ meta, loading: false, exists: true, error: null });
    expect(mounted.current.authorizeWrite()).toMatchObject({
      allowed: false,
      code: 'year-locked',
    });
    mounted.unmount();
  });
});

describe('module and audit scope readiness', () => {
  beforeEach(() => vi.clearAllMocks());

  it('exposes an imperative module readiness decision that revokes on listener error', () => {
    const harness = installHarness();
    const mounted = mountHook(hookModule.useYearModule, ['115', 'library']);

    expect(mounted.current.authorizeWrite()).toMatchObject({ allowed: false, code: 'module-loading' });
    act(() => harness.subscriptions[0].onNext(snapshot({ generalBooks: '1' })));
    expect(mounted.current.authorizeWrite()).toMatchObject({ allowed: true, code: 'module-writable' });
    act(() => harness.subscriptions[0].onError(new Error('permission denied')));
    expect(mounted.current.authorizeWrite()).toMatchObject({ allowed: false, code: 'module-error' });
    mounted.unmount();
  });

  it('filters auditLogs by module before ordering/limiting and reports loading, error, and data', () => {
    const harness = installHarness();
    const mounted = mountHook(hookModule.useAuditLog, ['115', { moduleKey: 'basic', max: 7 }]);

    expect(firestoreMocks.collection).toHaveBeenCalledWith(
      firebaseMocks.db,
      'years',
      '115',
      'auditLogs',
    );
    expect(firestoreMocks.query).toHaveBeenCalledWith(
      expect.anything(),
      { type: 'where', field: 'moduleKey', operator: '==', value: 'basic' },
      { type: 'orderBy', field: 'createdAt', direction: 'desc' },
      { type: 'limit', value: 7 },
    );
    expect(mounted.current).toEqual({ entries: [], loading: true, error: null });

    act(() => harness.subscriptions[0].onNext(auditSnapshot([
      { id: 'audit-1', actorName: '管理員', action: 'update' },
    ])));
    expect(mounted.current).toEqual({
      entries: [{ id: 'audit-1', actorName: '管理員', action: 'update' }],
      loading: false,
      error: null,
    });

    const error = new Error('audit denied');
    act(() => harness.subscriptions[0].onError(error));
    expect(mounted.current).toEqual({ entries: [], loading: false, error });
    mounted.unmount();
  });

  it('fails closed on A to B to A audit switches and ignores every stale callback', () => {
    const harness = installHarness();
    const mounted = mountHook(hookModule.useAuditLog, ['114', { moduleKey: 'basic', max: 5 }]);
    act(() => harness.subscriptions[0].onNext(auditSnapshot([{ id: 'old-a' }])));

    mounted.rerender(['115', { moduleKey: 'library', max: 5 }]);
    mounted.rerender(['114', { moduleKey: 'basic', max: 5 }]);
    expect(mounted.current).toEqual({ entries: [], loading: true, error: null });

    act(() => {
      harness.subscriptions[0].onNext(auditSnapshot([{ id: 'stale-a' }]));
      harness.subscriptions[0].onError(new Error('stale-a-error'));
      harness.subscriptions[1].onNext(auditSnapshot([{ id: 'stale-b' }]));
    });
    expect(mounted.current).toEqual({ entries: [], loading: true, error: null });

    act(() => harness.subscriptions[2].onNext(auditSnapshot([{ id: 'new-a' }])));
    expect(mounted.current.entries).toEqual([{ id: 'new-a' }]);
    mounted.unmount();
  });
});
