import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  doc, documentId, onSnapshot, collection, addDoc, serverTimestamp,
  query, where, orderBy, limit as fsLimit, getDoc, writeBatch,
} from 'firebase/firestore';
import { db, isFirebaseConfigured } from '../firebase';
import { yearDataRepository } from '../lib/yearDataRepository';

// Fallback used only until the /years collection has documents of its own
// (i.e. before the school's Firebase project has been seeded).
export const YEARS = ['113', '114', '115'];
export const CURRENT_YEAR = '115';

const MODULE_KEYS = ['basic', 'budget', 'library', 'language', 'awards', 'club', 'land', 'inquiry', 'budgetbook'];

export function yearRecordsScopeTag(year, moduleKey, includeDeleted = false) {
  return `${year}\0${moduleKey}\0${includeDeleted ? 1 : 0}`;
}

export function selectYearRecordsState(
  state,
  scopeTag,
  configured = isFirebaseConfigured,
  scopeGeneration,
) {
  if (!configured) return { data: [], loading: false, error: null };
  if (
    state.scopeTag !== scopeTag
    || (scopeGeneration && state.scopeGeneration !== scopeGeneration)
  ) {
    return { data: [], loading: true, error: null };
  }
  return { data: state.data, loading: state.loading, error: state.error };
}

export function selectYearModuleState(
  state,
  scopeTag,
  configured = isFirebaseConfigured,
  scopeGeneration,
) {
  if (!configured) {
    return { data: null, loading: false, exists: false, error: null };
  }
  if (
    state.scopeTag !== scopeTag
    || (scopeGeneration && state.scopeGeneration !== scopeGeneration)
  ) {
    return { data: null, loading: true, exists: false, error: null };
  }
  return {
    data: state.data,
    loading: state.loading,
    exists: state.exists,
    error: state.error,
  };
}

export class StaleYearRecordsScopeError extends Error {
  constructor() {
    super('The year records scope is no longer active.');
    this.name = 'StaleYearRecordsScopeError';
    this.code = 'stale-year-records-scope';
  }
}

export function createScopedYearRecordMutations({
  year,
  moduleKey,
  scopeGeneration,
  getActiveScope,
  repository = yearDataRepository,
}) {
  const assertCurrent = () => {
    if (getActiveScope() !== scopeGeneration) throw new StaleYearRecordsScopeError();
  };
  const run = async (method, values) => {
    assertCurrent();
    return repository[method]({
      year,
      moduleKey,
      ...values,
      assertCurrent,
    });
  };

  return {
    create: (data, actor) => run('createRecord', { data, actor }),
    update: (recordId, data, actor) => run('updateRecord', { recordId, data, actor }),
    delete: (recordId, actor) => run('deleteRecord', { recordId, actor }),
    restore: (recordId, actor) => run('restoreRecord', { recordId, actor }),
  };
}

export function createScopedYearModuleSave({
  year,
  moduleKey,
  scopeGeneration,
  getActiveScope,
  repository = yearDataRepository,
}) {
  const assertCurrent = () => {
    if (getActiveScope() !== scopeGeneration) throw new StaleYearRecordsScopeError();
  };

  return async (data, audit) => {
    assertCurrent();
    const mutation = {
      year,
      moduleKey,
      data,
      assertCurrent,
    };
    if (audit) mutation.audit = audit;
    return repository.saveModule(mutation);
  };
}

export function listenToYearRecords({
  database = db,
  year,
  moduleKey,
  includeDeleted = false,
  onState,
  collectionImpl = collection,
  queryImpl = query,
  orderByImpl = orderBy,
  documentIdImpl = documentId,
  onSnapshotImpl = onSnapshot,
}) {
  const scopeTag = yearRecordsScopeTag(year, moduleKey, includeDeleted);
  let active = true;
  onState({ scopeTag, data: [], loading: true, error: null });

  const recordsQuery = queryImpl(
    collectionImpl(database, 'years', year, 'modules', moduleKey, 'records'),
    orderByImpl('createdAt', 'asc'),
    orderByImpl(documentIdImpl(), 'asc'),
  );
  const unsubscribe = onSnapshotImpl(
    recordsQuery,
    (snapshot) => {
      if (!active) return;
      const data = snapshot.docs
        .map((record) => ({ ...record.data(), id: record.id }))
        .filter((record) => includeDeleted || !record.deletedAt);
      onState({ scopeTag, data, loading: false, error: null });
    },
    (error) => {
      if (!active) return;
      onState({ scopeTag, data: [], loading: false, error });
    },
  );

  return () => {
    active = false;
    unsubscribe?.();
  };
}

