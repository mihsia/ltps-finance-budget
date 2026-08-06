import { createContext, useContext, useEffect, useState } from 'react';
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
  mapAuthError,
  startGoogleLogin,
} from '../lib/googleAuthFlow';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(isFirebaseConfigured);
  const [error, setError] = useState(null);
  const [pendingGoogleCredential, setPendingGoogleCredential] = useState(null);
  const [pendingGoogleEmail, setPendingGoogleEmail] = useState('');

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
    setError(null);
    try {
      await completePasswordLogin({
        auth,
        email,
        password,
        pendingCredential: pendingGoogleCredential,
        signInWithEmailAndPassword,
        linkWithCredential,
      });
      setPendingGoogleCredential(null);
      setPendingGoogleEmail('');
    } catch (e) {
      setError(mapAuthError(e.code));
      throw e;
    }
  };

  const loginWithGoogle = async () => {
    setError(null);
    try {
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: 'select_account' });
      await startGoogleLogin({
        auth,
        provider,
        signInWithPopup,
        credentialFromError: GoogleAuthProvider.credentialFromError,
      });
    } catch (e) {
      if (e instanceof GoogleLinkRequiredError) {
        setPendingGoogleCredential(e.credential);
        setPendingGoogleEmail(e.email);
        setError('此 Email 已使用密碼註冊，請輸入原密碼完成 Google 帳號連結');
      } else {
        setError(mapAuthError(e.code));
      }
      throw e;
    }
  };

  const logout = () => signOut(auth);

  const isAdmin = profile?.role === 'admin';
  const canEditModule = (moduleKey) => isAdmin || profile?.modules?.includes(moduleKey);

  return (
    <AuthContext.Provider value={{
      user, profile, loading, error, login, loginWithGoogle,
      pendingGoogleEmail, logout, isAdmin, canEditModule,
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
