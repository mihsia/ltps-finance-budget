import { describe, expect, it, vi } from 'vitest';

let repositoryModule = {};
try {
  repositoryModule = await import('./yearDataRepository.js');
} catch {
  // The first RED run intentionally exercises the not-yet-created repository.
}

function createFirestoreHarness() {
  const database = { name: 'ltps-finance-data' };
  const timestamp = { _methodName: 'serverTimestamp' };
  const batches = [];
  let generatedId = 0;

  const collection = vi.fn((_parent, ...segments) => ({
    kind: 'collection',
    path: segments,
  }));
  const doc = vi.fn((parent, ...segments) => {
    if (parent?.kind === 'collection' && segments.length === 0) {
      generatedId += 1;
      return {
        kind: 'doc',
        id: `generated-${generatedId}`,
        path: [...parent.path, `generated-${generatedId}`],
      };
    }
    return {
      kind: 'doc',
      id: segments.at(-1),
      path: segments,
    };
  });
  const serverTimestamp = vi.fn(() => timestamp);
  const getDocFromServer = vi.fn();
  const writeBatch = vi.fn((receivedDatabase) => {
    const operations = [];
    const batch = {
      database: receivedDatabase,
      operations,
      set: vi.fn((ref, data, options) => {
        operations.push({ type: 'set', ref, data, options });
      }),
      delete: vi.fn((ref) => {
        operations.push({ type: 'delete', ref });
      }),
      commit: vi.fn().mockResolvedValue(undefined),
    };
    batches.push(batch);
    return batch;
  });

  return {
    batches,
    database,
    timestamp,
    firestore: {
      collection,
      doc,
      getDocFromServer,
      serverTimestamp,
      writeBatch,
    },
  };
}

function documentSnapshot(data) {
  return data === null
    ? { exists: () => false, data: () => undefined }
    : { exists: () => true, data: () => data };
}

