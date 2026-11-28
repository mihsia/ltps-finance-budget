import TestRenderer, { act } from 'react-test-renderer';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createAuthorizationSource } from '../lib/accessPolicy';

const callableMocks = vi.hoisted(() => ({
  calls: [],
  accounts: [],
  canManage: true,
  isSuperAdmin: true,
  overrideImpl: null,
}));

const authMocks = vi.hoisted(() => ({
  authorization: null,
  value: null,
}));

vi.mock('@ltps/account-sdk/core', async (importOriginal) => {
  const actual = await importOriginal();
  const invoke = (name) => async (payload) => {
    callableMocks.calls.push({ name, payload });
    if (callableMocks.overrideImpl) {
      return (await callableMocks.overrideImpl(name, payload)).data;
    }
    if (name === 'accounts_list') {
      return {
        mode: 'app',
        appId: 'finance',
        canManage: callableMocks.canManage,
        isSuperAdmin: callableMocks.isSuperAdmin,
        appConfig: actual.DEFAULT_APPS.finance,
        accounts: callableMocks.accounts,
      };
    }
    return { uid: payload?.uid || 'new-uid', attachedExisting: false };
  };
  return {
    ...actual,
    createAccountHubClient: () => ({
      getMyAccess: invoke('accounts_getMyAccess'),
      listAppAccounts: (appId) => invoke('accounts_list')({ mode: 'app', appId }),
      listHubAccounts: () => invoke('accounts_list')({ mode: 'hub' }),
      createAccount: invoke('accounts_create'),
      updateAccount: invoke('accounts_update'),
      setAppStatus: invoke('accounts_setAppStatus'),
      setGlobalStatus: invoke('accounts_setGlobalStatus'),
      setSuperAdmin: invoke('accounts_setSuperAdmin'),
      importAccounts: invoke('accounts_import'),
      listApps: invoke('accounts_listApps'),
      upsertApp: invoke('accounts_upsertApp'),
      listLogs: invoke('accounts_listLogs'),
    }),
  };
});

vi.mock('../firebase', () => ({
  ACCOUNT_HUB_URL: 'https://ltps-accounts.web.app',
  functions: {},
  isFirebaseConfigured: true,
}));

vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => authMocks.value,
}));

const { default: Settings } = await import('./Settings.jsx');

function textOf(node) {
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  return (node.children || []).map(textOf).join('');
}

function pageText(renderer) {
  return textOf(renderer.root);
}

function findButton(renderer, label) {
  return renderer.root.findAll(
    (node) => node.type === 'button' && textOf(node).trim() === label,
  );
}

function setAuth({ role = 'admin', modules = [], actor = { uid: 'admin-1', name: '系統管理員' } } = {}) {
  const decision = role
    ? { allowed: true, code: 'access-granted', reason: null, role, modules }
    : { allowed: false, code: 'profile-missing', reason: '找不到此帳號的權限資料，請聯絡系統管理員。' };
  authMocks.authorization = createAuthorizationSource(decision, actor);
  authMocks.value = {
    isAdmin: decision.allowed && decision.role === 'admin',
    canEditModule: (moduleKey) => authMocks.authorization.authorizeModule(moduleKey).allowed,
    authorizeAdmin: authMocks.authorization.authorizeAdmin,
    authorizeAdminActor: authMocks.authorization.authorizeAdminActor,
  };
}

async function render() {
  let renderer;
  await act(async () => {
    renderer = TestRenderer.create(<Settings />);
  });
  return renderer;
}

