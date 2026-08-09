import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createAuthorizationSource } from '../lib/accessPolicy';

const firestoreMocks = vi.hoisted(() => ({
  users: [],
  emitError: null,
  listeners: new Set(),
}));

const callableMocks = vi.hoisted(() => ({
  calls: [],
  impl: vi.fn(async () => ({ data: {} })),
}));

const authMocks = vi.hoisted(() => ({
  decision: { allowed: true, code: 'access-granted', reason: null, role: 'admin', modules: [] },
  actor: { uid: 'admin-1', name: '系統管理員' },
  authorization: null,
  value: null,
}));

vi.mock('firebase/firestore', () => ({
  collection: (...args) => ({ path: args.slice(1).join('/') }),
  onSnapshot: (_ref, onNext, onError) => {
    const listener = { onNext, onError };
    firestoreMocks.listeners.add(listener);
    if (firestoreMocks.emitError) onError?.(firestoreMocks.emitError);
    else {
      onNext({
        docs: firestoreMocks.users.map((user) => ({
          id: user.uid,
          data: () => {
            const { uid, ...rest } = user;
            return rest;
          },
        })),
      });
    }
    return () => firestoreMocks.listeners.delete(listener);
  },
}));

vi.mock('firebase/functions', () => ({
  httpsCallable: (_functions, name) => async (payload) => {
    callableMocks.calls.push({ name, payload });
    return callableMocks.impl(name, payload);
  },
}));

vi.mock('../firebase', () => ({
  db: {},
  functions: {},
  isFirebaseConfigured: true,
}));

vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => authMocks.value,
}));

const { default: Settings } = await import('./Settings.jsx');

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

function textOf(node) {
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  return (node.children || []).map(textOf).join('');
}

function pageText(renderer) {
  return textOf(renderer.root);
}

function control(renderer, text) {
  return renderer.root.findAll(
    (node) => typeof node.props.onClick === 'function' && textOf(node).trim() === text,
  )[0];
}

function field(renderer, ariaLabel) {
  return renderer.root.findAll((node) => node.props['aria-label'] === ariaLabel)[0];
}

function setAuth({ role = 'admin', modules = [], actor = { uid: 'admin-1', name: '系統管理員' } } = {}) {
  const decision = role
    ? { allowed: true, code: 'access-granted', reason: null, role, modules }
    : { allowed: false, code: 'profile-missing', reason: '找不到此帳號的權限資料，請聯絡系統管理員。' };
  authMocks.authorization = createAuthorizationSource(decision, actor);
  authMocks.value = {
    isAdmin: decision.allowed && decision.role === 'admin',
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
  firestoreMocks.users = [
    { uid: 'admin-1', name: '系統管理員', email: 'admin@example.com', dept: '校長室', role: 'admin', modules: [], status: 'active' },
    { uid: 'user-2', name: '王小明', email: 'staff@example.com', dept: '總務處', role: 'editor', modules: ['budget'], status: 'active' },
    { uid: 'user-3', name: '李小華', email: 'off@example.com', dept: '總務處', role: 'editor', modules: [], status: 'disabled' },
  ];
  firestoreMocks.emitError = null;
  firestoreMocks.listeners.clear();
  callableMocks.calls = [];
  callableMocks.impl = vi.fn(async () => ({ data: {} }));
  setAuth();
});

