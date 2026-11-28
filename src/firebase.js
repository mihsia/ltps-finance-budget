import { initializeApp, getApps } from 'firebase/app';
import { getAuth, connectAuthEmulator } from 'firebase/auth';
import {
  getFirestore,
  initializeFirestore,
  connectFirestoreEmulator,
  persistentLocalCache,
  persistentMultipleTabManager,
} from 'firebase/firestore';
import { getStorage, connectStorageEmulator } from 'firebase/storage';
import { getFunctions, connectFunctionsEmulator } from 'firebase/functions';
import { FIRESTORE_DATABASE_ID } from './lib/firestoreConfig.js';

export { FIRESTORE_DATABASE_ID };

export const ACCOUNT_HUB_APP_NAME = 'ltps-account-hub';
export const ACCOUNT_HUB_URL = import.meta.env.VITE_ACCOUNT_HUB_URL || 'https://ltps-account-hub.web.app';

const useEmulator = import.meta.env.VITE_USE_FIREBASE_EMULATOR === 'true';

const firebaseConfig = useEmulator
  // The emulator suite ignores most of these but still requires the shape.
  ? { apiKey: 'demo-key', authDomain: 'localhost', projectId: 'demo-ltps', storageBucket: 'demo-ltps.appspot.com', appId: 'demo-app' }
  : {
    apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
    authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
    storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
    appId: import.meta.env.VITE_FIREBASE_APP_ID,
  };

const hubFirebaseConfig = useEmulator
  ? { apiKey: 'demo-hub-key', authDomain: 'localhost', projectId: 'demo-ltps-hub', appId: 'demo-hub-app' }
  : {
    apiKey: import.meta.env.VITE_ACCOUNT_HUB_API_KEY,
    authDomain: import.meta.env.VITE_ACCOUNT_HUB_AUTH_DOMAIN,
    projectId: import.meta.env.VITE_ACCOUNT_HUB_PROJECT_ID,
    appId: import.meta.env.VITE_ACCOUNT_HUB_APP_ID,
  };

export const isFirebaseConfigured = useEmulator || Boolean(
  firebaseConfig.projectId && firebaseConfig.apiKey && firebaseConfig.authDomain,
);

export const isAccountHubConfigured = useEmulator || Boolean(
  hubFirebaseConfig.projectId && hubFirebaseConfig.apiKey && hubFirebaseConfig.authDomain,
);

const existingApps = getApps();
const app = isFirebaseConfigured
  ? (existingApps.find((a) => a.name === '[DEFAULT]') || existingApps[0] || initializeApp(firebaseConfig))
  : null;

// 方案 B：第二個具名 Firebase App，連接獨立的校級帳號管理中心專案（ltps-account-hub）
const hubApp = isAccountHubConfigured
  ? (existingApps.find((a) => a.name === ACCOUNT_HUB_APP_NAME) || initializeApp(hubFirebaseConfig, ACCOUNT_HUB_APP_NAME))
  : null;

export const auth = app ? getAuth(app) : null;
export const db = app
  ? initializeFirestore(
    app,
    { localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }) },
    FIRESTORE_DATABASE_ID,
  )
  : null;
export const storage = app ? getStorage(app) : null;
export const functions = app ? getFunctions(app) : null;

// 獨立帳號中心（ltps-account-hub）之 Auth / (default) Firestore / Functions 實例
export const hubAuth = hubApp ? getAuth(hubApp) : auth;
export const hubDb = hubApp ? getFirestore(hubApp) : null;
export const accountsDb = hubDb;
export const hubFunctions = hubApp ? getFunctions(hubApp) : functions;

if (app && useEmulator) {
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
  connectFirestoreEmulator(db, '127.0.0.1', 8080);
  connectStorageEmulator(storage, '127.0.0.1', 9199);
  connectFunctionsEmulator(functions, '127.0.0.1', 5001);
  if (hubApp && hubAuth && hubDb && hubFunctions) {
    connectAuthEmulator(hubAuth, 'http://127.0.0.1:9099', { disableWarnings: true });
    connectFirestoreEmulator(hubDb, '127.0.0.1', 8080);
    connectFunctionsEmulator(hubFunctions, '127.0.0.1', 5001);
  }
}
