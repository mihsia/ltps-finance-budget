export class GoogleLinkRequiredError extends Error {
  constructor(email, credential) {
    super('Google account must be linked to the existing password account');
    this.name = 'GoogleLinkRequiredError';
    this.email = email;
    this.credential = credential;
  }
}

export const initialGoogleLinkState = Object.freeze({
  pendingCredential: null,
  pendingEmail: '',
  error: null,
});

export function reduceGoogleLinkState(state, action) {
  switch (action.type) {
    case 'link-required':
      return {
        pendingCredential: action.credential,
        pendingEmail: action.email,
        error: '此 Email 已使用密碼註冊，請輸入原密碼完成 Google 帳號連結',
      };
    case 'set-error':
      return { ...state, error: action.error };
    case 'google-login-succeeded':
    case 'password-login-succeeded':
    case 'logout':
    case 'cancel-link':
      return initialGoogleLinkState;
    default:
      return state;
  }
}

export async function startGoogleLogin({ auth, provider, signInWithPopup, credentialFromError }) {
  try {
    const userCredential = await signInWithPopup(auth, provider);
    return { userCredential };
  } catch (error) {
    if (error.code === 'auth/account-exists-with-different-credential') {
      const credential = credentialFromError(error);
      if (error.customData?.email && credential) {
        throw new GoogleLinkRequiredError(error.customData.email, credential);
      }
    }
    throw error;
  }
}

export async function completePasswordLogin({
  auth,
  email,
  password,
  pendingCredential,
  signInWithEmailAndPassword,
  linkWithCredential,
  signOut,
}) {
  const userCredential = await signInWithEmailAndPassword(auth, email, password);
  if (pendingCredential) {
    try {
      await linkWithCredential(userCredential.user, pendingCredential);
    } catch (error) {
      await signOut(auth);
      error.stage = 'google-link';
      throw error;
    }
  }
  return { userCredential, linked: Boolean(pendingCredential) };
}

export function mapAuthError(code, { stage } = {}) {
  if (stage === 'google-link' && [
    'auth/invalid-credential',
    'auth/user-token-expired',
  ].includes(code)) {
    return 'Google 登入憑證已失效，請取消連結後重新使用 Google 帳號登入';
  }

  switch (code) {
    case 'auth/popup-closed-by-user':
    case 'auth/cancelled-popup-request':
      return null;
    case 'auth/popup-blocked':
      return '瀏覽器已阻擋 Google 登入視窗，請允許彈出式視窗後再試';
    case 'auth/credential-already-in-use':
      return '這個 Google 帳號已連結到其他使用者';
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
