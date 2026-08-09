import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createAuthorizationSource } from '../lib/accessPolicy';

const firebaseMocks = vi.hoisted(() => ({
  auth: { name: 'auth' },
  db: { name: 'db' },
}));

vi.mock('../firebase', () => ({
  auth: firebaseMocks.auth,
  db: firebaseMocks.db,
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

function snapshot(profile) {
  return profile === null
    ? { exists: () => false, data: () => undefined }
    : { exists: () => true, data: () => profile };
}

function createHarness() {
  const authorization = createAuthorizationSource();
  const states = [];
  const profileSubscriptions = [];
  let authCallback;
  const authUnsubscribe = vi.fn();

  const onAuthStateChangedImpl = vi.fn((_auth, callback) => {
    authCallback = callback;
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
    db: firebaseMocks.db,
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
    authUnsubscribe,
    docImpl,
    onAuthStateChangedImpl,
    onSnapshotImpl,
    stop,
  };
}

describe('listenToUserAccess', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('starts a live /users/{uid} listener and fails closed while it loads', () => {
    const harness = createHarness();

    expect(harness.authCallback).toBeTypeOf('function');
    harness.authCallback({ uid: 'user-a', email: 'a@example.com' });

    expect(harness.docImpl).toHaveBeenCalledWith(firebaseMocks.db, 'users', 'user-a');
    expect(harness.onSnapshotImpl).toHaveBeenCalledTimes(1);
    expect(harness.authorization.authorizeModule('basic')).toEqual(
      expect.objectContaining({ allowed: false, code: 'profile-loading' }),
    );
  });

  it('grants active profiles then immediately revokes on disable, deletion, or error', () => {
    const harness = createHarness();
    expect(harness.authCallback).toBeTypeOf('function');
    harness.authCallback({ uid: 'user-a', email: 'a@example.com' });
    const subscription = harness.profileSubscriptions[0];

    subscription.onNext(snapshot({
      name: '編輯者',
      role: 'editor',
      status: 'active',
      modules: ['basic'],
    }));
    expect(harness.authorization.authorizeModule('basic').allowed).toBe(true);

    subscription.onNext(snapshot({
      name: '編輯者',
      role: 'editor',
      status: 'disabled',
      modules: ['basic'],
    }));
    expect(harness.authorization.authorizeModule('basic')).toEqual(
      expect.objectContaining({ allowed: false, code: 'profile-disabled' }),
    );

    subscription.onNext(snapshot(null));
    expect(harness.authorization.authorizeModule('basic')).toEqual(
      expect.objectContaining({ allowed: false, code: 'profile-missing' }),
    );

    subscription.onError(new Error('permission denied'));
    expect(harness.authorization.authorizeModule('basic')).toEqual(
      expect.objectContaining({ allowed: false, code: 'profile-error' }),
    );
    expect(harness.states.at(-1).access.reason).toBe(
      '無法確認帳號權限，請稍後再試或聯絡系統管理員。',
    );
  });

  it('ignores stale profile callbacks after the authenticated user changes', () => {
    const harness = createHarness();
    expect(harness.authCallback).toBeTypeOf('function');
    harness.authCallback({ uid: 'user-a' });
    const staleSubscription = harness.profileSubscriptions[0];

    harness.authCallback({ uid: 'user-b' });
    const currentSubscription = harness.profileSubscriptions[1];
    expect(staleSubscription.unsubscribe).toHaveBeenCalledOnce();

    staleSubscription.onNext(snapshot({ role: 'admin', status: 'active' }));
    expect(harness.authorization.authorizeAdmin()).toEqual(
      expect.objectContaining({ allowed: false, code: 'profile-loading' }),
    );

    currentSubscription.onNext(snapshot({
      role: 'editor',
      status: 'active',
      modules: ['budget'],
    }));
    expect(harness.authorization.authorizeModule('budget').allowed).toBe(true);
    expect(harness.authorization.authorizeModule('basic').allowed).toBe(false);
  });

  it('invalidates callbacks and unsubscribes both listeners during cleanup', () => {
    const harness = createHarness();
    expect(harness.authCallback).toBeTypeOf('function');
    harness.authCallback({ uid: 'user-a' });
    const subscription = harness.profileSubscriptions[0];

    harness.stop?.();
    expect(harness.authUnsubscribe).toHaveBeenCalledOnce();
    expect(subscription.unsubscribe).toHaveBeenCalledOnce();

    subscription.onNext(snapshot({ role: 'admin', status: 'active' }));
    harness.authCallback({ uid: 'late-user' });
    expect(harness.authorization.authorizeAdmin().allowed).toBe(false);
    expect(harness.onSnapshotImpl).toHaveBeenCalledOnce();
  });
});
