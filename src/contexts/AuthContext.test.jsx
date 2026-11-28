import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createAuthorizationSource } from '../lib/accessPolicy';

const firebaseMocks = vi.hoisted(() => ({
  auth: { name: 'app-auth', currentUser: null },
  hubAuth: { name: 'hub-auth' },
  hubDb: { name: 'hub-db' },
  hubFunctions: { name: 'hub-functions' },
}));

vi.mock('../firebase', () => ({
  auth: firebaseMocks.auth,
  hubAuth: firebaseMocks.hubAuth,
  hubDb: firebaseMocks.hubDb,
  hubFunctions: firebaseMocks.hubFunctions,
  isFirebaseConfigured: true,
  isAccountHubConfigured: true,
}));

vi.mock('firebase/auth', () => ({
  GoogleAuthProvider: class GoogleAuthProvider {
    static credentialFromError() { return null; }
    setCustomParameters() {}
  },
  linkWithCredential: vi.fn(),
  onAuthStateChanged: vi.fn(),
  signInWithCustomToken: vi.fn(),
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
  const issueAppToken = vi.fn(async () => ({
    customToken: 'signed-custom-token',
    targetProjectId: 'ltps-finance-budget',
    uid: 'user-a',
  }));
  const signInWithCustomTokenImpl = vi.fn(async () => ({}));
  const signOutImpl = vi.fn(async () => {});

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

  const stop = authContext.listenToUserAccess({
    hubAuth: firebaseMocks.hubAuth,
    appAuth: firebaseMocks.auth,
    hubDb: firebaseMocks.hubDb,
    hubFunctions: firebaseMocks.hubFunctions,
    authorization,
    onState: (state) => states.push(state),
    onAuthStateChangedImpl,
    docImpl,
    onSnapshotImpl,
    createHubClientImpl: () => ({ issueAppToken }),
    signInWithCustomTokenImpl,
    signOutImpl,
  });

  return {
    authorization,
    states,
    profileSubscriptions,
    issueAppToken,
    signInWithCustomTokenImpl,
    signOutImpl,
    get authCallback() { return authCallback; },
    get authErrorCallback() { return authErrorCallback; },
    authUnsubscribe,
    docImpl,
    onAuthStateChangedImpl,
    onSnapshotImpl,
    stop,
  };
}

async function flush() {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

describe('listenToUserAccess (方案 B 跨專案 Custom Token SSO)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    firebaseMocks.auth.currentUser = null;
  });

  it('監聽獨立帳號中心 hubDb /accounts/{uid}，並在載入期間採 fail-closed', () => {
    const harness = createHarness();

    harness.authCallback({ uid: 'user-a', email: 'a@example.com' });

    expect(harness.docImpl).toHaveBeenCalledWith(firebaseMocks.hubDb, 'accounts', 'user-a');
    expect(harness.onSnapshotImpl).toHaveBeenCalledTimes(1);
    expect(harness.authorization.authorizeModule('basic')).toEqual(
      expect.objectContaining({ allowed: false, code: 'profile-loading' }),
    );
  });

  it('通過授權後向 ltps-account-hub 換發 Custom Token 並登入業務專案 appAuth，權限異動時自動重換', async () => {
    const harness = createHarness();
    harness.authCallback({ uid: 'user-a', email: 'a@example.com' });
    const subscription = harness.profileSubscriptions[0];

    subscription.onNext(snapshot(hubAccount({ claimsVersion: 1 })));
    await flush();

    expect(harness.issueAppToken).toHaveBeenCalledTimes(1);
    expect(harness.issueAppToken).toHaveBeenCalledWith('finance');
    expect(harness.signInWithCustomTokenImpl).toHaveBeenCalledWith(firebaseMocks.auth, 'signed-custom-token');
    expect(harness.authorization.authorizeModule('basic').allowed).toBe(true);
    expect(harness.authorization.authorizeModule('budget').allowed).toBe(false);

    // claimsVersion 遞增時自動重新換發 Custom Token
    subscription.onNext(snapshot(hubAccount({
      claimsVersion: 2,
      finance: { status: 'active', role: 'editor', modules: ['basic', 'budget'] },
    })));
    await flush();
    expect(harness.issueAppToken).toHaveBeenCalledTimes(2);
    expect(harness.authorization.authorizeModule('budget').allowed).toBe(true);
  });

  it('單系統停權、全校停用或帳號刪除時立即撤銷授權並登出業務專案 appAuth', async () => {
    const harness = createHarness();
    firebaseMocks.auth.currentUser = { uid: 'user-a' };
    harness.authCallback({ uid: 'user-a', email: 'a@example.com' });
    const subscription = harness.profileSubscriptions[0];

    subscription.onNext(snapshot(hubAccount({
      finance: { status: 'disabled', role: 'editor', modules: ['basic'] },
    })));
    expect(harness.authorization.authorizeModule('basic')).toEqual(
      expect.objectContaining({ allowed: false, code: 'profile-disabled' }),
    );
    expect(harness.signOutImpl).toHaveBeenCalledWith(firebaseMocks.auth);

    subscription.onNext(snapshot(hubAccount({ globalStatus: 'disabled' })));
    expect(harness.authorization.authorizeModule('basic')).toEqual(
      expect.objectContaining({ allowed: false, code: 'profile-disabled' }),
    );

    subscription.onNext(snapshot(null));
    expect(harness.authorization.authorizeModule('basic')).toEqual(
      expect.objectContaining({ allowed: false, code: 'profile-missing' }),
    );
  });

  it('校級超級管理員免額外設定即可獲得財務系統完整管理權限', async () => {
    const harness = createHarness();
    harness.authCallback({ uid: 'super-1', email: 'mihsia@gmail.com' });
    const subscription = harness.profileSubscriptions[0];

    subscription.onNext(snapshot(hubAccount({
      name: '校級超管',
      email: 'mihsia@gmail.com',
      isSuperAdmin: true,
      finance: null,
    })));
    await flush();

    expect(harness.authorization.authorizeAdmin().allowed).toBe(true);
    expect(harness.authorization.authorizeModule('budget').allowed).toBe(true);
    expect(harness.states.at(-1).profile.isSuperAdmin).toBe(true);
  });

  it('Auth 監聽器發生錯誤時結束載入狀態，不卡死在 Loading 畫面', () => {
    const harness = createHarness();
    harness.authErrorCallback(new Error('auth/network-request-failed'));

    expect(harness.states.at(-1).loading).toBe(false);
    expect(harness.states.at(-1).access).toEqual(
      expect.objectContaining({ allowed: false, code: 'profile-error' }),
    );
  });

  it('切換登入者或執行清理時正確取消舊監聽', async () => {
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
    await flush();
    expect(harness.authorization.authorizeModule('budget').allowed).toBe(true);

    harness.stop?.();
    expect(harness.authUnsubscribe).toHaveBeenCalledOnce();
    expect(currentSubscription.unsubscribe).toHaveBeenCalledOnce();
  });
});
