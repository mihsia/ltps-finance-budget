import { readFile } from 'node:fs/promises';
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
    const scopeTag = hookModule.yearRecordsScopeTag('115', 'language');
    expect(hookModule.createScopedYearRecordMutations).toBeTypeOf('function');
    const mutations = hookModule.createScopedYearRecordMutations({
      year: '115',
      moduleKey: 'language',
      scopeTag,
      getActiveScope: () => scopeTag,
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
    const oldScope = hookModule.yearRecordsScopeTag('114', 'awards');
    let activeScope = oldScope;
    expect(hookModule.createScopedYearRecordMutations).toBeTypeOf('function');
    const retained = hookModule.createScopedYearRecordMutations({
      year: '114',
      moduleKey: 'awards',
      scopeTag: oldScope,
      getActiveScope: () => activeScope,
      repository,
    });
    activeScope = hookModule.yearRecordsScopeTag('115', 'club');
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
    const scopeTag = hookModule.yearRecordsScopeTag('115', 'basic');
    expect(hookModule.createScopedYearModuleSave).toBeTypeOf('function');
    const save = hookModule.createScopedYearModuleSave({
      year: '115',
      moduleKey: 'basic',
      scopeTag,
      getActiveScope: () => scopeTag,
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
    const oldScope = hookModule.yearRecordsScopeTag('114', 'basic');
    let activeScope = oldScope;
    expect(hookModule.createScopedYearModuleSave).toBeTypeOf('function');
    const retainedSave = hookModule.createScopedYearModuleSave({
      year: '114',
      moduleKey: 'basic',
      scopeTag: oldScope,
      getActiveScope: () => activeScope,
      repository,
    });
    activeScope = hookModule.yearRecordsScopeTag('115', 'library');

    await expect(retainedSave({ stale: true })).rejects.toMatchObject({
      code: 'stale-year-records-scope',
    });
    expect(repository.saveModule).not.toHaveBeenCalled();
  });

  it('routes the existing useYearModule save API through the scoped atomic repository save', async () => {
    const source = await readFile(new URL('./useYearData.js', import.meta.url), 'utf8');
    const hookSource = source.slice(
      source.indexOf('export function useYearModule'),
      source.indexOf('export function useChangeLog'),
    );

    expect(hookSource).toContain('createScopedYearModuleSave({');
    expect(hookSource).not.toContain('setDoc(');
  });
});
