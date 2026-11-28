import { createContext, useContext, useEffect, useReducer, useState } from 'react';
import {
  GoogleAuthProvider,
  linkWithCredential,
  onAuthStateChanged,
  signInWithCustomToken,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
} from 'firebase/auth';
import { doc, onSnapshot } from 'firebase/firestore';
import { createAccountHubClient, evaluateAppAccessFromAccount } from '@ltps/account-sdk/core';
import {
  auth,
  hubAuth,
  hubDb,
  hubFunctions,
  isAccountHubConfigured,
  isFirebaseConfigured,
} from '../firebase';
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

/**
 * 將校級帳號中心（`ltps-account-hub` 的 `/accounts/{uid}`）文件轉成財務系統既有相容格式，
 * 讓其餘 15 個業務頁面無需修改即可沿用 `profile`、`isAdmin` 與 `canEditModule`。
 */
export function adaptHubAccountToFinance(accountDoc) {
  if (!accountDoc) return { profile: null, access: evaluateProfileAccess({ profileState: 'missing' }) };

  const hubAccess = evaluateAppAccessFromAccount({
    profileState: 'ready',
    account: accountDoc,
    appId: 'finance',
  });

  const financeApp = accountDoc.apps?.finance || null;
  const effectiveStatus = accountDoc.globalStatus !== 'active'
    ? 'disabled'
    : (accountDoc.isSuperAdmin ? 'active' : (financeApp?.status || 'disabled'));
  const effectiveRole = accountDoc.isSuperAdmin ? 'admin' : (financeApp?.role || null);
  const effectiveModules = accountDoc.isSuperAdmin
    ? []
    : (Array.isArray(financeApp?.modules) ? [...financeApp.modules] : []);

  const profile = {
    uid: accountDoc.uid,
    name: accountDoc.name || '',
    email: accountDoc.email || '',
    dept: accountDoc.dept || '',
    jobTitle: accountDoc.jobTitle || '',
    status: effectiveStatus,
    role: effectiveRole,
    modules: effectiveModules,
    globalStatus: accountDoc.globalStatus,
    isSuperAdmin: Boolean(accountDoc.isSuperAdmin),
    claimsVersion: accountDoc.claimsVersion || 1,
  };

  if (!hubAccess.allowed) {
    const mappedCode = hubAccess.code === 'global-disabled' || hubAccess.code === 'app-disabled'
      ? 'profile-disabled'
      : hubAccess.code;
    return {
      profile,
      access: {
        allowed: false,
        code: mappedCode,
        reason: hubAccess.reason,
      },
    };
  }

  return {
    profile,
    access: evaluateProfileAccess({ profileState: 'ready', profile }),
  };
}

