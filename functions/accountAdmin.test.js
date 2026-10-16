import { describe, expect, it } from 'vitest';
import {
  ACCOUNT_MODULE_KEYS,
  DEFAULT_IMPORT_EMAIL_DOMAIN,
  buildCreatedProfile,
  buildStatusChange,
  describeSignInDenial,
  normalizeImportRow,
  validateAccountProfile,
  validateStatusRequest,
} from './accountAdmin.cjs';

const validInput = {
  name: '王小明',
  email: 'Staff@Example.com ',
  dept: '總務處',
  role: 'editor',
  modules: ['budget', 'library'],
};

describe('validateAccountProfile', () => {
  it('normalizes the email so the Auth account and profile lookup agree', () => {
    const result = validateAccountProfile(validInput);
    expect(result.valid).toBe(true);
    expect(result.value.email).toBe('staff@example.com');
    expect(result.value.name).toBe('王小明');
  });

  it('rejects a blank name', () => {
    const result = validateAccountProfile({ ...validInput, name: '   ' });
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/姓名/);
  });

  it('rejects a malformed email', () => {
    const result = validateAccountProfile({ ...validInput, email: 'not-an-email' });
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/Email/);
  });

  it('rejects an unknown department', () => {
    const result = validateAccountProfile({ ...validInput, dept: '不存在處室' });
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/處室/);
  });

  it('rejects a role outside admin/editor', () => {
    const result = validateAccountProfile({ ...validInput, role: 'owner' });
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/權限/);
  });

  it('rejects module keys that are not real modules', () => {
    const result = validateAccountProfile({ ...validInput, modules: ['budget', 'not-a-module'] });
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/模組/);
  });

  it('accepts every real module key', () => {
    const result = validateAccountProfile({ ...validInput, modules: [...ACCOUNT_MODULE_KEYS] });
    expect(result.valid).toBe(true);
  });

  it('includes specialNeeds (特生統計), added after the module keys list was first written', () => {
    expect(ACCOUNT_MODULE_KEYS).toContain('specialNeeds');
  });

  it('clears module scope for admins so role and scope cannot disagree', () => {
    const result = validateAccountProfile({ ...validInput, role: 'admin', modules: ['budget'] });
    expect(result.valid).toBe(true);
    expect(result.value.modules).toEqual([]);
  });

  it('de-duplicates repeated module keys', () => {
    const result = validateAccountProfile({ ...validInput, modules: ['budget', 'budget'] });
    expect(result.valid).toBe(true);
    expect(result.value.modules).toEqual(['budget']);
  });

  it('ignores caller-supplied status so privilege cannot be set through the profile payload', () => {
    const result = validateAccountProfile({ ...validInput, status: 'disabled' });
    expect(result.valid).toBe(true);
    expect(result.value.status).toBeUndefined();
  });

  it('rejects a non-array modules value instead of silently coercing it', () => {
    const result = validateAccountProfile({ ...validInput, modules: 'budget' });
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/模組/);
  });
});

describe('buildCreatedProfile', () => {
  it('marks new accounts active so they are not locked out by fail-closed access checks', () => {
    const profile = buildCreatedProfile({
      value: validateAccountProfile(validInput).value,
      callerUid: 'admin-1',
      now: '2026-08-09T00:00:00.000Z',
    });
    expect(profile.status).toBe('active');
    expect(profile.createdBy).toBe('admin-1');
    expect(profile.createdAt).toBe('2026-08-09T00:00:00.000Z');
  });
});

