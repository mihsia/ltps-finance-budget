import { describe, expect, it, vi } from 'vitest';
import * as googleAuthFlow from './googleAuthFlow';
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

  it('signs the password user out before surfacing a Google link failure', async () => {
    const linkError = Object.assign(new Error('expired Google credential'), {
      code: 'auth/invalid-credential',
    });
    const signOut = vi.fn().mockResolvedValue();
    const linkWithCredential = vi.fn().mockRejectedValue(linkError);

    await expect(completePasswordLogin({
      auth: { name: 'firebase-auth' },
      email: 'owner@example.com',
      password: 'secret',
      pendingCredential: { providerId: 'google.com' },
      signInWithEmailAndPassword: vi.fn().mockResolvedValue({
        user: { uid: 'existing-user' },
      }),
      linkWithCredential,
      signOut,
    })).rejects.toMatchObject({
      code: 'auth/invalid-credential',
      stage: 'google-link',
    });

    expect(signOut).toHaveBeenCalledWith({ name: 'firebase-auth' });
    expect(linkWithCredential.mock.invocationCallOrder[0])
      .toBeLessThan(signOut.mock.invocationCallOrder[0]);
  });

  it('keeps ordinary password login working without pending Google state', async () => {
    const userCredential = { user: { uid: 'password-user' } };
    const linkWithCredential = vi.fn();
    const signOut = vi.fn();

    await expect(completePasswordLogin({
      auth: {},
      email: 'teacher@example.com',
      password: 'secret',
      pendingCredential: null,
      signInWithEmailAndPassword: vi.fn().mockResolvedValue(userCredential),
      linkWithCredential,
      signOut,
    })).resolves.toEqual({ userCredential, linked: false });

    expect(linkWithCredential).not.toHaveBeenCalled();
    expect(signOut).not.toHaveBeenCalled();
  });
});

describe('Google link state', () => {
  const pendingState = {
    pendingCredential: { providerId: 'google.com' },
    pendingEmail: 'owner@example.com',
    error: '請輸入原密碼完成 Google 帳號連結',
  };

  it.each(['google-login-succeeded', 'logout', 'cancel-link'])(
    'clears the pending credential, email, and visible error after %s',
    (action) => {
      expect(googleAuthFlow.reduceGoogleLinkState(pendingState, { type: action }))
        .toEqual(googleAuthFlow.initialGoogleLinkState);
    },
  );
});

describe('mapAuthError', () => {
  it('does not show an error when the user closes the popup', () => {
    expect(mapAuthError('auth/popup-closed-by-user')).toBeNull();
  });

  it('explains a blocked popup', () => {
    expect(mapAuthError('auth/popup-blocked')).toBe('瀏覽器已阻擋 Google 登入視窗，請允許彈出式視窗後再試');
  });

  it.each(['auth/invalid-credential', 'auth/user-token-expired'])(
    'asks the user to restart Google authentication for %s during linking',
    (code) => {
      expect(mapAuthError(code, { stage: 'google-link' }))
        .toBe('Google 登入憑證已失效，請取消連結後重新使用 Google 帳號登入');
    },
  );
});