beforeEach(() => {
  callableMocks.calls = [];
  callableMocks.overrideImpl = null;
  callableMocks.canManage = true;
  callableMocks.isSuperAdmin = true;
  callableMocks.accounts = [
    {
      uid: 'admin-1',
      name: '系統管理員',
      email: 'mihsia@gmail.com',
      dept: '校長室',
      jobTitle: '管理者',
      globalStatus: 'active',
      isSuperAdmin: true,
      isBootstrap: true,
      claimsVersion: 1,
      appAccess: { status: 'active', role: 'admin', modules: [] },
    },
    {
      uid: 'user-2',
      name: '王小明',
      email: 'staff@tmail.ilc.edu.tw',
      dept: '總務處',
      jobTitle: '出納組長',
      globalStatus: 'active',
      isSuperAdmin: false,
      claimsVersion: 1,
      appAccess: { status: 'active', role: 'editor', modules: ['budget', 'library'] },
    },
    {
      uid: 'user-3',
      name: '李小華',
      email: 'off@tmail.ilc.edu.tw',
      dept: '總務處',
      jobTitle: '',
      globalStatus: 'active',
      isSuperAdmin: false,
      claimsVersion: 1,
      appAccess: { status: 'disabled', role: 'editor', modules: [] },
    },
  ];
  setAuth();
});

describe('Settings 嵌入全校統一帳號管理元件（@ltps/account-sdk）', () => {
  it('透過 accounts_list 載入 finance 系統帳號並提供全校帳號管理後台入口', async () => {
    const renderer = await render();

    expect(callableMocks.calls[0]).toEqual({
      name: 'accounts_list',
      payload: { mode: 'app', appId: 'finance' },
    });

    const text = pageText(renderer);
    expect(text).toContain('帳號管理');
    expect(text).toContain('王小明');
    expect(text).toContain('歲入歲出');
    expect(text).toContain('本系統已停權');
    expect(text).toContain('開啟全校帳號管理後台');
  });

  it('單系統停用與啟用呼叫 accounts_setAppStatus 而非全校停用', async () => {
    const renderer = await render();

    const activeDisableBtn = findButton(renderer, '停用本系統').find((b) => !b.props.disabled);
    expect(activeDisableBtn).toBeTruthy();

    await act(async () => {
      activeDisableBtn.props.onClick();
    });

    const call = callableMocks.calls.find((c) => c.name === 'accounts_setAppStatus');
    expect(call?.payload).toEqual({ uid: 'user-2', appId: 'finance', status: 'disabled' });
    expect(callableMocks.calls.some((c) => c.name === 'accounts_setGlobalStatus')).toBe(false);
  });

  it('工作階段中途被撤銷管理者權限時，前端防衛層會立即攔截寫入不呼叫後端', async () => {
    const renderer = await render();
    const activeDisableBtn = findButton(renderer, '停用本系統').find((b) => !b.props.disabled);

    authMocks.authorization.replace(
      { allowed: true, code: 'access-granted', reason: null, role: 'editor', modules: ['settings'] },
      { uid: 'admin-1', name: '系統管理員' },
    );

    await act(async () => {
      activeDisableBtn.props.onClick();
    });

    expect(callableMocks.calls.some((c) => c.name === 'accounts_setAppStatus')).toBe(false);
    expect(pageText(renderer)).toContain('此功能僅限系統管理員使用');
  });

  it('僅具 settings 檢視權的非管理者呈現唯讀模式且不顯示異動按鈕', async () => {
    callableMocks.canManage = false;
    callableMocks.isSuperAdmin = false;
    setAuth({ role: 'editor', modules: ['settings'], actor: { uid: 'user-2', name: '王小明' } });

    const renderer = await render();
    expect(pageText(renderer)).toContain('唯讀檢視模式');
    expect(findButton(renderer, '＋ 新增帳號')).toHaveLength(0);
    expect(findButton(renderer, '停用本系統')).toHaveLength(0);
  });

  it('無 settings 模組權限的一般填報人員顯示無權限畫面且不呼叫 accounts_list', async () => {
    setAuth({ role: 'editor', modules: ['budget'], actor: { uid: 'user-2', name: '王小明' } });

    const renderer = await render();
    expect(pageText(renderer)).toContain('無權限');
    expect(callableMocks.calls).toHaveLength(0);
  });
});