describe('Settings account administration', () => {
  it('shows each account status so a disabled account is not mistaken for a working one', async () => {
    const renderer = await render();
    expect(pageText(renderer)).toContain('已停用');
  });

  it('lets an admin edit an existing account and sends only the allowed fields', async () => {
    const renderer = await render();

    await act(async () => { control(renderer, '編輯').props.onClick(); });
    await act(async () => { field(renderer, '姓名').props.onChange({ target: { value: '王大明' } }); });
    await act(async () => { control(renderer, '儲存').props.onClick(); });

    const call = callableMocks.calls.find((c) => c.name === 'updateAccount');
    expect(call).toBeTruthy();
    expect(call.payload.uid).toBe('user-2');
    expect(call.payload.name).toBe('王大明');
    expect(call.payload.email).toBeUndefined();
    expect(call.payload.status).toBeUndefined();
  });

  it('lets an admin change an account role and module scope', async () => {
    const renderer = await render();

    await act(async () => { control(renderer, '編輯').props.onClick(); });
    await act(async () => { control(renderer, '圖書藏書').props.onClick(); });
    await act(async () => { control(renderer, '儲存').props.onClick(); });

    const call = callableMocks.calls.find((c) => c.name === 'updateAccount');
    expect(call.payload.modules).toContain('budget');
    expect(call.payload.modules).toContain('library');
  });

  it('disables an account through the callable rather than deleting it', async () => {
    const renderer = await render();

    await act(async () => { control(renderer, '停用').props.onClick(); });

    const call = callableMocks.calls.find((c) => c.name === 'setAccountStatus');
    expect(call.payload).toEqual({ uid: 'user-2', status: 'disabled' });
  });

  it('reactivates a disabled account', async () => {
    const renderer = await render();

    await act(async () => { control(renderer, '重新啟用').props.onClick(); });

    const call = callableMocks.calls.find((c) => c.name === 'setAccountStatus');
    expect(call.payload).toEqual({ uid: 'user-3', status: 'active' });
  });

  it('does not offer to disable the signed-in admin their own account', async () => {
    const renderer = await render();
    const disableControls = renderer.root.findAll(
      (node) => typeof node.props.onClick === 'function' && textOf(node).trim() === '停用',
    );
    // Only the other active account (user-2) is disable-able; admin-1 is self.
    expect(disableControls).toHaveLength(1);
  });

  it('rejects a save issued after the admin role was revoked mid-session', async () => {
    const renderer = await render();
    await act(async () => { control(renderer, '編輯').props.onClick(); });
    const save = control(renderer, '儲存');

    authMocks.authorization.replace(
      { allowed: true, code: 'access-granted', reason: null, role: 'editor', modules: ['settings'] },
      { uid: 'admin-1', name: '系統管理員' },
    );

    await act(async () => { save.props.onClick(); });

    expect(callableMocks.calls.some((c) => c.name === 'updateAccount')).toBe(false);
    expect(pageText(renderer)).toContain('此功能僅限系統管理員使用');
  });

  it('rejects a status change issued after the account was disabled mid-session', async () => {
    const renderer = await render();
    const disable = control(renderer, '停用');

    authMocks.authorization.replace(
      { allowed: false, code: 'profile-disabled', reason: '此帳號已停用，請聯絡系統管理員。' },
      { uid: 'admin-1', name: '系統管理員' },
    );

    await act(async () => { disable.props.onClick(); });

    expect(callableMocks.calls.some((c) => c.name === 'setAccountStatus')).toBe(false);
    expect(pageText(renderer)).toContain('此帳號已停用');
  });

  it('freezes the controls while a change is in flight so it cannot be submitted twice', async () => {
    const pending = deferred();
    callableMocks.impl = vi.fn(() => pending.promise);
    const renderer = await render();

    await act(async () => { control(renderer, '停用').props.onClick(); });
    expect(callableMocks.calls).toHaveLength(1);

    await act(async () => { control(renderer, '停用')?.props.onClick(); });
    expect(callableMocks.calls).toHaveLength(1);

    await act(async () => {
      pending.resolve({ data: {} });
      await pending.promise;
    });
  });

  it('surfaces a failed change instead of appearing to succeed', async () => {
    callableMocks.impl = vi.fn(async () => { throw new Error('權限不足'); });
    const renderer = await render();

    await act(async () => { control(renderer, '停用').props.onClick(); });

    expect(pageText(renderer)).toContain('權限不足');
  });

  it('surfaces a failed account listing instead of showing an empty roster', async () => {
    firestoreMocks.emitError = new Error('permission denied');
    const renderer = await render();

    expect(pageText(renderer)).toContain('無法載入帳號資料');
    expect(pageText(renderer)).not.toContain('尚無帳號資料');
  });

  it('hides every management control from a non-admin', async () => {
    setAuth({ role: 'editor', modules: ['settings'], actor: { uid: 'user-2', name: '王小明' } });
    const renderer = await render();

    expect(control(renderer, '編輯')).toBeUndefined();
    expect(control(renderer, '停用')).toBeUndefined();
    expect(control(renderer, '＋ 新增帳號')).toBeUndefined();
  });
});