export function useYearRecords(year, moduleKey, { includeDeleted = false } = {}) {
  const scopeTag = yearRecordsScopeTag(year, moduleKey, includeDeleted);
  const scopeGeneration = useMemo(() => ({ scopeTag }), [scopeTag]);
  const currentGenerationRef = useRef(null);
  const activeSubscriptionRef = useRef(null);
  const mutationReadyRef = useRef(null);
  const accessStateRef = useRef(null);
  currentGenerationRef.current = isFirebaseConfigured ? scopeGeneration : null;
  if (mutationReadyRef.current !== scopeGeneration) mutationReadyRef.current = null;
  if (accessStateRef.current?.scopeGeneration !== scopeGeneration) {
    accessStateRef.current = {
      scopeGeneration,
      status: isFirebaseConfigured ? 'loading' : 'unavailable',
    };
  }
  const [state, setState] = useState(() => ({
    scopeTag,
    scopeGeneration,
    data: [],
    loading: isFirebaseConfigured,
    error: null,
  }));

  useEffect(() => {
    if (!isFirebaseConfigured) return undefined;
    const subscriptionToken = {};
    activeSubscriptionRef.current = subscriptionToken;
    mutationReadyRef.current = null;
    accessStateRef.current = { scopeGeneration, status: 'loading' };
    const stop = listenToYearRecords({
      year,
      moduleKey,
      includeDeleted,
      onState: (nextState) => {
        if (
          currentGenerationRef.current !== scopeGeneration
          || activeSubscriptionRef.current !== subscriptionToken
        ) return;
        if (nextState.loading || nextState.error) {
          mutationReadyRef.current = null;
        } else {
          mutationReadyRef.current = scopeGeneration;
        }
        accessStateRef.current = {
          scopeGeneration,
          status: nextState.error ? 'error' : (nextState.loading ? 'loading' : 'ready'),
        };
        if (nextState.error) activeSubscriptionRef.current = null;
        setState({ ...nextState, scopeGeneration });
      },
    });
    return () => {
      stop();
      if (activeSubscriptionRef.current === subscriptionToken) {
        activeSubscriptionRef.current = null;
        if (mutationReadyRef.current === scopeGeneration) mutationReadyRef.current = null;
        if (accessStateRef.current?.scopeGeneration === scopeGeneration) {
          accessStateRef.current = { scopeGeneration, status: 'stale' };
        }
      }
      if (currentGenerationRef.current === scopeGeneration) currentGenerationRef.current = null;
    };
  }, [year, moduleKey, includeDeleted, scopeGeneration]);

  const mutations = useMemo(() => createScopedYearRecordMutations({
    year,
    moduleKey,
    scopeGeneration,
    getActiveScope: () => mutationReadyRef.current,
  }), [year, moduleKey, scopeGeneration]);
  const visibleState = selectYearRecordsState(
    state,
    scopeTag,
    isFirebaseConfigured,
    scopeGeneration,
  );

  const authorizeWrite = useCallback(() => {
    const current = accessStateRef.current;
    if (
      currentGenerationRef.current !== scopeGeneration
      || current?.scopeGeneration !== scopeGeneration
    ) {
      return { allowed: false, code: 'records-stale', reason: '目前資料列範圍已變更，請重新操作。' };
    }
    if (current.status === 'ready' && mutationReadyRef.current === scopeGeneration) {
      return { allowed: true, code: 'records-writable', reason: null };
    }
    if (current.status === 'error') {
      return { allowed: false, code: 'records-error', reason: '無法確認資料列狀態，請稍後再試。' };
    }
    return { allowed: false, code: 'records-loading', reason: '正在確認資料列狀態，請稍候。' };
  }, [scopeGeneration]);

  return { ...visibleState, ...mutations, authorizeWrite };
}

/** Live list of fiscal years that exist under /years, sorted ascending. Falls back to the static defaults above. */
export function useAvailableYears() {
  const [years, setYears] = useState(YEARS);

  useEffect(() => {
    if (!isFirebaseConfigured) return;
    const q = query(collection(db, 'years'), orderBy('__name__'));
    const unsub = onSnapshot(q, (snap) => {
      const ids = snap.docs.map((d) => d.id);
      setYears(ids.length ? ids : YEARS);
    });
    return unsub;
  }, []);

  return years;
}