export function listenToUserAccess({
  hubAuth: hubAuthInstance,
  appAuth: appAuthInstance = null,
  hubDb: hubDbInstance,
  hubFunctions: hubFunctionsInstance = null,
  authorization,
  onState,
  onAuthStateChangedImpl = onAuthStateChanged,
  docImpl = doc,
  onSnapshotImpl = onSnapshot,
  createHubClientImpl = createAccountHubClient,
  signInWithCustomTokenImpl = signInWithCustomToken,
  signOutImpl = signOut,
}) {
  let generation = 0;
  let profileUnsubscribe = null;
  let stopped = false;

  const isCrossProject = Boolean(appAuthInstance && hubAuthInstance && appAuthInstance !== hubAuthInstance);
  const hubClient = hubFunctionsInstance ? createHubClientImpl(hubFunctionsInstance) : null;

  const publish = (user, profile, profileState, precomputedAccess = null) => {
    const access = precomputedAccess || evaluateProfileAccess({ profileState, profile });
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
    hubAuthInstance,
    (fbUser) => {
      if (stopped) return;
      const listenerGeneration = ++generation;
      profileUnsubscribe?.();
      profileUnsubscribe = null;

      if (!fbUser) {
        if (isCrossProject && appAuthInstance?.currentUser) {
          void signOutImpl(appAuthInstance).catch(() => {});
        }
        publish(null, null, 'signed-out');
        return;
      }

      publish(fbUser, null, 'loading');
      let syncedClaimsVersion = null;
      const accountRef = docImpl(hubDbInstance, 'accounts', fbUser.uid);

      profileUnsubscribe = onSnapshotImpl(
        accountRef,
        (snap) => {
          if (stopped || listenerGeneration !== generation) return;
          if (!snap.exists()) {
            if (isCrossProject && appAuthInstance?.currentUser) {
              void signOutImpl(appAuthInstance).catch(() => {});
            }
            publish(fbUser, null, 'missing');
            return;
          }

          const rawAccount = { uid: fbUser.uid, ...snap.data() };
          const { profile, access } = adaptHubAccountToFinance(rawAccount);
          const nextVersion = rawAccount.claimsVersion || 1;

          if (!access.allowed) {
            if (isCrossProject && appAuthInstance?.currentUser) {
              void signOutImpl(appAuthInstance).catch(() => {});
            }
            publish(fbUser, profile, 'ready', access);
            return;
          }

          // 方案 B 跨專案 SSO：當帳號驗證通過或 claimsVersion 變更時，
          // 向 ltps-account-hub 換發 ltps-finance-budget 的 Custom Token 並登入業務專案 Auth。
          if (isCrossProject && hubClient && syncedClaimsVersion !== nextVersion) {
            syncedClaimsVersion = nextVersion;
            void (async () => {
              try {
                const brokerRes = await hubClient.issueAppToken('finance');
                if (stopped || listenerGeneration !== generation) return;
                await signInWithCustomTokenImpl(appAuthInstance, brokerRes.customToken);
                if (stopped || listenerGeneration !== generation) return;
                publish(fbUser, profile, 'ready', access);
              } catch {
                if (stopped || listenerGeneration !== generation) return;
                publish(fbUser, null, 'error');
              }
            })();
            return;
          }

          // 同專案模式回退：必要時強制刷新 ID Token
          if (!isCrossProject && syncedClaimsVersion !== nextVersion) {
            syncedClaimsVersion = nextVersion;
            if (typeof fbUser.getIdTokenResult === 'function' && typeof fbUser.getIdToken === 'function') {
              void fbUser.getIdTokenResult().then((tokenResult) => {
                if (tokenResult?.claims?.v !== nextVersion) return fbUser.getIdToken(true);
                return undefined;
              }).catch(() => {});
            }
          }

          publish(fbUser, profile, 'ready', access);
        },
        () => {
          if (stopped || listenerGeneration !== generation) return;
          publish(fbUser, null, 'error');
        },
      );
    },
    () => {
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
  const configured = isFirebaseConfigured && isAccountHubConfigured;
  const [authorization] = useState(() => createAuthorizationSource(
    evaluateProfileAccess({
      profileState: configured ? 'loading' : 'signed-out',
    }),
  ));
  const [authState, setAuthState] = useState(() => ({
    user: null,
    profile: null,
    profileState: configured ? 'loading' : 'signed-out',
    access: authorization.current(),
    loading: configured,
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
    if (!configured) return;
    return listenToUserAccess({
      hubAuth,
      appAuth: auth,
      hubDb,
      hubFunctions,
      authorization,
      onState: setAuthState,
    });
  }, [authorization, configured]);

  const login = async (email, password) => {
    dispatchGoogleLink({ type: 'set-error', error: null });
    try {
      await completePasswordLogin({
        auth: hubAuth,
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
        auth: hubAuth,
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
    await Promise.all([
      hubAuth ? signOut(hubAuth) : Promise.resolve(),
      auth && auth !== hubAuth ? signOut(auth) : Promise.resolve(),
    ]);
  };

  const { user, profile, access, loading } = authState;
  const isAdmin = access.allowed && access.role === 'admin';
  const isSuperAdmin = Boolean(access.allowed && profile?.isSuperAdmin);
  const canEditModule = (moduleKey) => authorization.authorizeModule(moduleKey).allowed;

  return (
    <AuthContext.Provider value={{
      user, profile, loading, error, login, loginWithGoogle,
      pendingGoogleEmail, cancelGoogleLink, logout, isAdmin, isSuperAdmin, canEditModule,
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
