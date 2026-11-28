import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createAuthorizationSource } from '../lib/accessPolicy';

const firebaseMocks = vi.hoisted(() => ({
  auth: { name: 'auth' },
  accountsDb: { name: 'accountsDb' },
}));

vi.mock('../firebase', () => ({
  auth: firebaseMocks.auth,
  accountsDb: firebaseMocks.accountsDb,
  isFirebaseConfigured: true,
}));

vi.mock('firebase/auth', () => ({
  GoogleAuthProvider: class GoogleAuthProvider {
    static credentialFromError() { return null; }
    setCustomParameters() {}
  },
  linkWithCredential: vi.fn(),
  onAuthStateChanged: vi.fn(),
  signInWithEmailAndPassword: vi.fn(),
  signInWithPopup: vi.fn(),
  signOut: vi.fn(),
}));

vi.mock('firebase/firestore', () => ({
  doc: vi.fn(),
  getDoc: vi.fn(),
  onSnapshot: vi.fn(),
}));

const authContext = await import('./AuthContext.jsx');

function snapshot(account) {
  return account === null
    ? { exists: () => false, data: () => undefined }
    : { exists: () => true, data: () => account };
}

function hubAccount({
  name = '編輯者',
  email = 'a@example.com',
  dept = '總務處',
  globalStatus = 'active',
  isSuperAdmin = false,
  claimsVersion = 1,
  finance = { status: 'active', role: 'editor', modules: ['basic'] },
} = {}) {
  return {
    name,
    email,
    dept,
    globalStatus,
    isSuperAdmin,
    claimsVersion,
    apps: finance ? { finance } : {},
  };
}

function createHarness() {
  const authorization = createAuthorizationSource();
  const states = [];
  const profileSubscriptions = [];
  let authCallback;
  let authErrorCallback;
  const authUnsubscribe = vi.fn();

  const onAuthStateChangedImpl = vi.fn((_auth, callback, errorCallback) => {
    authCallback = callback;
    authErrorCallback = errorCallback;
    return authUnsubscribe;
  });
  const docImpl = vi.fn((_db, collectionName, uid) => ({ collectionName, uid }));
  const onSnapshotImpl = vi.fn((ref, onNext, onError) => {
    const subscription = { ref, onNext, onError, unsubscribe: vi.fn() };
    profileSubscriptions.push(subscription);
    return subscription.unsubscribe;
  });

  const stop = authContext.listenToUserAccess?.({
    auth: firebaseMocks.auth,
    accountsDb: firebaseMocks.accountsDb,
    authorization,
    onState: (state) => states.push(state),
    onAuthStateChangedImpl,
    docImpl,
    onSnapshotImpl,
  });

  return {
    authorization,
    states,
    profileSubscriptions,
    get authCallback() { return authCallback; },
    get authErrorCallback() { return authErrorCallback; },
    authUnsubscribe,
    docImpl,
    onAuthStateChangedImpl,
    onSnapshotImpl,
    stop,
  };
}