describe('validateStatusRequest', () => {
  it('accepts disabling another account', () => {
    const result = validateStatusRequest({ uid: 'user-2', status: 'disabled', callerUid: 'admin-1' });
    expect(result.valid).toBe(true);
  });

  it('accepts reactivating another account', () => {
    const result = validateStatusRequest({ uid: 'user-2', status: 'active', callerUid: 'admin-1' });
    expect(result.valid).toBe(true);
  });

  it('refuses to let an admin disable their own account', () => {
    const result = validateStatusRequest({ uid: 'admin-1', status: 'disabled', callerUid: 'admin-1' });
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/自己/);
  });

  it('rejects a status outside active/disabled, so accounts never enter an unreachable state', () => {
    const result = validateStatusRequest({ uid: 'user-2', status: 'deleted', callerUid: 'admin-1' });
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/狀態/);
  });

  it('rejects a missing uid', () => {
    const result = validateStatusRequest({ uid: '', status: 'disabled', callerUid: 'admin-1' });
    expect(result.valid).toBe(false);
  });
});

describe('buildStatusChange', () => {
  it('records who changed the status and when, and disables the Auth account in step', () => {
    const change = buildStatusChange({ status: 'disabled', callerUid: 'admin-1', now: '2026-08-09T01:00:00.000Z' });
    expect(change.profile.status).toBe('disabled');
    expect(change.profile.statusChangedBy).toBe('admin-1');
    expect(change.profile.statusChangedAt).toBe('2026-08-09T01:00:00.000Z');
    expect(change.authDisabled).toBe(true);
  });

  it('re-enables the Auth account when reactivating', () => {
    const change = buildStatusChange({ status: 'active', callerUid: 'admin-1', now: '2026-08-09T01:00:00.000Z' });
    expect(change.profile.status).toBe('active');
    expect(change.authDisabled).toBe(false);
  });
});

describe('describeSignInDenial', () => {
  it('allows an active, listed profile through', () => {
    expect(describeSignInDenial({ status: 'active' })).toBeNull();
  });

  it('rejects a sign-in with no matching /users profile at all', () => {
    expect(describeSignInDenial(null)).toMatch(/尚未建立/);
  });

  it('rejects a disabled profile even though it exists', () => {
    expect(describeSignInDenial({ status: 'disabled' })).toMatch(/已停用/);
  });
});

describe('normalizeImportRow', () => {
  it('appends the default school domain to a bare account name', () => {
    const row = normalizeImportRow({
      name: ' 王小明 ', account: 'wang.xm', dept: '總務處', role: '填報人員', modules: '歲入歲出、圖書藏書',
    });
    expect(row).toEqual({
      name: '王小明',
      email: `wang.xm${DEFAULT_IMPORT_EMAIL_DOMAIN}`,
      dept: '總務處',
      role: 'editor',
      modules: ['budget', 'library'],
    });
  });

  it('keeps a full email as-is instead of appending the default domain', () => {
    const row = normalizeImportRow({ name: '陳小華', account: 'Chen@Other-School.edu.tw', dept: '教務處', role: '管理者', modules: '' });
    expect(row.email).toBe('chen@other-school.edu.tw');
    expect(row.role).toBe('admin');
    expect(row.modules).toEqual([]);
  });

  it('accepts comma or whitespace separated modules alongside 頓號', () => {
    const row = normalizeImportRow({
      name: '林小美', account: 'lin', dept: '學務處', role: '填報人員', modules: '獲獎紀錄,課後社團 土地現值',
    });
    expect(row.modules).toEqual(['awards', 'club', 'land']);
  });

  it('passes through a raw module key or role value unmapped, letting validateAccountProfile reject it', () => {
    const row = normalizeImportRow({
      name: '林小美', account: 'lin', dept: '學務處', role: 'editor', modules: 'budget、not-a-real-module',
    });
    expect(row.role).toBe('editor');
    expect(row.modules).toEqual(['budget', 'not-a-real-module']);
  });

  it('feeds validateAccountProfile a shape it accepts end to end', () => {
    const row = normalizeImportRow({
      name: '王小明', account: 'wang.xm', dept: '總務處', role: '填報人員', modules: '歲入歲出',
    });
    expect(validateAccountProfile(row)).toMatchObject({ valid: true });
  });
});