/** Creates the next fiscal year by copying every module doc from `fromYear`, then unlocking it. */
export async function createNextYear(fromYear) {
  const nextYear = String(Number(fromYear) + 1);
  const batch = writeBatch(db);
  batch.set(doc(db, 'years', nextYear), { locked: false, deadlines: {}, createdAt: serverTimestamp() });
  batch.set(doc(db, 'years', fromYear), { locked: true }, { merge: true });
  for (const key of MODULE_KEYS) {
    const fromSnap = await getDoc(doc(db, 'years', fromYear, 'modules', key));
    if (fromSnap.exists()) {
      const { updatedAt, ...rest } = fromSnap.data();
      batch.set(doc(db, 'years', nextYear, 'modules', key), rest);
    }
  }
  await batch.commit();
  return nextYear;
}

/** Live-subscribes to /years/{year}, giving lock state + per-module deadlines. */
export function useYearMeta(year) {
  const scopeGeneration = useMemo(() => ({ year }), [year]);
  const currentGenerationRef = useRef(null);
  const activeSubscriptionRef = useRef(null);
  const accessStateRef = useRef(null);
  currentGenerationRef.current = isFirebaseConfigured ? scopeGeneration : null;
  if (accessStateRef.current?.scopeGeneration !== scopeGeneration) {
    accessStateRef.current = {
      scopeGeneration,
      status: isFirebaseConfigured ? 'loading' : 'unavailable',
      meta: null,
    };
  }
  const [state, setState] = useState(() => ({
    scopeGeneration,
    meta: null,
    loading: isFirebaseConfigured,
    exists: false,
    error: null,
  }));

  useEffect(() => {
    if (!isFirebaseConfigured) return undefined;
    const subscriptionToken = {};
    activeSubscriptionRef.current = subscriptionToken;
    accessStateRef.current = { scopeGeneration, status: 'loading', meta: null };
    setState({
      scopeGeneration,
      meta: null,
      loading: true,
      exists: false,
      error: null,
    });
    const unsub = onSnapshot(
      doc(db, 'years', year),
      (snap) => {
        if (
          currentGenerationRef.current !== scopeGeneration
          || activeSubscriptionRef.current !== subscriptionToken
        ) return;
        const exists = snap.exists();
        const meta = exists ? snap.data() : null;
        accessStateRef.current = {
          scopeGeneration,
          status: exists ? (meta?.locked === false ? 'ready' : 'locked') : 'missing',
          meta,
        };
        setState({
          scopeGeneration,
          meta,
          loading: false,
          exists,
          error: null,
        });
      },
      (error) => {
        if (
          currentGenerationRef.current !== scopeGeneration
          || activeSubscriptionRef.current !== subscriptionToken
        ) return;
        activeSubscriptionRef.current = null;
        accessStateRef.current = { scopeGeneration, status: 'error', meta: null };
        setState({
          scopeGeneration,
          meta: null,
          loading: false,
          exists: false,
          error,
        });
      },
    );
    return () => {
      unsub?.();
      if (activeSubscriptionRef.current === subscriptionToken) {
        activeSubscriptionRef.current = null;
        if (accessStateRef.current?.scopeGeneration === scopeGeneration) {
          accessStateRef.current = { scopeGeneration, status: 'stale', meta: null };
        }
      }
      if (currentGenerationRef.current === scopeGeneration) currentGenerationRef.current = null;
    };
  }, [year, scopeGeneration]);

  const authorizeWrite = useCallback(() => {
    const current = accessStateRef.current;
    if (
      currentGenerationRef.current !== scopeGeneration
      || current?.scopeGeneration !== scopeGeneration
    ) {
      return { allowed: false, code: 'year-stale', reason: '目前選擇的年度已變更，請重新操作。' };
    }
    if (current.status === 'ready') {
      return { allowed: true, code: 'year-writable', reason: null, meta: current.meta };
    }
    if (current.status === 'missing') {
      return { allowed: false, code: 'year-missing', reason: '找不到此年度設定，無法儲存。' };
    }
    if (current.status === 'locked') {
      return { allowed: false, code: 'year-locked', reason: '此年度已鎖定，無法編輯或儲存。' };
    }
    if (current.status === 'error') {
      return { allowed: false, code: 'year-error', reason: '無法確認年度狀態，請稍後再試。' };
    }
    return { allowed: false, code: 'year-loading', reason: '正在確認年度狀態，請稍候。' };
  }, [scopeGeneration]);

  const visibleState = state.scopeGeneration === scopeGeneration
    ? state
    : {
      scopeGeneration,
      meta: null,
      loading: isFirebaseConfigured,
      exists: false,
      error: null,
    };

  return {
    meta: visibleState.meta,
    loading: visibleState.loading,
    exists: visibleState.exists,
    error: visibleState.error,
    authorizeWrite,
  };
}

