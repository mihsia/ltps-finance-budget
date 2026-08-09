import { createContext, useContext, useEffect, useState } from 'react';
import {
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
} from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { auth, db, isFirebaseConfigured } from '../firebase';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(isFirebaseConfigured);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!isFirebaseConfigured) return;
    const unsub = onAuthStateChanged(
      auth,
      async (fbUser) => {
        setUser(fbUser);
        if (fbUser) {
          try {
            const snap = await getDoc(doc(db, 'users', fbUser.uid));
            setProfile(snap.exists() ? snap.data() : { role: 'editor', modules: [], name: fbUser.email, dept: '' });
          } catch (e) {
            // Don't let a failed profile fetch (offline, denied, etc.) leave
            // the app stuck on the loading screen forever.
            console.error('Failed to load user profile', e);
            setProfile({ role: 'editor', modules: [], name: fbUser.email, dept: '' });
          }
        } else {
          setProfile(null);
        }
        setLoading(false);
      },
      (err) => {
        // Auth itself failed to initialize/observe (bad config, network to
        // Google blocked, etc.) — surface it instead of spinning forever.
        console.error('Auth state observer error', err);
        setError('無法連接 Firebase Authentication，請確認網路連線或專案設定');
        setLoading(false);
      },
    );
    return unsub;
  }, []);

  const login = async (email, password) => {
    setError(null);
    try {
      await signInWithEmailAndPassword(auth, email, password);
    } catch (e) {
      setError(mapAuthError(e.code));
      throw e;
    }
  };

  const logout = () => signOut(auth);

  const isAdmin = profile?.role === 'admin';
  const canEditModule = (moduleKey) => isAdmin || profile?.modules?.includes(moduleKey);

  return (
    <AuthContext.Provider value={{ user, profile, loading, error, login, logout, isAdmin, canEditModule }}>
      {children}
    </AuthContext.Provider>
  );
}

function mapAuthError(code) {
  switch (code) {
    case 'auth/invalid-credential':
    case 'auth/wrong-password':
    case 'auth/user-not-found':
      return '帳號或密碼錯誤';
    case 'auth/too-many-requests':
      return '嘗試次數過多，請稍後再試';
    default:
      return '登入失敗，請確認網路連線後重試';
  }
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
