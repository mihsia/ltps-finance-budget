import { readFile } from 'node:fs/promises';
import { describe, expect, beforeEach, it, vi } from 'vitest';
import { FIRESTORE_DATABASE_ID } from '../functions/firestoreConfig.cjs';

const firebaseMocks = vi.hoisted(() => ({
  app: { name: 'ltps-app' },
  db: { name: 'ltps-db' },
  accountsDb: { name: 'ltps-accounts-db' },
  localCache: { name: 'persistent-local-cache' },
  tabManager: { name: 'multi-tab-manager' },
  initializeApp: vi.fn(),
  getApps: vi.fn(),
  getAuth: vi.fn(),
  getFirestore: vi.fn(),
  initializeFirestore: vi.fn(),
  persistentLocalCache: vi.fn(),
  persistentMultipleTabManager: vi.fn(),
  getStorage: vi.fn(),
  getFunctions: vi.fn(),
  connectAuthEmulator: vi.fn(),
  connectFirestoreEmulator: vi.fn(),
  connectStorageEmulator: vi.fn(),
  connectFunctionsEmulator: vi.fn(),
}));

vi.mock('firebase/app', () => ({
  initializeApp: firebaseMocks.initializeApp,
  getApps: firebaseMocks.getApps,
}));
vi.mock('firebase/auth', () => ({
  getAuth: firebaseMocks.getAuth,
  connectAuthEmulator: firebaseMocks.connectAuthEmulator,
}));
vi.mock('firebase/firestore', () => ({
  getFirestore: firebaseMocks.getFirestore,
  initializeFirestore: firebaseMocks.initializeFirestore,
  persistentLocalCache: firebaseMocks.persistentLocalCache,
  persistentMultipleTabManager: firebaseMocks.persistentMultipleTabManager,
  connectFirestoreEmulator: firebaseMocks.connectFirestoreEmulator,
}));
vi.mock('firebase/storage', () => ({
  getStorage: firebaseMocks.getStorage,
  connectStorageEmulator: firebaseMocks.connectStorageEmulator,
}));
vi.mock('firebase/functions', () => ({
  getFunctions: firebaseMocks.getFunctions,
  connectFunctionsEmulator: firebaseMocks.connectFunctionsEmulator,
}));

describe('Firebase named Firestore configuration', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
    vi.stubEnv('VITE_USE_FIREBASE_EMULATOR', 'false');
    vi.stubEnv('VITE_FIREBASE_PROJECT_ID', 'test-project');
    vi.stubEnv('VITE_FIREBASE_API_KEY', 'test-key');
    vi.stubEnv('VITE_FIREBASE_AUTH_DOMAIN', 'test-project.firebaseapp.com');
    vi.stubEnv('VITE_ACCOUNT_HUB_PROJECT_ID', 'ltps-account-hub');
    vi.stubEnv('VITE_ACCOUNT_HUB_API_KEY', 'hub-key');
    vi.stubEnv('VITE_ACCOUNT_HUB_AUTH_DOMAIN', 'ltps-account-hub.firebaseapp.com');

    for (const mock of Object.values(firebaseMocks)) {
      if (typeof mock?.mockReset === 'function') mock.mockReset();
    }
    firebaseMocks.getApps.mockReturnValue([]);
    firebaseMocks.initializeApp
      .mockReturnValueOnce(firebaseMocks.app)
      .mockReturnValueOnce({ name: 'ltps-account-hub' });
    firebaseMocks.getAuth.mockReturnValue({ name: 'auth' });
    firebaseMocks.persistentMultipleTabManager.mockReturnValue(firebaseMocks.tabManager);
    firebaseMocks.persistentLocalCache.mockReturnValue(firebaseMocks.localCache);
    firebaseMocks.initializeFirestore.mockReturnValue(firebaseMocks.db);
    firebaseMocks.getFirestore.mockReturnValue(firebaseMocks.accountsDb);
    firebaseMocks.getStorage.mockReturnValue({ name: 'storage' });
    firebaseMocks.getFunctions.mockReturnValue({ name: 'functions' });
  });

  it('initializes the web SDK Firestore client with the shared named database and secondary Account Hub app', async () => {
    const firebase = await import('./firebase.js');

    expect(firebase.FIRESTORE_DATABASE_ID).toBe('ltps-finance-data');
    expect(firebase.db).toBe(firebaseMocks.db);
    expect(firebase.hubDb).toBe(firebaseMocks.accountsDb);
    expect(firebase.isAccountHubConfigured).toBe(true);
    expect(firebaseMocks.persistentMultipleTabManager).toHaveBeenCalledWith();
    expect(firebaseMocks.persistentLocalCache).toHaveBeenCalledWith({ tabManager: firebaseMocks.tabManager });
    expect(firebaseMocks.initializeFirestore).toHaveBeenCalledWith(
      firebaseMocks.app,
      { localCache: firebaseMocks.localCache },
      FIRESTORE_DATABASE_ID,
    );
    expect(firebaseMocks.initializeApp).toHaveBeenCalledWith(
      expect.objectContaining({ projectId: 'ltps-account-hub' }),
      'ltps-account-hub',
    );
    expect(firebaseMocks.getFirestore).toHaveBeenCalledWith({ name: 'ltps-account-hub' });
  });

  it('passes the shared named database ID to Admin SDK Firestore accessors', async () => {
    const { getNamedFirestore } = await import('../functions/firestore.js');
    const getFirestore = vi.fn().mockReturnValue({ name: 'admin-db' });

    expect(getNamedFirestore(getFirestore)).toEqual({ name: 'admin-db' });
    expect(getFirestore).toHaveBeenCalledWith(FIRESTORE_DATABASE_ID);
  });

  it('uses the named Admin SDK accessor from both Functions and the seed script', async () => {
    const [functionsSource, seedSource] = await Promise.all([
      readFile(new URL('../functions/index.js', import.meta.url), 'utf8'),
      readFile(new URL('../scripts/seed.js', import.meta.url), 'utf8'),
    ]);

    expect(functionsSource).toContain('getNamedFirestore(getFirestore)');
    expect(seedSource).toContain('getNamedFirestore(getFirestore)');
  });

  it('keeps the shared database ID inside the Functions deploy source', async () => {
    const functionConfig = await readFile(
      new URL('../functions/firestoreConfig.cjs', import.meta.url),
      'utf8',
    );

    expect(functionConfig).toContain("'ltps-finance-data'");
  });

  it('targets the named database when deploying Firestore rules and indexes', async () => {
    const firebaseJson = JSON.parse(
      await readFile(new URL('../firebase.json', import.meta.url), 'utf8'),
    );

    expect(firebaseJson.firestore).toEqual([
      {
        database: FIRESTORE_DATABASE_ID,
        rules: 'firestore.rules',
        indexes: 'firestore.indexes.json',
      },
    ]);
  });

  it('treats itself as unconfigured when authDomain is missing, instead of hanging Auth later', async () => {
    vi.stubEnv('VITE_FIREBASE_AUTH_DOMAIN', '');
    vi.stubEnv('VITE_ACCOUNT_HUB_AUTH_DOMAIN', '');

    const firebase = await import('./firebase.js');

    expect(firebase.isFirebaseConfigured).toBe(false);
    expect(firebase.isAccountHubConfigured).toBe(false);
    expect(firebase.db).toBeNull();
    expect(firebaseMocks.initializeApp).not.toHaveBeenCalled();
  });
});
