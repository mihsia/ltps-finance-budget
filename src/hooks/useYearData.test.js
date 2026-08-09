import { createElement } from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const firebaseMocks = vi.hoisted(() => ({
  db: { name: 'ltps-finance-data' },
}));

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
  setDoc: vi.fn(),
  writeBatch: vi.fn(),
}));

vi.mock('../firebase', () => ({
  db: firebaseMocks.db,
  isFirebaseConfigured: true,
}));

vi.mock('firebase/firestore', () => firestoreMocks);

const hookModule = await import('./useYearData.js');

function recordSnapshot(records) {
  return {
    docs: records.map(({ id, ...data }) => ({
      id,
      data: () => data,
    })),
  };
}

function createListenerHarness() {
  const subscriptions = [];
  const states = [];
  const collectionImpl = vi.fn((_database, ...path) => ({ path }));
  const documentIdValue = { type: 'document-id-field-path' };
  const documentIdImpl = vi.fn(() => documentIdValue);
  const orderByImpl = vi.fn((field, direction) => ({ field, direction }));
  const queryImpl = vi.fn((source, ...constraints) => ({ source, constraints }));
  const onSnapshotImpl = vi.fn((queryValue, onNext, onError) => {
    const subscription = {
      queryValue,
      onNext,
      onError,
      unsubscribe: vi.fn(),
    };
    subscriptions.push(subscription);
    return subscription.unsubscribe;
  });

  return {
    collectionImpl,
    documentIdImpl,
    documentIdValue,
    onSnapshotImpl,
    orderByImpl,
    queryImpl,
    states,
    subscriptions,
  };
}