/** Live-subscribes to /years/{year}/modules/{moduleKey}; save() writes back with merge. */
export function useYearModule(year, moduleKey) {
  const scopeTag = yearRecordsScopeTag(year, moduleKey);
  const scopeGeneration = useMemo(() => ({ scopeTag }), [scopeTag]);
  const currentGenerationRef = useRef(null);
  const activeSubscriptionRef = useRef(null);
  const mutationReadyRef = useRef(null);
  const accessStateRef = useRef(null);
  currentGenerationRef.current = isFirebaseConfigured ? scopeGeneration : null;
  if (mutationReadyRef.current !== scopeGeneration) mutationReadyRef.current = null;
  if (accessStateRef.current?.scopeGeneration !== scopeGeneration) {
    accessStateRef.current = {
      scopeGeneration,
      status: isFirebaseConfigured ? 'loading' : 'unavailable',
    };
  }
  const [state, setState] = useState(() => ({
    scopeTag,
    scopeGeneration,
    data: null,
    loading: isFirebaseConfigured,
    exists: false,
    error: null,
  }));

  useEffect(() => {
    if (!isFirebaseConfigured) return;
    const subscriptionToken = {};
    activeSubscriptionRef.current = subscriptionToken;
    mutationReadyRef.current = null;
    accessStateRef.current = { scopeGeneration, status: 'loading' };
    setState({
      scopeTag,
      scopeGeneration,
      data: null,
      loading: true,
      exists: false,
      error: null,
    });
    const ref = doc(db, 'years', year, 'modules', moduleKey);
    const unsub = onSnapshot(
      ref,
      (snap) => {
        if (
          currentGenerationRef.current !== scopeGeneration
          || activeSubscriptionRef.current !== subscriptionToken
        ) return;
        mutationReadyRef.current = scopeGeneration;
        accessStateRef.current = { scopeGeneration, status: 'ready' };
        setState({
          scopeTag,
          scopeGeneration,
          data: snap.exists() ? snap.data() : null,
          exists: snap.exists(),
          loading: false,
          error: null,
        });
      },
      (error) => {
        if (
          currentGenerationRef.current !== scopeGeneration
          || activeSubscriptionRef.current !== subscriptionToken
        ) return;
        mutationReadyRef.current = null;
        activeSubscriptionRef.current = null;
        accessStateRef.current = { scopeGeneration, status: 'error' };
        setState({
          scopeTag,
          scopeGeneration,
          data: null,
          exists: false,
          loading: false,
          error,
        });
      },
    );
    return () => {
      unsub();
      if (activeSubscriptionRef.current === subscriptionToken) {
        activeSubscriptionRef.current = null;
        if (mutationReadyRef.current === scopeGeneration) mutationReadyRef.current = null;
        if (accessStateRef.current?.scopeGeneration === scopeGeneration) {
          accessStateRef.current = { scopeGeneration, status: 'stale' };
        }
      }
      if (currentGenerationRef.current === scopeGeneration) currentGenerationRef.current = null;
    };
  }, [year, moduleKey, scopeTag, scopeGeneration]);

  const save = useMemo(() => createScopedYearModuleSave({
    year,
    moduleKey,
    scopeGeneration,
    getActiveScope: () => mutationReadyRef.current,
  }), [year, moduleKey, scopeGeneration]);

  const copyFrom = useCallback(async (fromYear) => {
    if (mutationReadyRef.current !== scopeGeneration) throw new StaleYearRecordsScopeError();
    const fromSnap = await getDoc(doc(db, 'years', fromYear, 'modules', moduleKey));
    if (!fromSnap.exists()) return;
    const { updatedAt, ...rest } = fromSnap.data();
    await save(rest);
  }, [moduleKey, save, scopeGeneration]);

  const authorizeWrite = useCallback(() => {
    const current = accessStateRef.current;
    if (
      currentGenerationRef.current !== scopeGeneration
      || current?.scopeGeneration !== scopeGeneration
    ) {
      return { allowed: false, code: 'module-stale', reason: '目前模組資料已變更，請重新操作。' };
    }
    if (current.status === 'ready' && mutationReadyRef.current === scopeGeneration) {
      return { allowed: true, code: 'module-writable', reason: null };
    }
    if (current.status === 'error') {
      return { allowed: false, code: 'module-error', reason: '無法確認模組資料狀態，請稍後再試。' };
    }
    return { allowed: false, code: 'module-loading', reason: '正在確認模組資料，請稍候。' };
  }, [scopeGeneration]);

  return {
    ...selectYearModuleState(
      state,
      scopeTag,
      isFirebaseConfigured,
      scopeGeneration,
    ),
    save,
    copyFrom,
    authorizeWrite,
  };
}

