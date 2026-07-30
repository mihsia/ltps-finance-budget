import { useEffect, useState, useCallback } from 'react';
import {
  doc, onSnapshot, setDoc, collection, addDoc, serverTimestamp,
  query, orderBy, limit as fsLimit, getDoc, writeBatch,
} from 'firebase/firestore';
import { db, isFirebaseConfigured } from '../firebase';

// Fallback used only until the /years collection has documents of its own
// (i.e. before the school's Firebase project has been seeded).
export const YEARS = ['113', '114', '115'];
export const CURRENT_YEAR = '115';

const MODULE_KEYS = ['basic', 'budget', 'library', 'language', 'awards', 'club', 'land', 'inquiry', 'budgetbook'];

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
  const [meta, setMeta] = useState(null);
  const [loading, setLoading] = useState(isFirebaseConfigured);

  useEffect(() => {
    if (!isFirebaseConfigured) return;
    setLoading(true);
    const unsub = onSnapshot(doc(db, 'years', year), (snap) => {
      setMeta(snap.exists() ? snap.data() : { locked: false, deadlines: {} });
      setLoading(false);
    });
    return unsub;
  }, [year]);

  return { meta, loading };
}

/** Live-subscribes to /years/{year}/modules/{moduleKey}; save() writes back with merge. */
export function useYearModule(year, moduleKey) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(isFirebaseConfigured);
  const [exists, setExists] = useState(false);

  useEffect(() => {
    if (!isFirebaseConfigured) return;
    setLoading(true);
    const ref = doc(db, 'years', year, 'modules', moduleKey);
    const unsub = onSnapshot(ref, (snap) => {
      setData(snap.exists() ? snap.data() : null);
      setExists(snap.exists());
      setLoading(false);
    });
    return unsub;
  }, [year, moduleKey]);

  const save = useCallback(async (next) => {
    const ref = doc(db, 'years', year, 'modules', moduleKey);
    await setDoc(ref, { ...next, updatedAt: serverTimestamp() }, { merge: true });
  }, [year, moduleKey]);

  const copyFrom = useCallback(async (fromYear) => {
    const fromSnap = await getDoc(doc(db, 'years', fromYear, 'modules', moduleKey));
    if (!fromSnap.exists()) return;
    const { updatedAt, ...rest } = fromSnap.data();
    await save(rest);
  }, [moduleKey, save]);

  return { data, loading, exists, save, copyFrom };
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
