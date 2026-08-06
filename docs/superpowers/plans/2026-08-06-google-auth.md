# Google Authentication Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Google popup sign-in to the existing login page, preserve Email/Password sign-in, link Google to an existing password account when Firebase reports an email collision, enable the provider, and deploy the updated Hosting site.

**Architecture:** Keep Firebase SDK orchestration in `AuthContext`, but move the provider-collision and password-link workflow into a small dependency-injected module that can be tested without a browser. `Login.jsx` consumes the Context API and renders the additional button and collision guidance. Firebase provider configuration is committed in `firebase.json`; only Auth configuration and Hosting are deployed.

**Tech Stack:** React 18, Firebase JS SDK 11, Vite 6, Vitest, Firebase CLI 15.

## Global Constraints

- Preserve the existing Email/Password login path.
- Use a Google popup, not a full-page redirect.
- Preserve the existing Firebase Auth UID by linking credentials after password verification.
- Application authorization continues to come from Firestore `/users/{uid}`; Google Cloud IAM Owner status does not grant app admin.
- Do not deploy Firestore rules, Storage rules, Functions, or seed data in this change.
- All user-facing messages remain Traditional Chinese.

---

## File Map

- Create `src/lib/googleAuthFlow.js`: dependency-injected Google popup and account-link workflow.
- Create `src/lib/googleAuthFlow.test.js`: unit tests for normal sign-in, collision detection, linking, and popup cancellation.
- Modify `src/contexts/AuthContext.jsx`: expose Google login and pending-link state to the UI.
- Modify `src/pages/Login.jsx`: render Google button, divider, and link-account guidance.
- Modify `package.json` and `package-lock.json`: add Vitest and the `test` script.
- Modify `firebase.json`: declare Email/Password and Google providers plus authorized origins.

### Task 1: Testable Google authentication workflow

**Files:**
- Create: `src/lib/googleAuthFlow.test.js`
- Create: `src/lib/googleAuthFlow.js`
- Modify: `package.json`
- Modify: `package-lock.json`

**Interfaces:**
- Produces: `startGoogleLogin(deps): Promise<{ userCredential }>` or throws `GoogleLinkRequiredError`.
- Produces: `completePasswordLogin(deps): Promise<{ userCredential, linked: boolean }>`.
- Produces: `mapAuthError(code): string | null`.

- [ ] **Step 1: Add the test runner**

Run:

```bash
npm install --save-dev vitest
```

Add to `package.json` scripts:

```json
"test": "vitest run"
```

- [ ] **Step 2: Write the failing workflow tests**

Create `src/lib/googleAuthFlow.test.js`:

```js
import { describe, expect, it, vi } from 'vitest';
import {
  GoogleLinkRequiredError,
  completePasswordLogin,
  mapAuthError,
  startGoogleLogin,
} from './googleAuthFlow';

describe('startGoogleLogin', () => {
  it('returns the popup credential for a normal Google sign-in', async () => {
    const userCredential = { user: { uid: 'google-user' } };
    const result = await startGoogleLogin({
      auth: {},
      provider: {},
      signInWithPopup: vi.fn().mockResolvedValue(userCredential),
      credentialFromError: vi.fn(),
    });
    expect(result).toEqual({ userCredential });
  });

  it('turns an existing-email collision into a link request', async () => {
    const pendingCredential = { providerId: 'google.com' };
    const firebaseError = {
      code: 'auth/account-exists-with-different-credential',
      customData: { email: 'owner@example.com' },
    };
    await expect(startGoogleLogin({
      auth: {},
      provider: {},
      signInWithPopup: vi.fn().mockRejectedValue(firebaseError),
      credentialFromError: vi.fn().mockReturnValue(pendingCredential),
    })).rejects.toEqual(new GoogleLinkRequiredError('owner@example.com', pendingCredential));
  });
});

describe('completePasswordLogin', () => {
  it('links a pending Google credential to the password user', async () => {
    const userCredential = { user: { uid: 'existing-user' } };
    const linkWithCredential = vi.fn().mockResolvedValue({});
    const result = await completePasswordLogin({
      auth: {},
      email: 'owner@example.com',
      password: 'secret',
      pendingCredential: { providerId: 'google.com' },
      signInWithEmailAndPassword: vi.fn().mockResolvedValue(userCredential),
      linkWithCredential,
    });
    expect(linkWithCredential).toHaveBeenCalledWith(userCredential.user, { providerId: 'google.com' });
    expect(result).toEqual({ userCredential, linked: true });
  });
});

describe('mapAuthError', () => {
  it('does not show an error when the user closes the popup', () => {
    expect(mapAuthError('auth/popup-closed-by-user')).toBeNull();
  });

  it('explains a blocked popup', () => {
    expect(mapAuthError('auth/popup-blocked')).toBe('瀏覽器已阻擋 Google 登入視窗，請允許彈出式視窗後再試');
  });
});
```

