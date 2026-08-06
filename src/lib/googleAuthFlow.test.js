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