function deferred() {
  let resolve;
  const promise = new Promise((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

function moduleSnapshot(data) {
  return data === null
    ? { exists: () => false, data: () => undefined }
    : { exists: () => true, data: () => data };
}

function installMountedFirestoreHarness() {
  const subscriptions = [];
  const batches = [];
  let generatedId = 0;

  firestoreMocks.collection.mockImplementation((_database, ...path) => ({
    kind: 'collection',
    path,
  }));
  firestoreMocks.doc.mockImplementation((parent, ...path) => {
    if (parent?.kind === 'collection' && path.length === 0) {
      generatedId += 1;
      return {
        kind: 'doc',
        id: `generated-${generatedId}`,
        path: [...parent.path, `generated-${generatedId}`],
      };
    }
    return { kind: 'doc', id: path.at(-1), path };
  });
  firestoreMocks.documentId.mockReturnValue({ type: 'document-id' });
  firestoreMocks.orderBy.mockImplementation((field, direction) => ({ field, direction }));
  firestoreMocks.query.mockImplementation((source, ...constraints) => ({ source, constraints }));
  firestoreMocks.serverTimestamp.mockReturnValue({ type: 'server-timestamp' });
  firestoreMocks.getDocFromServer.mockResolvedValue(moduleSnapshot({ title: 'server value' }));
  firestoreMocks.writeBatch.mockImplementation(() => {
    const batch = {
      set: vi.fn(),
      commit: vi.fn().mockResolvedValue(undefined),
    };
    batches.push(batch);
    return batch;
  });
  firestoreMocks.onSnapshot.mockImplementation((target, onNext, onError) => {
    const subscription = {
      target,
      onNext,
      onError,
      unsubscribe: vi.fn(),
    };
    subscriptions.push(subscription);
    return subscription.unsubscribe;
  });

  return { batches, subscriptions };
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
    get current() {
      return current;
    },
    rerender(nextArgs) {
      act(() => {
        renderer.update(createElement(Probe, { hookArgs: nextArgs }));
      });
    },
    unmount() {
      act(() => renderer.unmount());
    },
  };
}

async function expectRecordMutationsDenied(result) {
  const actor = { uid: 'admin-lifecycle', name: '管理員' };
  await expect(result.create({ title: 'blocked' }, actor)).rejects.toMatchObject({
    code: 'stale-year-records-scope',
  });
  await expect(result.update('record-1', { title: 'blocked' }, actor)).rejects.toMatchObject({
    code: 'stale-year-records-scope',
  });
  await expect(result.delete('record-1', actor)).rejects.toMatchObject({
    code: 'stale-year-records-scope',
  });
  await expect(result.restore('record-1', actor)).rejects.toMatchObject({
    code: 'stale-year-records-scope',
  });
}

describe('useYearRecords listener', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('subscribes to the scoped records path with stable ordering and excludes soft-deleted data by default', () => {
    const harness = createListenerHarness();
    expect(hookModule.listenToYearRecords).toBeTypeOf('function');

    const stop = hookModule.listenToYearRecords({
      database: firebaseMocks.db,
      year: '115',
      moduleKey: 'budget',
      onState: (state) => harness.states.push(state),
      collectionImpl: harness.collectionImpl,
      documentIdImpl: harness.documentIdImpl,
      queryImpl: harness.queryImpl,
      orderByImpl: harness.orderByImpl,
      onSnapshotImpl: harness.onSnapshotImpl,
    });

    expect(harness.collectionImpl).toHaveBeenCalledWith(
      firebaseMocks.db,
      'years',
      '115',
      'modules',
      'budget',
      'records',
    );
    expect(harness.orderByImpl).toHaveBeenNthCalledWith(1, 'createdAt', 'asc');
    expect(harness.documentIdImpl).toHaveBeenCalledOnce();
    expect(harness.orderByImpl).toHaveBeenNthCalledWith(2, harness.documentIdValue, 'asc');
    expect(harness.states[0]).toEqual({
      scopeTag: '115\u0000budget\u00000',
      data: [],
      loading: true,
      error: null,
    });

    harness.subscriptions[0].onNext(recordSnapshot([
      { id: 'active-a', title: '保留 A', deletedAt: null },
      { id: 'deleted-b', title: '已停用', deletedAt: { seconds: 5 } },
      { id: 'active-c', title: '保留 C' },
    ]));

    expect(harness.states.at(-1)).toEqual({
      scopeTag: '115\u0000budget\u00000',
      data: [
        { id: 'active-a', title: '保留 A', deletedAt: null },
        { id: 'active-c', title: '保留 C' },
      ],
      loading: false,
      error: null,
    });

    stop();
    expect(harness.subscriptions[0].unsubscribe).toHaveBeenCalledOnce();
  });

  it('includes soft-deleted records when the recovery scope requests them', () => {
    const harness = createListenerHarness();

    hookModule.listenToYearRecords({
      database: firebaseMocks.db,
      year: '115',
      moduleKey: 'budget',
      includeDeleted: true,
      onState: (state) => harness.states.push(state),
      collectionImpl: harness.collectionImpl,
      queryImpl: harness.queryImpl,
      orderByImpl: harness.orderByImpl,
      onSnapshotImpl: harness.onSnapshotImpl,
    });
    harness.subscriptions[0].onNext(recordSnapshot([
      { id: 'active-a', title: '使用中', deletedAt: null },
      { id: 'deleted-b', title: '待復原', deletedAt: { seconds: 5 } },
    ]));

    expect(harness.states.at(-1)).toEqual({
      scopeTag: '115\u0000budget\u00001',
      data: [
        { id: 'active-a', title: '使用中', deletedAt: null },
        { id: 'deleted-b', title: '待復原', deletedAt: { seconds: 5 } },
      ],
      loading: false,
      error: null,
    });
  });

  it('fails closed across scope switches and ignores stale success and error callbacks', () => {
    const oldHarness = createListenerHarness();
    const oldStop = hookModule.listenToYearRecords({
      database: firebaseMocks.db,
      year: '114',
      moduleKey: 'awards',
      onState: (state) => oldHarness.states.push(state),
      collectionImpl: oldHarness.collectionImpl,
      queryImpl: oldHarness.queryImpl,
      orderByImpl: oldHarness.orderByImpl,
      onSnapshotImpl: oldHarness.onSnapshotImpl,
    });
    oldHarness.subscriptions[0].onNext(recordSnapshot([
      { id: 'old-record', title: '舊年度資料' },
    ]));
    const oldReadyState = oldHarness.states.at(-1);

    expect(hookModule.selectYearRecordsState).toBeTypeOf('function');
    expect(hookModule.selectYearRecordsState(
      oldReadyState,
      hookModule.yearRecordsScopeTag('115', 'club'),
      true,
    )).toEqual({ data: [], loading: true, error: null });

    oldStop();
    const stateCountAfterStop = oldHarness.states.length;
    oldHarness.subscriptions[0].onNext(recordSnapshot([
      { id: 'stale-success', title: '不得發布' },
    ]));
    oldHarness.subscriptions[0].onError(new Error('stale permission denied'));
    expect(oldHarness.states).toHaveLength(stateCountAfterStop);

    const currentHarness = createListenerHarness();
    hookModule.listenToYearRecords({
      database: firebaseMocks.db,
      year: '115',
      moduleKey: 'club',
      onState: (state) => currentHarness.states.push(state),
      collectionImpl: currentHarness.collectionImpl,
      queryImpl: currentHarness.queryImpl,
      orderByImpl: currentHarness.orderByImpl,
      onSnapshotImpl: currentHarness.onSnapshotImpl,
    });
    const currentError = new Error('permission denied');
    currentHarness.subscriptions[0].onError(currentError);
    expect(currentHarness.states.at(-1)).toEqual({
      scopeTag: '115\u0000club\u00000',
      data: [],
      loading: false,
      error: currentError,
    });
  });
});

describe('useYearRecords hook API', () => {
  it('exports the realtime record hook', () => {
    expect(hookModule.useYearRecords).toBeTypeOf('function');
  });
});

describe('mounted useYearRecords lifecycle', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('allows mutations only after an active snapshot and revokes them on listener error', async () => {
    const harness = installMountedFirestoreHarness();
    const mounted = mountHook(hookModule.useYearRecords, ['115', 'budget']);

    await expectRecordMutationsDenied(mounted.current);
    expect(firestoreMocks.getDocFromServer).not.toHaveBeenCalled();
    expect(firestoreMocks.writeBatch).not.toHaveBeenCalled();

    act(() => {
      harness.subscriptions[0].onNext(recordSnapshot([]));
    });
    await mounted.current.create(
      { title: 'active write' },
      { uid: 'admin-lifecycle', name: '管理員' },
    );
    expect(firestoreMocks.writeBatch).toHaveBeenCalledOnce();

    const activeError = new Error('permission denied');
    act(() => {
      harness.subscriptions[0].onError(activeError);
    });
    const readsAtError = firestoreMocks.getDocFromServer.mock.calls.length;
    const batchesAtError = firestoreMocks.writeBatch.mock.calls.length;
    await expectRecordMutationsDenied(mounted.current);
    expect(firestoreMocks.getDocFromServer).toHaveBeenCalledTimes(readsAtError);
    expect(firestoreMocks.writeBatch).toHaveBeenCalledTimes(batchesAtError);
    expect(mounted.current.error).toBe(activeError);

    mounted.unmount();
  });

  it('keeps every A generation isolated across A to B to A, including delayed server reads', async () => {
    const harness = installMountedFirestoreHarness();
    const mounted = mountHook(hookModule.useYearRecords, ['114', 'awards']);
    const actor = { uid: 'admin-generation', name: '管理員' };

    act(() => {
      harness.subscriptions[0].onNext(recordSnapshot([{ id: 'old-a', title: 'old A' }]));
    });
    const retainedOldA = mounted.current;
    const oldRead = deferred();
    firestoreMocks.getDocFromServer
      .mockReturnValueOnce(oldRead.promise)
      .mockResolvedValue(moduleSnapshot({ title: 'new A server value' }));
    const delayedOldAUpdate = retainedOldA.update('old-a', { title: 'stale update' }, actor);
    expect(firestoreMocks.getDocFromServer).toHaveBeenCalledOnce();

    mounted.rerender(['115', 'club']);
    await expectRecordMutationsDenied(mounted.current);
    act(() => {
      harness.subscriptions[1].onNext(recordSnapshot([]));
    });
    mounted.rerender(['114', 'awards']);
    const newA = mounted.current;
    await expectRecordMutationsDenied(newA);

    act(() => {
      harness.subscriptions[0].onNext(recordSnapshot([{ id: 'stale-success' }]));
      harness.subscriptions[0].onError(new Error('stale error'));
    });
    expect(mounted.current).toMatchObject({ data: [], loading: true, error: null });

    const batchesBeforeOldCompletion = firestoreMocks.writeBatch.mock.calls.length;
    oldRead.resolve(moduleSnapshot({ title: 'old A server value' }));
    await expect(delayedOldAUpdate).rejects.toMatchObject({
      code: 'stale-year-records-scope',
    });
    await expectRecordMutationsDenied(retainedOldA);
    expect(firestoreMocks.getDocFromServer).toHaveBeenCalledOnce();
    expect(firestoreMocks.writeBatch).toHaveBeenCalledTimes(batchesBeforeOldCompletion);

    act(() => {
      harness.subscriptions[2].onNext(recordSnapshot([]));
    });
    await newA.update('new-a', { title: 'current update' }, actor);
    expect(firestoreMocks.writeBatch).toHaveBeenCalledTimes(batchesBeforeOldCompletion + 1);

    mounted.unmount();
    await expect(newA.create({ title: 'after unmount' }, actor)).rejects.toMatchObject({
      code: 'stale-year-records-scope',
    });
  });
});

