import { createContext, useContext, useEffect, useReducer, useState } from 'react';
import {
  GoogleAuthProvider,
  linkWithCredential,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
} from 'firebase/auth';
import { doc, onSnapshot } from 'firebase/firestore';
import { auth, db, isFirebaseConfigured } from '../firebase';
import {
  createAuthorizationSource,
  evaluateProfileAccess,
} from '../lib/accessPolicy';
import {
  GoogleLinkRequiredError,
  completePasswordLogin,
  initialGoogleLinkState,
  mapAuthError,
  reduceGoogleLinkState,
  startGoogleLogin,
} from '../lib/googleAuthFlow';

export const AuthContext = createContext(null);

function auditActor(user, profile) {
  if (typeof user?.uid !== 'string' || !user.uid) return null;
  const profileName = typeof profile?.name === 'string' ? profile.name.trim() : '';
  const displayName = typeof user.displayName === 'string' ? user.displayName.trim() : '';
  const email = typeof user.email === 'string' ? user.email.trim() : '';
  return {
    uid: user.uid,
    name: profileName || displayName || email || '未知使用者',
  };
}

export function listenToUserAccess({
  auth: authInstance,
  db: dbInstance,
  authorization,
  onState,
  onAuthStateChangedImpl = onAuthStateChanged,
  docImpl = doc,
  onSnapshotImpl = onSnapshot,
}) {
  let generation = 0;
  let profileUnsubscribe = null;
  let stopped = false;

  const publish = (user, profile, profileState) => {
    const access = evaluateProfileAccess({ profileState, profile });
    authorization.replace(access, auditActor(user, profile));
    onState({
      user,
      profile,
      profileState,
      access,
      loading: profileState === 'loading',
    });
  };

  const authUnsubscribe = onAuthStateChangedImpl(
    authInstance,
    (fbUser) => {
      if (stopped) return;
      const listenerGeneration = ++generation;
      profileUnsubscribe?.();
      profileUnsubscribe = null;

      if (!fbUser) {
        publish(null, null, 'signed-out');
        return;
      }

      publish(fbUser, null, 'loading');
      const userRef = docImpl(dbInstance, 'users', fbUser.uid);
      profileUnsubscribe = onSnapshotImpl(
        userRef,
        (snap) => {
          if (stopped || listenerGeneration !== generation) return;
          const exists = snap.exists();
          publish(fbUser, exists ? snap.data() : null, exists ? 'ready' : 'missing');
        },
        () => {
          if (stopped || listenerGeneration !== generation) return;
          publish(fbUser, null, 'error');
        },
      );
    },
    () => {
      // The auth-state observer itself failed (bad config, network to
      // Google blocked, etc.) rather than just the profile lookup. Without
      // this handler the initial `loading: true` state never resolves and
      // the app spins on the loading screen forever.
      if (stopped) return;
      generation += 1;
      profileUnsubscribe?.();
      profileUnsubscribe = null;
      publish(null, null, 'error');
    },
  );

  return () => {
    stopped = true;
    generation += 1;
    profileUnsubscribe?.();
    authUnsubscribe?.();
    authorization.replace(evaluateProfileAccess({ profileState: 'signed-out' }));
  };
}

export function AuthProvider({ children }) {
  const [authorization] = useState(() => createAuthorizationSource(
    evaluateProfileAccess({
      profileState: isFirebaseConfigured ? 'loading' : 'signed-out',
    }),
  ));
  const [authState, setAuthState] = useState(() => ({
    user: null,
    profile: null,
    profileState: isFirebaseConfigured ? 'loading' : 'signed-out',
    access: authorization.current(),
    loading: isFirebaseConfigured,
  }));
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
    return listenToUserAccess({
      auth,
      db,
      authorization,
      onState: setAuthState,
    });
  }, [authorization]);

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

  const { user, profile, access, loading } = authState;
  const isAdmin = access.allowed && access.role === 'admin';
  const canEditModule = (moduleKey) => authorization.authorizeModule(moduleKey).allowed;

  return (
    <AuthContext.Provider value={{
      user, profile, loading, error, login, loginWithGoogle,
      pendingGoogleEmail, cancelGoogleLink, logout, isAdmin, canEditModule,
      access, accessDeniedReason: access.reason,
      authorizeModule: authorization.authorizeModule,
      authorizeModuleActor: authorization.authorizeModuleActor,
      authorizeAdmin: authorization.authorizeAdmin,
      authorizeAdminActor: authorization.authorizeAdminActor,
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