- [ ] **Step 3: Run the tests and verify RED**

Run:

```bash
npm test -- src/lib/googleAuthFlow.test.js
```

Expected: FAIL because `src/lib/googleAuthFlow.js` does not exist.

- [ ] **Step 4: Implement the minimum workflow**

Create `src/lib/googleAuthFlow.js`:

```js
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
```

- [ ] **Step 5: Run the tests and verify GREEN**

Run:

```bash
npm test -- src/lib/googleAuthFlow.test.js
```

Expected: 5 tests pass.

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json src/lib/googleAuthFlow.js src/lib/googleAuthFlow.test.js
git commit -m "Add tested Google authentication flow"
```

### Task 2: Wire Google authentication into the React login page

**Files:**
- Modify: `src/contexts/AuthContext.jsx:1-66`
- Modify: `src/pages/Login.jsx:1-56`

**Interfaces:**
- Consumes: `startGoogleLogin`, `completePasswordLogin`, `mapAuthError`, `GoogleLinkRequiredError`.
- Produces through `useAuth()`: `loginWithGoogle(): Promise<void>`, `pendingGoogleEmail: string`, and existing `login()`.

- [ ] **Step 1: Add Context integration**

Update Firebase Auth imports in `AuthContext.jsx`:

```js
import {
  GoogleAuthProvider,
  linkWithCredential,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
} from 'firebase/auth';
import {
  GoogleLinkRequiredError,
  completePasswordLogin,
  mapAuthError,
  startGoogleLogin,
} from '../lib/googleAuthFlow';
```

Add state and replace login behavior:

```js
const [pendingGoogleCredential, setPendingGoogleCredential] = useState(null);
const [pendingGoogleEmail, setPendingGoogleEmail] = useState('');

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
```

Expose the new Context values:

```jsx
<AuthContext.Provider value={{
  user, profile, loading, error, login, loginWithGoogle,
  pendingGoogleEmail, logout, isAdmin, canEditModule,
}}>
```

Delete the old `mapAuthError` function from the bottom of `AuthContext.jsx`; the shared implementation in `src/lib/googleAuthFlow.js` is now the single source of truth.

- [ ] **Step 2: Add the Google button and link guidance**

In `Login.jsx`, import `useEffect`, consume the new Context values, and add the Google submit handler:

```js
import { useEffect, useState } from 'react';

const { login, loginWithGoogle, pendingGoogleEmail, error } = useAuth();

useEffect(() => {
  if (pendingGoogleEmail) setEmail(pendingGoogleEmail);
}, [pendingGoogleEmail]);

const submitGoogle = async () => {
  setSubmitting(true);
  try {
    await loginWithGoogle();
  } catch {
    // Error and link-account guidance are surfaced by AuthContext.
  } finally {
    setSubmitting(false);
  }
};
```

Update the Email input and primary button so the collision state cannot be changed accidentally:

```jsx
<input
  style={{ ...input, background: pendingGoogleEmail ? '#F5F3EE' : '#fff' }}
  type="email"
  required
  readOnly={Boolean(pendingGoogleEmail)}
  value={email}
  onChange={(e) => setEmail(e.target.value)}