describe('mounted useYearModule lifecycle', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('allows save only after an active existing or missing snapshot and revokes it on error', async () => {
    const harness = installMountedFirestoreHarness();
    const mounted = mountHook(hookModule.useYearModule, ['115', 'basic']);

    await expect(mounted.current.save({ schoolName: 'blocked' })).rejects.toMatchObject({
      code: 'stale-year-records-scope',
    });
    expect(firestoreMocks.getDocFromServer).not.toHaveBeenCalled();
    expect(firestoreMocks.writeBatch).not.toHaveBeenCalled();

    act(() => {
      harness.subscriptions[0].onNext(moduleSnapshot(null));
    });
    await mounted.current.save({ schoolName: 'new document' });
    expect(firestoreMocks.writeBatch).toHaveBeenCalledOnce();

    const activeError = new Error('permission denied');
    act(() => {
      harness.subscriptions[0].onError(activeError);
    });
    await expect(mounted.current.save({ schoolName: 'blocked after error' })).rejects.toMatchObject({
      code: 'stale-year-records-scope',
    });
    expect(firestoreMocks.getDocFromServer).not.toHaveBeenCalled();
    expect(firestoreMocks.writeBatch).toHaveBeenCalledOnce();

    mounted.unmount();
  });

  it('ignores old A callbacks and saves when only the new A generation is ready', async () => {
    const harness = installMountedFirestoreHarness();
    const mounted = mountHook(hookModule.useYearModule, ['114', 'basic']);
    act(() => {
      harness.subscriptions[0].onNext(moduleSnapshot({ name: 'old A' }));
    });
    const retainedOldASave = mounted.current.save;
    const oldRead = deferred();
    firestoreMocks.getDocFromServer.mockReturnValueOnce(oldRead.promise);
    const delayedOldASave = retainedOldASave(
      { name: 'delayed stale A' },
      {
        action: 'update',
        actor: { uid: 'admin-generation', name: '管理員' },
      },
    );
    expect(firestoreMocks.getDocFromServer).toHaveBeenCalledOnce();

    mounted.rerender(['115', 'library']);
    await expect(mounted.current.save({ name: 'blocked B' })).rejects.toMatchObject({
      code: 'stale-year-records-scope',
    });
    act(() => {
      harness.subscriptions[1].onNext(moduleSnapshot({ name: 'B' }));
    });
    mounted.rerender(['114', 'basic']);
    const newASave = mounted.current.save;
    await expect(newASave({ name: 'blocked new A' })).rejects.toMatchObject({
      code: 'stale-year-records-scope',
    });

    act(() => {
      harness.subscriptions[0].onNext(moduleSnapshot({ name: 'stale A success' }));
      harness.subscriptions[0].onError(new Error('stale A error'));
    });
    expect(mounted.current).toMatchObject({
      data: null,
      loading: true,
      exists: false,
      error: null,
    });
    await expect(retainedOldASave({ name: 'stale A write' })).rejects.toMatchObject({
      code: 'stale-year-records-scope',
    });
    oldRead.resolve(moduleSnapshot({ name: 'old A server value' }));
    await expect(delayedOldASave).rejects.toMatchObject({
      code: 'stale-year-records-scope',
    });
    expect(firestoreMocks.getDocFromServer).toHaveBeenCalledOnce();
    expect(firestoreMocks.writeBatch).not.toHaveBeenCalled();

    act(() => {
      harness.subscriptions[2].onNext(moduleSnapshot({ name: 'new A' }));
    });
    await newASave({ name: 'current A write' });
    expect(firestoreMocks.writeBatch).toHaveBeenCalledOnce();

    mounted.unmount();
    await expect(newASave({ name: 'after unmount' })).rejects.toMatchObject({
      code: 'stale-year-records-scope',
    });
    expect(firestoreMocks.writeBatch).toHaveBeenCalledOnce();
  });
});