describe('listenToUserAccess (ltps-accounts hub)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('listens to /accounts/{uid} in ltps-accounts and fails closed while loading', () => {
    const harness = createHarness();

    harness.authCallback({ uid: 'user-a', email: 'a@example.com' });

    expect(harness.docImpl).toHaveBeenCalledWith(firebaseMocks.accountsDb, 'accounts', 'user-a');
    expect(harness.onSnapshotImpl).toHaveBeenCalledTimes(1);
    expect(harness.authorization.authorizeModule('basic')).toEqual(
      expect.objectContaining({ allowed: false, code: 'profile-loading' }),
    );
  });

  it('grants active finance access and immediately revokes on app disable, global disable, deletion, or error', () => {
    const harness = createHarness();
    harness.authCallback({ uid: 'user-a', email: 'a@example.com' });
    const subscription = harness.profileSubscriptions[0];

    subscription.onNext(snapshot(hubAccount()));
    expect(harness.authorization.authorizeModule('basic').allowed).toBe(true);
    expect(harness.authorization.authorizeModule('budget').allowed).toBe(false);

    // 單一系統停權
    subscription.onNext(snapshot(hubAccount({
      finance: { status: 'disabled', role: 'editor', modules: ['basic'] },
    })));
    expect(harness.authorization.authorizeModule('basic')).toEqual(
      expect.objectContaining({ allowed: false, code: 'profile-disabled' }),
    );

    // 全校停用
    subscription.onNext(snapshot(hubAccount({ globalStatus: 'disabled' })));
    expect(harness.authorization.authorizeModule('basic')).toEqual(
      expect.objectContaining({ allowed: false, code: 'profile-disabled' }),
    );

    // 帳號不存在
    subscription.onNext(snapshot(null));
    expect(harness.authorization.authorizeModule('basic')).toEqual(
      expect.objectContaining({ allowed: false, code: 'profile-missing' }),
    );

    // 監聽錯誤
    subscription.onError(new Error('permission denied'));
    expect(harness.authorization.authorizeModule('basic')).toEqual(
      expect.objectContaining({ allowed: false, code: 'profile-error' }),
    );
  });

  it('grants full admin access to a school-wide super admin even without explicit finance role', () => {
    const harness = createHarness();
    harness.authCallback({ uid: 'super-1', email: 'mihsia@gmail.com' });
    const subscription = harness.profileSubscriptions[0];

    subscription.onNext(snapshot(hubAccount({
      name: '校級超管',
      email: 'mihsia@gmail.com',
      isSuperAdmin: true,
      finance: null,
    })));

    expect(harness.authorization.authorizeAdmin().allowed).toBe(true);
    expect(harness.authorization.authorizeModule('budget').allowed).toBe(true);
    expect(harness.states.at(-1).profile.isSuperAdmin).toBe(true);
  });

  it('forces an ID token refresh when claimsVersion increments', async () => {
    const getIdTokenResult = vi.fn().mockResolvedValue({ claims: { v: 1 } });
    const getIdToken = vi.fn().mockResolvedValue('fresh-token');
    const harness = createHarness();

    harness.authCallback({ uid: 'user-a', email: 'a@example.com', getIdTokenResult, getIdToken });
    const subscription = harness.profileSubscriptions[0];

    subscription.onNext(snapshot(hubAccount({ claimsVersion: 2 })));
    await Promise.resolve();
    await Promise.resolve();

    expect(getIdToken).toHaveBeenCalledWith(true);
  });

  it('resolves out of loading when the auth observer errors', () => {
    const harness = createHarness();
    harness.authErrorCallback(new Error('auth/network-request-failed'));

    expect(harness.states.at(-1).loading).toBe(false);
    expect(harness.states.at(-1).access).toEqual(
      expect.objectContaining({ allowed: false, code: 'profile-error' }),
    );
  });

  it('ignores stale profile callbacks after the authenticated user changes and cleans up on stop', () => {
    const harness = createHarness();
    harness.authCallback({ uid: 'user-a' });
    const staleSubscription = harness.profileSubscriptions[0];

    harness.authCallback({ uid: 'user-b' });
    const currentSubscription = harness.profileSubscriptions[1];
    expect(staleSubscription.unsubscribe).toHaveBeenCalledOnce();

    staleSubscription.onNext(snapshot(hubAccount({ finance: { status: 'active', role: 'admin', modules: [] } })));
    expect(harness.authorization.authorizeAdmin()).toEqual(
      expect.objectContaining({ allowed: false, code: 'profile-loading' }),
    );

    currentSubscription.onNext(snapshot(hubAccount({
      finance: { status: 'active', role: 'editor', modules: ['budget'] },
    })));
    expect(harness.authorization.authorizeModule('budget').allowed).toBe(true);

    harness.stop?.();
    expect(harness.authUnsubscribe).toHaveBeenCalledOnce();
    expect(currentSubscription.unsubscribe).toHaveBeenCalledOnce();
  });
});