function deferred() {
  let resolve;
  const promise = new Promise((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

describe('year data repository', () => {
  it('creates a generated record and its audit entry in one batch with one timestamp', async () => {
    const harness = createFirestoreHarness();
    expect(repositoryModule.createYearDataRepository).toBeTypeOf('function');
    const repository = repositoryModule.createYearDataRepository({
      database: harness.database,
      firestore: harness.firestore,
    });

    const result = await repository.createRecord({
      year: '115',
      moduleKey: 'budget',
      data: { title: '中央補助款', amount: 1200 },
      actor: { uid: 'admin-1', name: '管理員' },
    });

    expect(harness.firestore.collection).toHaveBeenCalledWith(
      harness.database,
      'years',
      '115',
      'modules',
      'budget',
      'records',
    );
    expect(harness.firestore.serverTimestamp).toHaveBeenCalledOnce();
    expect(harness.firestore.writeBatch).toHaveBeenCalledWith(harness.database);
    expect(harness.batches).toHaveLength(1);
    expect(harness.batches[0].commit).toHaveBeenCalledOnce();
    expect(harness.batches[0].operations).toHaveLength(2);

    const [recordWrite, auditWrite] = harness.batches[0].operations;
    expect(recordWrite).toEqual(expect.objectContaining({
      type: 'set',
      ref: expect.objectContaining({
        id: 'generated-1',
        path: ['years', '115', 'modules', 'budget', 'records', 'generated-1'],
      }),
      data: {
        title: '中央補助款',
        amount: 1200,
        createdAt: harness.timestamp,
        updatedAt: harness.timestamp,
        deletedAt: null,
        deletedBy: null,
      },
    }));
    expect(auditWrite.data).toEqual({
      moduleKey: 'budget',
      recordId: 'generated-1',
      action: 'create',
      actorUid: 'admin-1',
      actorName: '管理員',
      before: null,
      after: recordWrite.data,
      createdAt: harness.timestamp,
    });
    expect(result).toEqual({ id: 'generated-1', ...recordWrite.data });
  });

  it('re-reads an update from the server immediately before batching its before and after audit', async () => {
    const harness = createFirestoreHarness();
    const serverBefore = {
      title: '伺服器現值',
      amount: 100,
      createdAt: { seconds: 1 },
      deletedAt: null,
      deletedBy: null,
    };
    harness.firestore.getDocFromServer.mockResolvedValue(documentSnapshot(serverBefore));
    const repository = repositoryModule.createYearDataRepository({
      database: harness.database,
      firestore: harness.firestore,
    });
    expect(repository.updateRecord).toBeTypeOf('function');

    await repository.updateRecord({
      year: '115',
      moduleKey: 'budget',
      recordId: 'record-7',
      data: { title: '畫面送出的新值', amount: 250 },
      actor: { uid: 'editor-1', name: '承辦人' },
    });

    const [recordWrite, auditWrite] = harness.batches[0].operations;
    expect(harness.firestore.getDocFromServer).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'record-7',
        path: ['years', '115', 'modules', 'budget', 'records', 'record-7'],
      }),
    );
    expect(harness.firestore.getDocFromServer).toHaveBeenCalledOnce();
    expect(harness.firestore.getDocFromServer.mock.invocationCallOrder[0])
      .toBeLessThan(harness.firestore.writeBatch.mock.invocationCallOrder[0]);
    expect(recordWrite.data).toEqual({
      ...serverBefore,
      title: '畫面送出的新值',
      amount: 250,
      updatedAt: harness.timestamp,
    });
    expect(auditWrite.data).toEqual({
      moduleKey: 'budget',
      recordId: 'record-7',
      action: 'update',
      actorUid: 'editor-1',
      actorName: '承辦人',
      before: serverBefore,
      after: recordWrite.data,
      createdAt: harness.timestamp,
    });
    expect(harness.firestore.serverTimestamp).toHaveBeenCalledOnce();
    expect(harness.batches[0].commit).toHaveBeenCalledOnce();
  });

  it('keeps deletion and creation metadata under repository control during ordinary updates', async () => {
    const harness = createFirestoreHarness();
    const serverBefore = {
      title: '已停用資料',
      createdAt: { seconds: 1 },
      updatedAt: { seconds: 2 },
      deletedAt: { seconds: 3 },
      deletedBy: 'admin-original',
    };
    harness.firestore.getDocFromServer.mockResolvedValue(documentSnapshot(serverBefore));
    const repository = repositoryModule.createYearDataRepository({
      database: harness.database,
      firestore: harness.firestore,
    });

    await repository.updateRecord({
      year: '115',
      moduleKey: 'budget',
      recordId: 'record-protected',
      data: {
        title: '一般欄位可更新',
        createdAt: null,
        updatedAt: null,
        deletedAt: null,
        deletedBy: null,
      },
      actor: { uid: 'editor-1', name: '承辦人' },
    });

    expect(harness.batches[0].operations[0].data).toEqual({
      ...serverBefore,
      title: '一般欄位可更新',
      updatedAt: harness.timestamp,
    });
  });

  it('soft-deletes the server value and audits it without a hard delete', async () => {
    const harness = createFirestoreHarness();
    const serverBefore = {
      title: '待停用資料',
      createdAt: { seconds: 1 },
      updatedAt: { seconds: 2 },
      deletedAt: null,
      deletedBy: null,
    };
    harness.firestore.getDocFromServer.mockResolvedValue(documentSnapshot(serverBefore));
    const repository = repositoryModule.createYearDataRepository({
      database: harness.database,
      firestore: harness.firestore,
    });
    expect(repository.deleteRecord).toBeTypeOf('function');

    await repository.deleteRecord({
      year: '115',
      moduleKey: 'awards',
      recordId: 'award-2',
      actor: { uid: 'admin-2', name: '系統管理員' },
    });

    expect(harness.firestore.getDocFromServer.mock.invocationCallOrder[0])
      .toBeLessThan(harness.firestore.writeBatch.mock.invocationCallOrder[0]);
    const [recordWrite, auditWrite] = harness.batches[0].operations;
    expect(recordWrite).toEqual(expect.objectContaining({
      type: 'set',
      ref: expect.objectContaining({ id: 'award-2' }),
      data: {
        ...serverBefore,
        deletedAt: harness.timestamp,
        deletedBy: 'admin-2',
        updatedAt: harness.timestamp,
      },
    }));
    expect(harness.batches[0].delete).not.toHaveBeenCalled();
    expect(auditWrite.data).toEqual({
      moduleKey: 'awards',
      recordId: 'award-2',
      action: 'delete',
      actorUid: 'admin-2',
      actorName: '系統管理員',
      before: serverBefore,
      after: recordWrite.data,
      createdAt: harness.timestamp,
    });
    expect(harness.firestore.serverTimestamp).toHaveBeenCalledOnce();
  });

  it('restores the server value by normalizing both deletion fields and auditing the result', async () => {
    const harness = createFirestoreHarness();
    const serverBefore = {
      title: '已停用資料',
      createdAt: { seconds: 1 },
      updatedAt: { seconds: 2 },
      deletedAt: { seconds: 3 },
      deletedBy: 'admin-2',
    };
    harness.firestore.getDocFromServer.mockResolvedValue(documentSnapshot(serverBefore));
    const repository = repositoryModule.createYearDataRepository({
      database: harness.database,
      firestore: harness.firestore,
    });
    expect(repository.restoreRecord).toBeTypeOf('function');

    await repository.restoreRecord({
      year: '114',
      moduleKey: 'club',
      recordId: 'club-4',
      actor: { uid: 'admin-3', name: '復原者' },
    });

    expect(harness.firestore.getDocFromServer.mock.invocationCallOrder[0])
      .toBeLessThan(harness.firestore.writeBatch.mock.invocationCallOrder[0]);
    const [recordWrite, auditWrite] = harness.batches[0].operations;
    expect(recordWrite.data).toEqual({
      ...serverBefore,
      deletedAt: null,
      deletedBy: null,
      updatedAt: harness.timestamp,
    });
    expect(auditWrite.data).toEqual({
      moduleKey: 'club',
      recordId: 'club-4',
      action: 'restore',
      actorUid: 'admin-3',
      actorName: '復原者',
      before: serverBefore,
      after: recordWrite.data,
      createdAt: harness.timestamp,
    });
    expect(harness.firestore.serverTimestamp).toHaveBeenCalledOnce();
    expect(harness.batches[0].delete).not.toHaveBeenCalled();
  });

  it('saves a module atomically without requiring audit options from current callers', async () => {
    const harness = createFirestoreHarness();
    const repository = repositoryModule.createYearDataRepository({
      database: harness.database,
      firestore: harness.firestore,
    });
    expect(repository.saveModule).toBeTypeOf('function');

    await repository.saveModule({
      year: '115',
      moduleKey: 'basic',
      data: { schoolName: '利澤國小' },
    });

    expect(harness.firestore.getDocFromServer).not.toHaveBeenCalled();
    expect(harness.firestore.serverTimestamp).toHaveBeenCalledOnce();
    expect(harness.batches[0].operations).toEqual([
      expect.objectContaining({
        type: 'set',
        ref: expect.objectContaining({
          path: ['years', '115', 'modules', 'basic'],
        }),
        data: {
          schoolName: '利澤國小',
          updatedAt: harness.timestamp,
        },
        options: { merge: true },
      }),
    ]);
    expect(harness.batches[0].commit).toHaveBeenCalledOnce();
  });

  it('re-reads and saves an audited module mutation in the same batch', async () => {
    const harness = createFirestoreHarness();
    const serverBefore = {
      schoolName: '伺服器校名',
      classes: 10,
      updatedAt: { seconds: 4 },
    };
    harness.firestore.getDocFromServer.mockResolvedValue(documentSnapshot(serverBefore));
    const repository = repositoryModule.createYearDataRepository({
      database: harness.database,
      firestore: harness.firestore,
    });

    await repository.saveModule({
      year: '115',
      moduleKey: 'basic',
      data: { schoolName: '最新校名' },
      audit: {
        action: 'update',
        actor: { uid: 'admin-4', name: '校務管理員' },
      },
    });

    expect(harness.firestore.getDocFromServer).toHaveBeenCalledOnce();
    expect(harness.firestore.getDocFromServer.mock.invocationCallOrder[0])
      .toBeLessThan(harness.firestore.writeBatch.mock.invocationCallOrder[0]);
    const [moduleWrite, auditWrite] = harness.batches[0].operations;
    expect(moduleWrite.data).toEqual({
      ...serverBefore,
      schoolName: '最新校名',
      updatedAt: harness.timestamp,
    });
    expect(moduleWrite.options).toEqual({ merge: true });
    expect(auditWrite.data).toEqual({
      moduleKey: 'basic',
      recordId: null,
      action: 'update',
      actorUid: 'admin-4',
      actorName: '校務管理員',
      before: serverBefore,
      after: moduleWrite.data,
      createdAt: harness.timestamp,
    });
    expect(harness.firestore.serverTimestamp).toHaveBeenCalledOnce();
    expect(harness.batches[0].commit).toHaveBeenCalledOnce();
  });

  it.each(['updateRecord', 'deleteRecord', 'restoreRecord', 'saveModule'])(
    'rechecks the active scope after the server read before %s creates a batch',
    async (method) => {
      const harness = createFirestoreHarness();
      const serverRead = deferred();
      harness.firestore.getDocFromServer.mockReturnValue(serverRead.promise);
      const repository = repositoryModule.createYearDataRepository({
        database: harness.database,
        firestore: harness.firestore,
      });
      let active = true;
      const staleError = Object.assign(new Error('stale scope'), {
        code: 'stale-year-records-scope',
      });
      const assertCurrent = vi.fn(() => {
        if (!active) throw staleError;
      });
      const common = {
        year: '115',
        moduleKey: 'budget',
        actor: { uid: 'admin-8', name: '管理員' },
        assertCurrent,
      };
      const mutation = method === 'saveModule'
        ? repository.saveModule({
          ...common,
          data: { note: 'new' },
          audit: { action: 'update', actor: common.actor },
        })
        : repository[method]({
          ...common,
          recordId: 'record-8',
          ...(method === 'updateRecord' ? { data: { note: 'new' } } : {}),
        });

      active = false;
      serverRead.resolve(documentSnapshot({ note: 'server value' }));

      await expect(mutation).rejects.toBe(staleError);
      expect(assertCurrent).toHaveBeenCalled();
      expect(harness.firestore.writeBatch).not.toHaveBeenCalled();
    },
  );
});
