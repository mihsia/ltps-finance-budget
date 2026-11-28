const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { initializeApp } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const { getStorage } = require('firebase-admin/storage');
const { getNamedFirestore } = require('./firestore');
const { validateUploadRequest } = require('./pdfStorage.cjs');

initializeApp();

const MODULE_SHORT_CODE = {
  basic: 'bs',
  specialNeeds: 'sn',
  budget: 'bg',
  library: 'lb',
  language: 'lg',
  languageCert: 'lc',
  awards: 'aw',
  club: 'cl',
  careSupport: 'cs',
  land: 'ld',
  building: 'bd',
  inquiry: 'iq',
  budgetbook: 'bb',
  report: 'rp',
  archive: 'ar',
  settings: 'st',
};

/**
 * Verifies the caller's Firebase ID token claims (minted by the standalone
 * `ltps-account-hub` project via Custom Token Broker, verified natively by
 * Firebase Auth on `ltps-finance-budget` — no cross-project Firestore read needed).
 */
function requireModuleWriteAccess(request, moduleKey) {
  const callerUid = request.auth?.uid;
  const token = request.auth?.token;
  if (!callerUid || !token) throw new HttpsError('unauthenticated', '請先登入');
  if (token.g !== 1) {
    throw new HttpsError('permission-denied', '此帳號尚未啟用或已全校停用');
  }

  const isSuperAdmin = token.sa === 1;
  const financeClaim = token.apps?.finance;
  const shortCode = MODULE_SHORT_CODE[moduleKey] || moduleKey;
  const canEditModule = isSuperAdmin
    || financeClaim?.r === 'a'
    || (
      financeClaim?.r === 'e'
      && Array.isArray(financeClaim.m)
      && (financeClaim.m.includes(shortCode) || financeClaim.m.includes(moduleKey))
    );

  if (!canEditModule) {
    throw new HttpsError('permission-denied', '沒有此模組的編輯權限');
  }
  return {
    callerUid,
    callerName: token.name || token.email || callerUid,
  };
}

async function requireUnlockedYear(db, year) {
  const yearSnap = await db.collection('years').doc(year).get();
  if (!yearSnap.exists) throw new HttpsError('failed-precondition', '找不到此年度設定');
  if (yearSnap.data()?.locked !== false) {
    throw new HttpsError('failed-precondition', '此年度未開放編輯');
  }
}

/**
 * Admin or budgetbook-module editor: uploads (or replaces) the archived
 * budget-book PDF. Storage rules deny client writes to `budget-books/**`
 * outright (see storage.rules), so the file only ever reaches Storage through
 * this Admin-SDK path, which re-checks role/module scope and the year lock
 * itself rather than trusting the client's own (presentation-only) gating.
 */
exports.uploadBudgetBookPdf = onCall({ timeoutSeconds: 60 }, async (request) => {
  const db = getNamedFirestore(getFirestore);
  const { year } = request.data || {};
  if (typeof year !== 'string' || !year) throw new HttpsError('invalid-argument', '缺少年度');

  const { callerUid, callerName } = requireModuleWriteAccess(request, 'budgetbook');
  await requireUnlockedYear(db, year);

  const validation = validateUploadRequest(request.data);
  if (!validation.valid) throw new HttpsError('invalid-argument', validation.error);

  const moduleRef = db.collection('years').doc(year).collection('modules').doc('budgetbook');
  const moduleSnap = await moduleRef.get();
  const before = moduleSnap.exists ? moduleSnap.data() : null;

  const storagePath = `budget-books/${year}/${Date.now()}-${validation.fileName}`;
  const bucket = getStorage().bucket();
  const file = bucket.file(storagePath);
  await file.save(validation.buffer, { contentType: 'application/pdf', resumable: false });
  await file.makePublic();
  const pdfUrl = `https://storage.googleapis.com/${bucket.name}/${storagePath}`;

  const now = new Date().toISOString();
  const after = {
    ...before,
    pdfUrl,
    pdfFileName: validation.fileName,
    pdfPath: storagePath,
    pdfSize: validation.buffer.length,
    pdfUpdatedAt: now,
    pdfUpdatedBy: callerUid,
    updatedAt: now,
  };

  const batch = db.batch();
  batch.set(moduleRef, after, { merge: true });

  const auditRef = db.collection('years').doc(year).collection('auditLogs').doc();
  batch.set(auditRef, {
    moduleKey: 'budgetbook',
    recordId: null,
    action: before?.pdfUrl ? 'pdf-replace' : 'pdf-upload',
    actorUid: callerUid,
    actorName: callerName,
    before: { pdfUrl: before?.pdfUrl ?? null, pdfFileName: before?.pdfFileName ?? null },
    after: { pdfUrl, pdfFileName: validation.fileName },
    createdAt: now,
  });

  const fileRef = db.collection('years').doc(year).collection('files').doc();
  batch.set(fileRef, {
    moduleKey: 'budgetbook',
    storagePath,
    fileName: validation.fileName,
    contentType: 'application/pdf',
    size: validation.buffer.length,
    uploadedBy: callerUid,
    uploadedAt: now,
  });

  await batch.commit();

  return { pdfUrl, pdfFileName: validation.fileName };
});