describe('useYearRecords mutations', () => {
  function createRepositorySpies() {
    return {
      createRecord: vi.fn().mockResolvedValue({ id: 'new-record' }),
      updateRecord: vi.fn().mockResolvedValue({ id: 'record-1' }),
      deleteRecord: vi.fn().mockResolvedValue({ id: 'record-1' }),
      restoreRecord: vi.fn().mockResolvedValue({ id: 'record-1' }),
    };
  }

  it('binds every mutation payload to the year and module scope that created it', async () => {
    const repository = createRepositorySpies();
    const scopeGeneration = {};
    expect(hookModule.createScopedYearRecordMutations).toBeTypeOf('function');
    const mutations = hookModule.createScopedYearRecordMutations({
      year: '115',
      moduleKey: 'language',
      scopeGeneration,
      getActiveScope: () => scopeGeneration,
      repository,
    });
    const actor = { uid: 'editor-5', name: '語文承辦' };

    await mutations.create({ language: '泰雅語' }, actor);
    await mutations.update('record-1', { students: 12 }, actor);
    await mutations.delete('record-1', actor);
    await mutations.restore('record-1', actor);

    expect(repository.createRecord).toHaveBeenCalledWith({
      year: '115',
      moduleKey: 'language',
      data: { language: '泰雅語' },
      actor,
      assertCurrent: expect.any(Function),
    });
    expect(repository.updateRecord).toHaveBeenCalledWith({
      year: '115',
      moduleKey: 'language',
      recordId: 'record-1',
      data: { students: 12 },
      actor,
      assertCurrent: expect.any(Function),
    });
    expect(repository.deleteRecord).toHaveBeenCalledWith({
      year: '115',
      moduleKey: 'language',
      recordId: 'record-1',
      actor,
      assertCurrent: expect.any(Function),
    });
    expect(repository.restoreRecord).toHaveBeenCalledWith({
      year: '115',
      moduleKey: 'language',
      recordId: 'record-1',
      actor,
      assertCurrent: expect.any(Function),
    });
  });

  it('makes retained callbacks from an old scope reject before any repository write starts', async () => {
    const repository = createRepositorySpies();
    const oldGeneration = {};
    let activeScope = oldGeneration;
    expect(hookModule.createScopedYearRecordMutations).toBeTypeOf('function');
    const retained = hookModule.createScopedYearRecordMutations({
      year: '114',
      moduleKey: 'awards',
      scopeGeneration: oldGeneration,
      getActiveScope: () => activeScope,
      repository,
    });
    activeScope = {};
    const actor = { uid: 'admin-6', name: '管理員' };

    await expect(retained.create({ title: 'stale' }, actor)).rejects.toMatchObject({
      name: 'StaleYearRecordsScopeError',
      code: 'stale-year-records-scope',
    });
    await expect(retained.update('old-1', { title: 'stale' }, actor)).rejects.toMatchObject({
      code: 'stale-year-records-scope',
    });
    await expect(retained.delete('old-1', actor)).rejects.toMatchObject({
      code: 'stale-year-records-scope',
    });
    await expect(retained.restore('old-1', actor)).rejects.toMatchObject({
      code: 'stale-year-records-scope',
    });

    expect(repository.createRecord).not.toHaveBeenCalled();
    expect(repository.updateRecord).not.toHaveBeenCalled();
    expect(repository.deleteRecord).not.toHaveBeenCalled();
    expect(repository.restoreRecord).not.toHaveBeenCalled();
  });
});

