import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import * as authModule from '../contexts/AuthContext';
import { APP_UPDATED_AT, APP_VERSION } from '../lib/appInfo';
import Login from './Login';

vi.mock('../firebase', () => ({
  isFirebaseConfigured: true,
}));

function renderLogin(authValue) {
  return renderToStaticMarkup(
    <authModule.AuthContext.Provider value={authValue}>
      <Login />
    </authModule.AuthContext.Provider>,
  );
}

const baseAuthValue = {
  login: vi.fn(),
  loginWithGoogle: vi.fn(),
  cancelGoogleLink: vi.fn(),
  pendingGoogleEmail: '',
  error: null,
};

describe('Login Google-first layout', () => {
  it('leads with Google sign-in and hides the password form by default', () => {
    const markup = renderLogin(baseAuthValue);

    expect(markup).toContain('使用 Google 帳號登入');
    expect(markup).toContain('仍使用舊版帳號密碼登入');
    expect(markup).not.toContain('帳號（Email）');
    expect(markup).not.toMatch(/<button[^>]*disabled=""[^>]*>.*使用 Google 帳號登入/s);
  });

  it('disables the Google button and forces the password form open while a link is pending', () => {
    const markup = renderLogin({
      ...baseAuthValue,
      pendingGoogleEmail: 'owner@example.com',
      error: '請輸入原密碼完成 Google 帳號連結',
    });

    expect(markup).toContain('帳號（Email）');
    expect(markup).toContain('取消 Google 帳號連結');
    expect(markup).not.toContain('仍使用舊版帳號密碼登入');
    expect(markup).toMatch(/<button[^>]*disabled=""[^>]*>.*使用 Google 帳號登入/s);
  });

  it('shows the system version and last-updated date so support can confirm which build is running', () => {
    const markup = renderLogin(baseAuthValue);

    expect(markup).toContain(`v${APP_VERSION}`);
    expect(markup).toContain(APP_UPDATED_AT);
  });
});
