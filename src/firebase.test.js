import { readFile } from 'node:fs/promises';
import { describe, expect, beforeEach, it, vi } from 'vitest';
import { FIRESTORE_DATABASE_ID } from '../functions/firestoreConfig.cjs';

const firebaseMocks = vi.hoisted(() => ({
  app: { name: 'ltps-app' },
  db: { name: 'ltps-db' },
  initializeApp: vi.fn(),
  getApps: vi.fn(),
  getAuth: vi.fn(),
  getFirestore: vi.fn(),
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

    for (const mock of Object.values(firebaseMocks)) {
      if (typeof mock?.mockReset === 'function') mock.mockReset();
    }
    firebaseMocks.getApps.mockReturnValue([]);
    firebaseMocks.initializeApp.mockReturnValue(firebaseMocks.app);
    firebaseMocks.getAuth.mockReturnValue({ name: 'auth' });
    firebaseMocks.getFirestore.mockReturnValue(firebaseMocks.db);
    firebaseMocks.getStorage.mockReturnValue({ name: 'storage' });
    firebaseMocks.getFunctions.mockReturnValue({ name: 'functions' });
  });

  it('initializes the web SDK Firestore client with the shared named database', async () => {
    const firebase = await import('./firebase.js');

    expect(firebase.FIRESTORE_DATABASE_ID).toBe('ltps-finance-data');
    expect(firebase.db).toBe(firebaseMocks.db);
    expect(firebaseMocks.getFirestore).toHaveBeenCalledWith(
      firebaseMocks.app,
      FIRESTORE_DATABASE_ID,
    );
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
});
