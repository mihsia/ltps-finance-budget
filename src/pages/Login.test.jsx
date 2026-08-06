import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import * as authModule from '../contexts/AuthContext';
import Login from './Login';

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

describe('Login Google link controls', () => {
  it('disables a different Google popup and offers cancellation while linking is pending', () => {
    const markup = renderLogin({
      ...baseAuthValue,
      pendingGoogleEmail: 'owner@example.com',
      error: '請輸入原密碼完成 Google 帳號連結',
    });

    expect(markup).toContain('取消 Google 帳號連結');
    expect(markup).toMatch(/<button[^>]*disabled=""[^>]*>.*使用 Google 帳號登入/s);
  });

  it('keeps Google popup login available when no link is pending', () => {
    const markup = renderLogin(baseAuthValue);

    expect(markup).not.toContain('取消 Google 帳號連結');
    expect(markup).not.toMatch(/<button[^>]*disabled=""[^>]*>.*使用 Google 帳號登入/s);
  });
});
