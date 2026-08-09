const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { initializeApp } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');
const { getFirestore } = require('firebase-admin/firestore');
const { getStorage } = require('firebase-admin/storage');
const { getNamedFirestore } = require('./firestore');
const {
  validateAccountProfile,
  buildCreatedProfile,
  buildUpdatedProfile,
  validateStatusRequest,
  buildStatusChange,
} = require('./accountAdmin.cjs');
const { validateUploadRequest } = require('./pdfStorage.cjs');

initializeApp();

/**
 * Re-verifies on the server that the caller is a signed-in, active admin.
 * The client hides these controls too, but that is presentation only — an
 * admin whose role was revoked (or whose account was disabled) mid-session
 * still holds a valid ID token, so authority is decided here.
 */
async function requireActiveAdmin(request) {
  const callerUid = request.auth?.uid;
  if (!callerUid) throw new HttpsError('unauthenticated', '請先登入');

  const db = getNamedFirestore(getFirestore);
  const callerProfile = (await db.collection('users').doc(callerUid).get()).data();
  if (callerProfile?.status !== 'active') {
    throw new HttpsError('permission-denied', '此帳號已停用');
  }
  if (callerProfile.role !== 'admin') {
    throw new HttpsError('permission-denied', '僅管理者可管理帳號');
  }
  return { db, callerUid, callerProfile };
}

/** Append-only record of who changed which account, and how. */
function writeAccountLog(db, entry) {
  return db.collection('accountLogs').add({
    ...entry,
    createdAt: new Date().toISOString(),
  });
}

/**
 * Re-verifies on the server that the caller is a signed-in, active admin or
 * an active editor scoped to `moduleKey` — the same rule the client enforces
 * client-side (for presentation only), re-checked here because a revoked
 * role or disabled account can still carry a valid ID token mid-session.
 */
async function requireModuleWriteAccess(db, request, moduleKey) {
  const callerUid = request.auth?.uid;
  if (!callerUid) throw new HttpsError('unauthenticated', '請先登入');

  const callerProfile = (await db.collection('users').doc(callerUid).get()).data();
  if (callerProfile?.status !== 'active') {
    throw new HttpsError('permission-denied', '此帳號已停用');
  }
  const canEditModule = callerProfile.role === 'admin'
    || (Array.isArray(callerProfile.modules) && callerProfile.modules.includes(moduleKey));
  if (!canEditModule) {
    throw new HttpsError('permission-denied', '沒有此模組的編輯權限');
  }
  return { callerUid, callerProfile };
}

async function requireUnlockedYear(db, year) {
  const yearSnap = await db.collection('years').doc(year).get();
  if (!yearSnap.exists) throw new HttpsError('failed-precondition', '找不到此年度設定');
  if (yearSnap.data()?.locked !== false) {
    throw new HttpsError('failed-precondition', '此年度未開放編輯');
  }
}

/**
 * Admin-only: creates a Firebase Auth account + /users profile doc for a new
 * department staff member, and returns a password-setup link (this project
 * has no transactional-email provider wired up, so the admin shares the link
 * directly rather than it being emailed automatically).
 */
exports.createAccount = onCall(async (request) => {
  const { db, callerUid } = await requireActiveAdmin(request);

  const validation = validateAccountProfile(request.data);
  if (!validation.valid) throw new HttpsError('invalid-argument', validation.error);

  const auth = getAuth();
  const now = new Date().toISOString();

  // A random throwaway password: the account is only reachable through the
  // reset link below, so this value is never shown to anyone.
  const tempPassword = `${Math.random().toString(36).slice(-10)}A1!`;
  let userRecord;
  try {
    userRecord = await auth.createUser({
      email: validation.value.email,
      password: tempPassword,
      displayName: validation.value.name,
    });
  } catch (err) {
    if (err.code === 'auth/email-already-exists') {
      throw new HttpsError('already-exists', '此 Email 已有帳號');
    }
    throw new HttpsError('internal', '建立帳號失敗，請稍後再試');
  }

  const profile = buildCreatedProfile({ value: validation.value, callerUid, now });
  await db.collection('users').doc(userRecord.uid).set(profile);
  await writeAccountLog(db, {
    action: 'create',
    targetUid: userRecord.uid,
    actorUid: callerUid,
    before: null,
    after: profile,
  });

  const resetLink = await auth.generatePasswordResetLink(validation.value.email);
  return { uid: userRecord.uid, resetLink };
});

/**
 * Admin-only: updates an existing account's name, department, role and module
 * scope. Email is intentionally not updatable — it is the Auth identity, and
 * changing it here would silently desynchronize the profile from the login.
 */
exports.updateAccount = onCall(async (request) => {
  const { db, callerUid } = await requireActiveAdmin(request);

  const { uid } = request.data || {};
  if (typeof uid !== 'string' || !uid.trim()) {
    throw new HttpsError('invalid-argument', '缺少帳號識別碼');
  }

  const targetRef = db.collection('users').doc(uid);
  const targetSnap = await targetRef.get();
  if (!targetSnap.exists) throw new HttpsError('not-found', '找不到此帳號');
  const before = targetSnap.data();

  // Validation needs an email to check, but the stored one is authoritative.
  const validation = validateAccountProfile({ ...request.data, email: before.email });
  if (!validation.valid) throw new HttpsError('invalid-argument', validation.error);

  // Without this, the last admin could demote themselves and leave the system
  // with no one able to manage accounts.
  if (uid === callerUid && validation.value.role !== 'admin') {
    throw new HttpsError('failed-precondition', '無法移除自己的管理者權限，請由其他管理者操作');
  }

  const update = buildUpdatedProfile({ value: validation.value, callerUid, now: new Date().toISOString() });
  await targetRef.set(update, { merge: true });
  await writeAccountLog(db, {
    action: 'update',
    targetUid: uid,
    actorUid: callerUid,
    before,
    after: { ...before, ...update },
  });

  return { uid };
});

/**
 * Admin-only: disables or reactivates an account. Accounts are never hard
 * deleted, so their audit history stays attributable.
 */
exports.setAccountStatus = onCall(async (request) => {
  const { db, callerUid } = await requireActiveAdmin(request);

  const { uid, status } = request.data || {};
  const validation = validateStatusRequest({ uid, status, callerUid });
  if (!validation.valid) throw new HttpsError('failed-precondition', validation.error);

  const targetRef = db.collection('users').doc(uid);
  const targetSnap = await targetRef.get();
  if (!targetSnap.exists) throw new HttpsError('not-found', '找不到此帳號');
  const before = targetSnap.data();

  const change = buildStatusChange({ status, callerUid, now: new Date().toISOString() });

  // Revoke the Auth session first: if the Firestore write then fails, the user
  // is locked out but still shown as active — safe in the direction that
  // matters. The reverse order could leave a "disabled" account still able to
  // act on its existing token.
  await getAuth().updateUser(uid, { disabled: change.authDisabled });
  if (change.authDisabled) await getAuth().revokeRefreshTokens(uid);

  await targetRef.set(change.profile, { merge: true });
  await writeAccountLog(db, {
    action: status === 'disabled' ? 'disable' : 'reactivate',
    targetUid: uid,
    actorUid: callerUid,
    before,
    after: { ...before, ...change.profile },
  });

  return { uid, status };
});

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

  const { callerUid, callerProfile } = await requireModuleWriteAccess(db, request, 'budgetbook');
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
    actorName: callerProfile.name || callerProfile.email || callerUid,
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
