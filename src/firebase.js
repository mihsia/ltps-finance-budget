import { initializeApp, getApps } from 'firebase/app';
import { getAuth, connectAuthEmulator } from 'firebase/auth';
import { getFirestore, connectFirestoreEmulator } from 'firebase/firestore';
import { getStorage, connectStorageEmulator } from 'firebase/storage';
import { getFunctions, connectFunctionsEmulator } from 'firebase/functions';
import { FIRESTORE_DATABASE_ID } from './lib/firestoreConfig.js';

export { FIRESTORE_DATABASE_ID };

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

// Firebase is considered "configured" once projectId/apiKey/authDomain are
// all present (or the local emulator suite is explicitly requested).
// authDomain is easy to leave out of a secrets setup and its absence doesn't
// throw — it just makes Auth hang indefinitely instead of erroring, so it's
// checked explicitly here rather than surfacing as a stuck loading screen.
// Until the school's real project credentials are added to .env, the app
// runs in a disconnected state and Login.jsx shows setup instructions
// instead of crashing.
export const isFirebaseConfigured = useEmulator || Boolean(
  firebaseConfig.projectId && firebaseConfig.apiKey && firebaseConfig.authDomain,
);

const app = isFirebaseConfigured
  ? (getApps()[0] || initializeApp(firebaseConfig))
  : null;

export const auth = app ? getAuth(app) : null;
export const db = app ? getFirestore(app, FIRESTORE_DATABASE_ID) : null;
export const storage = app ? getStorage(app) : null;
export const functions = app ? getFunctions(app) : null;

if (app && useEmulator) {
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
  connectFirestoreEmulator(db, '127.0.0.1', 8080);
  connectStorageEmulator(storage, '127.0.0.1', 9199);
  connectFunctionsEmulator(functions, '127.0.0.1', 5001);
}
