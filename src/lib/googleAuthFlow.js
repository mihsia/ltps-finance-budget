export class GoogleLinkRequiredError extends Error {
  constructor(email, credential) {
    super('Google account must be linked to the existing password account');
    this.name = 'GoogleLinkRequiredError';
    this.email = email;
    this.credential = credential;
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
}) {
  const userCredential = await signInWithEmailAndPassword(auth, email, password);
  if (pendingCredential) {
    await linkWithCredential(userCredential.user, pendingCredential);
  }
  return { userCredential, linked: Boolean(pendingCredential) };
}

export function mapAuthError(code) {
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
