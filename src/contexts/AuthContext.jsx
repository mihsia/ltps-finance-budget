import { createContext, useContext, useEffect, useReducer, useState } from 'react';
import {
  GoogleAuthProvider,
  linkWithCredential,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
} from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { auth, db, isFirebaseConfigured } from '../firebase';
import {
  GoogleLinkRequiredError,
  completePasswordLogin,
  initialGoogleLinkState,
  mapAuthError,
  reduceGoogleLinkState,
  startGoogleLogin,
} from '../lib/googleAuthFlow';

export const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(isFirebaseConfigured);
  const [googleLinkState, dispatchGoogleLink] = useReducer(
    reduceGoogleLinkState,
    initialGoogleLinkState,
  );
  const {
    error,
    pendingCredential: pendingGoogleCredential,
    pendingEmail: pendingGoogleEmail,
  } = googleLinkState;

  useEffect(() => {
    if (!isFirebaseConfigured) return;
    const unsub = onAuthStateChanged(auth, async (fbUser) => {
      setUser(fbUser);
      if (fbUser) {
        const snap = await getDoc(doc(db, 'users', fbUser.uid));
        setProfile(snap.exists() ? snap.data() : { role: 'editor', modules: [], name: fbUser.email, dept: '' });
      } else {
        setProfile(null);
      }
      setLoading(false);
    });
    return unsub;
  }, []);

  const login = async (email, password) => {
    dispatchGoogleLink({ type: 'set-error', error: null });
    try {
      await completePasswordLogin({
        auth,
        email,
        password,
        pendingCredential: pendingGoogleCredential,
        signInWithEmailAndPassword,
        linkWithCredential,
        signOut,
      });
      dispatchGoogleLink({ type: 'password-login-succeeded' });
    } catch (e) {
      dispatchGoogleLink({
        type: 'set-error',
        error: mapAuthError(e.code, { stage: e.stage }),
      });
      throw e;
    }
  };

  const loginWithGoogle = async () => {
    if (pendingGoogleCredential) return;

    dispatchGoogleLink({ type: 'set-error', error: null });
    try {
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: 'select_account' });
      await startGoogleLogin({
        auth,
        provider,
        signInWithPopup,
        credentialFromError: GoogleAuthProvider.credentialFromError,
      });
      dispatchGoogleLink({ type: 'google-login-succeeded' });
    } catch (e) {
      if (e instanceof GoogleLinkRequiredError) {
        dispatchGoogleLink({
          type: 'link-required',
          credential: e.credential,
          email: e.email,
        });
      } else {
        dispatchGoogleLink({ type: 'set-error', error: mapAuthError(e.code) });
      }
      throw e;
    }
  };

  const cancelGoogleLink = () => {
    dispatchGoogleLink({ type: 'cancel-link' });
  };

  const logout = async () => {
    dispatchGoogleLink({ type: 'logout' });
    await signOut(auth);
  };

  const isAdmin = profile?.role === 'admin';
  const canEditModule = (moduleKey) => isAdmin || profile?.modules?.includes(moduleKey);

  return (
    <AuthContext.Provider value={{
      user, profile, loading, error, login, loginWithGoogle,
      pendingGoogleEmail, cancelGoogleLink, logout, isAdmin, canEditModule,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
