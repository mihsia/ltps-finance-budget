const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { initializeApp } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');
const { getFirestore } = require('firebase-admin/firestore');

initializeApp();

const VALID_ROLES = ['admin', 'editor'];

/**
 * Admin-only: creates a Firebase Auth account + /users profile doc for a new
 * department staff member, and returns a password-setup link (this project
 * has no transactional-email provider wired up, so the admin shares the link
 * directly rather than it being emailed automatically).
 */
exports.createAccount = onCall(async (request) => {
  const callerUid = request.auth?.uid;
  if (!callerUid) throw new HttpsError('unauthenticated', '請先登入');

  const db = getFirestore();
  const callerProfile = await db.collection('users').doc(callerUid).get();
  if (callerProfile.data()?.role !== 'admin') {
    throw new HttpsError('permission-denied', '僅管理者可新增帳號');
  }

  const { name, email, dept, role, modules } = request.data || {};
  if (!name || !email || !dept || !VALID_ROLES.includes(role)) {
    throw new HttpsError('invalid-argument', '缺少必要欄位');
  }

  const auth = getAuth();
  const tempPassword = Math.random().toString(36).slice(-10) + 'A1!';
  const userRecord = await auth.createUser({ email, password: tempPassword, displayName: name });

  await db.collection('users').doc(userRecord.uid).set({
    name, email, dept, role,
    modules: role === 'admin' ? [] : (modules || []),
    createdAt: new Date().toISOString(),
    createdBy: callerUid,
  });

  const resetLink = await auth.generatePasswordResetLink(email);
  return { uid: userRecord.uid, resetLink };
});