describe('useYearModule save scope', () => {
  it('fails closed instead of exposing module data from a previous year or module', () => {
    expect(hookModule.selectYearModuleState).toBeTypeOf('function');
    expect(hookModule.selectYearModuleState({
      scopeTag: hookModule.yearRecordsScopeTag('114', 'basic'),
      data: { schoolName: '舊年度校名' },
      loading: false,
      exists: true,
      error: null,
    }, hookModule.yearRecordsScopeTag('115', 'library'), true)).toEqual({
      data: null,
      loading: true,
      exists: false,
      error: null,
    });
  });

  it('keeps the unaudited save call shape and forwards optional audit data atomically', async () => {
    const repository = { saveModule: vi.fn().mockResolvedValue({ saved: true }) };
    const scopeGeneration = {};
    expect(hookModule.createScopedYearModuleSave).toBeTypeOf('function');
    const save = hookModule.createScopedYearModuleSave({
      year: '115',
      moduleKey: 'basic',
      scopeGeneration,
      getActiveScope: () => scopeGeneration,
      repository,
    });

    await save({ schoolName: '利澤國小' });
    const audit = {
      action: 'update',
      actor: { uid: 'admin-7', name: '管理員' },
    };
    await save({ schoolName: '利澤國小新名' }, audit);

    expect(repository.saveModule).toHaveBeenNthCalledWith(1, {
      year: '115',
      moduleKey: 'basic',
      data: { schoolName: '利澤國小' },
      assertCurrent: expect.any(Function),
    });
    expect(repository.saveModule).toHaveBeenNthCalledWith(2, {
      year: '115',
      moduleKey: 'basic',
      data: { schoolName: '利澤國小新名' },
      audit,
      assertCurrent: expect.any(Function),
    });
  });

  it('prevents a retained module save from an old year or module from writing', async () => {
    const repository = { saveModule: vi.fn() };
    const oldGeneration = {};
    let activeScope = oldGeneration;
    expect(hookModule.createScopedYearModuleSave).toBeTypeOf('function');
    const retainedSave = hookModule.createScopedYearModuleSave({
      year: '114',
      moduleKey: 'basic',
      scopeGeneration: oldGeneration,
      getActiveScope: () => activeScope,
      repository,
    });
    activeScope = {};

    await expect(retainedSave({ stale: true })).rejects.toMatchObject({
      code: 'stale-year-records-scope',
    });
    expect(repository.saveModule).not.toHaveBeenCalled();
  });

});