export function auditLogScopeTag(year, moduleKey, max) {
  return `${year}\0${moduleKey}\0${max}`;
}

export function useAuditLog(year, { moduleKey, max = 20 } = {}) {
  const scopeTag = auditLogScopeTag(year, moduleKey, max);
  const scopeGeneration = useMemo(() => ({ scopeTag }), [scopeTag]);
  const currentGenerationRef = useRef(scopeGeneration);
  const activeSubscriptionRef = useRef(null);
  currentGenerationRef.current = scopeGeneration;
  const [state, setState] = useState(() => ({
    scopeGeneration,
    entries: [],
    loading: isFirebaseConfigured,
    error: null,
  }));

  useEffect(() => {
    if (!isFirebaseConfigured) return undefined;
    const subscriptionToken = {};
    activeSubscriptionRef.current = subscriptionToken;
    setState({ scopeGeneration, entries: [], loading: true, error: null });
    const auditQuery = query(
      collection(db, 'years', year, 'auditLogs'),
      where('moduleKey', '==', moduleKey),
      orderBy('createdAt', 'desc'),
      fsLimit(max),
    );
    const unsub = onSnapshot(
      auditQuery,
      (snapshot) => {
        if (
          currentGenerationRef.current !== scopeGeneration
          || activeSubscriptionRef.current !== subscriptionToken
        ) return;
        setState({
          scopeGeneration,
          entries: snapshot.docs.map((entry) => ({ id: entry.id, ...entry.data() })),
          loading: false,
          error: null,
        });
      },
      (error) => {
        if (
          currentGenerationRef.current !== scopeGeneration
          || activeSubscriptionRef.current !== subscriptionToken
        ) return;
        activeSubscriptionRef.current = null;
        setState({ scopeGeneration, entries: [], loading: false, error });
      },
    );
    return () => {
      unsub?.();
      if (activeSubscriptionRef.current === subscriptionToken) {
        activeSubscriptionRef.current = null;
      }
    };
  }, [year, moduleKey, max, scopeGeneration]);

  if (state.scopeGeneration !== scopeGeneration) {
    return { entries: [], loading: isFirebaseConfigured, error: null };
  }
  return { entries: state.entries, loading: state.loading, error: state.error };
}

/**
 * Newest-first change log for a given year, plus a helper to append an entry.
 * Pass `moduleKey` to scope the list to one module (filtered client-side to
 * avoid requiring a composite index for what are always small collections).
 */
export function useChangeLog(year, { moduleKey, max = 20 } = {}) {
  const [entries, setEntries] = useState([]);

  useEffect(() => {
    if (!isFirebaseConfigured) return;
    const q = query(collection(db, 'years', year, 'changeLogs'), orderBy('time', 'desc'), fsLimit(max * 3));
    const unsub = onSnapshot(q, (snap) => {
      const all = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      const filtered = moduleKey ? all.filter((e) => e.module === moduleKey) : all;
      setEntries(filtered.slice(0, max));
    });
    return unsub;
  }, [year, max, moduleKey]);

  const appendChange = useCallback(async (module, user, field, from, to) => {
    await addDoc(collection(db, 'years', year, 'changeLogs'), {
      module, user, field, from, to, time: serverTimestamp(),
    });
  }, [year]);

  return { entries, appendChange };
}
