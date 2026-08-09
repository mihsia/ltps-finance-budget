import {
  collection,
  doc,
  getDocFromServer,
  serverTimestamp,
  writeBatch,
} from 'firebase/firestore';
import { db } from '../firebase';

const defaultFirestore = {
  collection,
  doc,
  getDocFromServer,
  serverTimestamp,
  writeBatch,
};

const RECORD_METADATA_FIELDS = new Set([
  'recordType',
  'createdAt',
  'updatedAt',
  'deletedAt',
  'deletedBy',
]);

function assertRecordTypeUnchanged(before, data) {
  if (
    Object.hasOwn(before, 'recordType')
    && Object.hasOwn(data, 'recordType')
    && data.recordType !== before.recordType
  ) {
    const error = new Error('Record type cannot be changed by an ordinary update.');
    error.code = 'record-type-immutable';
    throw error;
  }
}

function editableRecordData(data) {
  return Object.fromEntries(
    Object.entries(data).filter(([field]) => !RECORD_METADATA_FIELDS.has(field)),
  );
}

function auditData({ moduleKey, recordId, action, actor, before, after, timestamp }) {
  return {
    moduleKey,
    recordId,
    action,
    actorUid: actor.uid,
    actorName: actor.name,
    before,
    after,
    createdAt: timestamp,
  };
}

function auditFields(data, fields) {
  if (!Array.isArray(fields)) return data;
  if (data === null) return null;
  return Object.fromEntries(
    fields
      .filter((field) => Object.hasOwn(data, field))
      .map((field) => [field, data[field]]),
  );
}

