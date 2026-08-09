import { describe, expect, it } from 'vitest';

let policy = {};
try {
  policy = await import('./accessPolicy.js');
} catch {
  // The first RED run intentionally exercises the not-yet-created policy.
}

const evaluate = (state) => policy.evaluateProfileAccess?.(state);

describe('evaluateProfileAccess', () => {
  it.each([
    ['loading', 'profile-loading', '正在確認帳號權限，請稍候。'],
    ['missing', 'profile-missing', '找不到此帳號的權限資料，請聯絡系統管理員。'],
    ['error', 'profile-error', '無法確認帳號權限，請稍後再試或聯絡系統管理員。'],
  ])('fails closed while the profile is %s', (profileState, code, reason) => {
    expect(evaluate({ profileState })).toEqual(expect.objectContaining({
      allowed: false,
      code,
      reason,
    }));
  });

  it.each([
    [undefined, '此帳號尚未啟用，請聯絡系統管理員。'],
    ['disabled', '此帳號已停用，請聯絡系統管理員。'],
  ])('denies a profile whose explicit status is %s', (status, reason) => {
    expect(evaluate({
      profileState: 'ready',
      profile: { role: 'admin', status, modules: [] },
    })).toEqual(expect.objectContaining({
      allowed: false,
      code: status ? 'profile-disabled' : 'profile-inactive',
      reason,
    }));
  });

  it('allows an active admin to manage every module', () => {
    const access = evaluate({
      profileState: 'ready',
      profile: { role: 'admin', status: 'active', modules: [] },
    });

    expect(access).toEqual(expect.objectContaining({ allowed: true, role: 'admin' }));
    expect(policy.checkModuleAccess?.(access, 'settings')).toEqual(
      expect.objectContaining({ allowed: true }),
    );
  });

  it('allows an active editor only for explicitly assigned modules', () => {
    const access = evaluate({
      profileState: 'ready',
      profile: { role: 'editor', status: 'active', modules: ['basic'] },
    });

    expect(policy.checkModuleAccess?.(access, 'basic')).toEqual(
      expect.objectContaining({ allowed: true }),
    );
    expect(policy.checkModuleAccess?.(access, 'budget')).toEqual({
      allowed: false,
      code: 'module-denied',
      reason: '此帳號沒有「budget」模組的編輯權限。',
    });
    expect(policy.checkAdminAccess?.(access)).toEqual({
      allowed: false,
      code: 'admin-required',
      reason: '此功能僅限系統管理員使用。',
    });
  });

  it('denies an active profile with an unsupported role', () => {
    expect(evaluate({
      profileState: 'ready',
      profile: { role: 'viewer', status: 'active', modules: ['basic'] },
    })).toEqual({
      allowed: false,
      code: 'role-denied',
      reason: '此帳號沒有系統編輯權限，請聯絡系統管理員。',
    });
  });
});

describe('imperative authorization source', () => {
  it('binds admin-only state changes to an invocation-current audit actor', () => {
    const source = policy.createAuthorizationSource?.(
      evaluate({
        profileState: 'ready',
        profile: { role: 'admin', status: 'active', modules: [] },
      }),
    );

    expect(source.authorizeAdminActor()).toEqual(expect.objectContaining({
      allowed: false,
      code: 'actor-missing',
    }));

    source.replace(source.current(), { uid: 'admin-now', name: '即時管理員' });
    expect(source.authorizeAdminActor()).toEqual(expect.objectContaining({
      allowed: true,
      actor: { uid: 'admin-now', name: '即時管理員' },
    }));
  });

  it('rechecks the latest state when a retained module callback is invoked', () => {
    const source = policy.createAuthorizationSource?.();
    expect(source).toBeDefined();

    source.replace(evaluate({
      profileState: 'ready',
      profile: { role: 'editor', status: 'active', modules: ['basic'] },
    }));
    const retainedAuthorize = source.authorizeModule;
    expect(retainedAuthorize('basic').allowed).toBe(true);

    source.replace(evaluate({
      profileState: 'ready',
      profile: { role: 'editor', status: 'disabled', modules: ['basic'] },
    }));

    expect(retainedAuthorize('basic')).toEqual(expect.objectContaining({
      allowed: false,
      code: 'profile-disabled',
    }));
  });

  it('does not run a retained mutation after access is revoked', async () => {
    const source = policy.createAuthorizationSource?.();
    const write = () => Promise.resolve('written');
    let writeCount = 0;
    const retainedMutation = () => policy.runAuthorized?.(
      () => source.authorizeModule('basic'),
      async () => {
        writeCount += 1;
        return write();
      },
    );

    source.replace(evaluate({
      profileState: 'ready',
      profile: { role: 'editor', status: 'active', modules: ['basic'] },
    }));
    await expect(retainedMutation()).resolves.toEqual(expect.objectContaining({
      allowed: true,
      executed: true,
    }));
    expect(writeCount).toBe(1);

    source.replace(evaluate({
      profileState: 'ready',
      profile: { role: 'editor', status: 'disabled', modules: ['basic'] },
    }));
    await expect(retainedMutation()).resolves.toEqual(expect.objectContaining({
      allowed: false,
      executed: false,
      code: 'profile-disabled',
    }));
    expect(writeCount).toBe(1);
  });
});
