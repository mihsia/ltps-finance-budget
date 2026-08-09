const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { initializeApp } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');
const { getFirestore } = require('firebase-admin/firestore');
const { getNamedFirestore } = require('./firestore');
const {
  validateAccountProfile,
  buildCreatedProfile,
  buildUpdatedProfile,
  validateStatusRequest,
  buildStatusChange,
} = require('./accountAdmin.cjs');

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