export function createYearDataRepository({
  database = db,
  firestore = defaultFirestore,
} = {}) {
  const saveModule = async ({
    year,
    moduleKey,
    data,
    audit = null,
    assertCurrent = () => {},
  }) => {
    const moduleRef = firestore.doc(database, 'years', year, 'modules', moduleKey);
    const snapshot = audit
      ? await firestore.getDocFromServer(moduleRef)
      : null;
    assertCurrent();
    const batch = firestore.writeBatch(database);
    const timestamp = firestore.serverTimestamp();
    const before = snapshot?.exists() ? snapshot.data() : null;
    const after = { ...before, ...data, updatedAt: timestamp };
    batch.set(moduleRef, after, { merge: true });
    if (audit) {
      const auditRef = firestore.doc(
        firestore.collection(database, 'years', year, 'auditLogs'),
      );
      batch.set(auditRef, auditData({
        moduleKey,
        recordId: null,
        action: audit.action || (snapshot.exists() ? 'update' : 'create'),
        actor: audit.actor,
        before: auditFields(before, audit.fields),
        after: auditFields(after, audit.fields),
        timestamp,
      }));
    }
    await batch.commit();
    return after;
  };

  const createRecord = async ({
    year,
    moduleKey,
    data,
    actor,
    assertCurrent = () => {},
  }) => {
    const recordsRef = firestore.collection(
      database,
      'years',
      year,
      'modules',
      moduleKey,
      'records',
    );
    const recordRef = firestore.doc(recordsRef);
    const auditRef = firestore.doc(
      firestore.collection(database, 'years', year, 'auditLogs'),
    );
    const timestamp = firestore.serverTimestamp();
    const after = {
      ...data,
      createdAt: timestamp,
      updatedAt: timestamp,
      deletedAt: null,
      deletedBy: null,
    };
    assertCurrent();
    const batch = firestore.writeBatch(database);
    batch.set(recordRef, after);
    batch.set(auditRef, auditData({
      moduleKey,
      recordId: recordRef.id,
      action: 'create',
      actor,
      before: null,
      after,
      timestamp,
    }));
    await batch.commit();
    return { id: recordRef.id, ...after };
  };

  const importRecords = async ({
    year,
    moduleKey,
    records,
    actor,
    yearData = null,
    assertCurrent = () => {},
  }) => {
    assertCurrent();
    const timestamp = firestore.serverTimestamp();
    const batch = firestore.writeBatch(database);
    if (yearData) {
      const yearRef = firestore.doc(database, 'years', year);
      batch.set(yearRef, { ...yearData, createdAt: timestamp }, { merge: true });
    }

    const imported = records.map((data) => {
      const recordRef = firestore.doc(firestore.collection(
        database,
        'years',
        year,
        'modules',
        moduleKey,
        'records',
      ));
      const auditRef = firestore.doc(
        firestore.collection(database, 'years', year, 'auditLogs'),
      );
      const after = {
        ...data,
        createdAt: timestamp,
        updatedAt: timestamp,
        deletedAt: null,
        deletedBy: null,
      };
      batch.set(recordRef, after);
      batch.set(auditRef, auditData({
        moduleKey,
        recordId: recordRef.id,
        action: 'create',
        actor,
        before: null,
        after,
        timestamp,
      }));
      return { id: recordRef.id, ...after };
    });

    await batch.commit();
    return imported;
  };

  const updateRecord = async ({
    year,
    moduleKey,
    recordId,
    data,
    actor,
    assertCurrent = () => {},
  }) => {
    const recordRef = firestore.doc(
      database,
      'years',
      year,
      'modules',
      moduleKey,
      'records',
      recordId,
    );
    const auditRef = firestore.doc(
      firestore.collection(database, 'years', year, 'auditLogs'),
    );
    const snapshot = await firestore.getDocFromServer(recordRef);
    if (!snapshot.exists()) throw new Error(`Record not found: ${recordId}`);
    assertCurrent();
    const before = snapshot.data();
    assertRecordTypeUnchanged(before, data);
    const batch = firestore.writeBatch(database);
    const timestamp = firestore.serverTimestamp();
    const after = { ...before, ...editableRecordData(data), updatedAt: timestamp };
    batch.set(recordRef, after);
    batch.set(auditRef, auditData({
      moduleKey,
      recordId,
      action: 'update',
      actor,
      before,
      after,
      timestamp,
    }));
    await batch.commit();
    return { id: recordId, ...after };
  };

  const deleteRecord = async ({
    year,
    moduleKey,
    recordId,
    actor,
    assertCurrent = () => {},
  }) => {
    const recordRef = firestore.doc(
      database,
      'years',
      year,
      'modules',
      moduleKey,
      'records',
      recordId,
    );
    const auditRef = firestore.doc(
      firestore.collection(database, 'years', year, 'auditLogs'),
    );
    const snapshot = await firestore.getDocFromServer(recordRef);
    if (!snapshot.exists()) throw new Error(`Record not found: ${recordId}`);
    assertCurrent();
    const batch = firestore.writeBatch(database);
    const timestamp = firestore.serverTimestamp();
    const before = snapshot.data();
    const after = {
      ...before,
      deletedAt: timestamp,
      deletedBy: actor.uid,
      updatedAt: timestamp,
    };
    batch.set(recordRef, after);
    batch.set(auditRef, auditData({
      moduleKey,
      recordId,
      action: 'delete',
      actor,
      before,
      after,
      timestamp,
    }));
    await batch.commit();
    return { id: recordId, ...after };
  };

  const restoreRecord = async ({
    year,
    moduleKey,
    recordId,
    actor,
    assertCurrent = () => {},
  }) => {
    const recordRef = firestore.doc(
      database,
      'years',
      year,
      'modules',
      moduleKey,
      'records',
      recordId,
    );
    const auditRef = firestore.doc(
      firestore.collection(database, 'years', year, 'auditLogs'),
    );
    const snapshot = await firestore.getDocFromServer(recordRef);
    if (!snapshot.exists()) throw new Error(`Record not found: ${recordId}`);
    assertCurrent();
    const batch = firestore.writeBatch(database);
    const timestamp = firestore.serverTimestamp();
    const before = snapshot.data();
    const after = {
      ...before,
      deletedAt: null,
      deletedBy: null,
      updatedAt: timestamp,
    };
    batch.set(recordRef, after);
    batch.set(auditRef, auditData({
      moduleKey,
      recordId,
      action: 'restore',
      actor,
      before,
      after,
      timestamp,
    }));
    await batch.commit();
    return { id: recordId, ...after };
  };

  return {
    saveModule,
    createRecord,
    importRecords,
    updateRecord,
    deleteRecord,
    restoreRecord,
  };
}

export const yearDataRepository = createYearDataRepository();