/>

<button type="submit" style={{ ...btnPrimary, width: '100%', justifyContent: 'center', opacity: submitting ? .6 : 1 }} disabled={submitting}>
  {submitting ? '處理中…' : pendingGoogleEmail ? '驗證密碼並連結 Google' : '登入'}
</button>
```

Render this divider and Google button after the existing login button:

```jsx
<div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '18px 0', color: '#8A9089', fontSize: 12 }}>
  <span style={{ height: 1, background: '#E3DFD3', flex: 1 }} />
  或
  <span style={{ height: 1, background: '#E3DFD3', flex: 1 }} />
</div>
<button
  type="button"
  onClick={submitGoogle}
  disabled={submitting}
  style={{
    width: '100%', minHeight: 44, borderRadius: 8, border: '1px solid #D8D3C4',
    background: '#fff', color: '#1E2420', display: 'flex', alignItems: 'center',
    justifyContent: 'center', gap: 10, cursor: submitting ? 'default' : 'pointer',
    font: "700 13px 'Noto Sans TC', sans-serif", opacity: submitting ? .6 : 1,
  }}
>
  <span style={{ font: '700 16px Inter, sans-serif', color: '#4285F4' }}>G</span>
  使用 Google 帳號登入
</button>
```

When `pendingGoogleEmail` is present, set the Email input to `readOnly` and change the primary button copy to `驗證密碼並連結 Google`.

- [ ] **Step 3: Run tests and production build**

```bash
npm test
npm run build
git diff --check
```

Expected: all tests pass, Vite build exits 0, and diff check produces no output.

- [ ] **Step 4: Commit**

```bash
git add src/contexts/AuthContext.jsx src/pages/Login.jsx
git commit -m "Add Google sign-in to login page"
```

### Task 3: Enable Google provider and deploy

**Files:**
- Modify: `firebase.json:1-26`

**Interfaces:**
- Consumes: Firebase project alias `ltps-finance-budget` from `.firebaserc`.
- Produces: enabled Google provider and a live Hosting release.

- [ ] **Step 1: Add Auth configuration**

Add this top-level block to `firebase.json`:

```json
"auth": {
  "providers": {
    "emailPassword": true,
    "googleSignIn": {
      "oAuthBrandDisplayName": "利澤國小基金預算管理系統",
      "supportEmail": "mihsia@gmail.com",
      "authorizedRedirectUris": [
        "https://ltps-finance-budget.web.app",
        "https://ltps-finance-budget.firebaseapp.com",
        "http://localhost"
      ]
    }
  }
}
```

- [ ] **Step 2: Validate and deploy Auth configuration**

```bash
npx -y firebase-tools@latest use
npx -y firebase-tools@latest deploy --only auth --project ltps-finance-budget
```

Expected: active project is `ltps-finance-budget` and Auth deployment completes successfully.

- [ ] **Step 3: Build and deploy Hosting**

```bash
npm test
npm run build
npx -y firebase-tools@latest deploy --only hosting --project ltps-finance-budget
```

Expected: tests and build exit 0; Hosting reports `release complete` and returns `https://ltps-finance-budget.web.app`.

- [ ] **Step 4: Verify the live site**

```bash
curl -I https://ltps-finance-budget.web.app
curl -L https://ltps-finance-budget.web.app | rg 'assets/index-.*\.js'
```

Expected: HTTP 200 and the deployed HTML references the new build asset.

Open the live site and verify that the Google popup opens from `使用 Google 帳號登入`. Do not enter or retain user credentials during automated verification.

- [ ] **Step 5: Commit and update GitHub**

```bash
git add firebase.json
git commit -m "Enable Google authentication"
git push
```

Update draft PR #2 with the implementation commits and verification summary.
