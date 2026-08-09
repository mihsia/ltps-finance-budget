import { describe, expect, it } from 'vitest';
import {
  ACCOUNT_MODULE_KEYS,
  buildCreatedProfile,
  buildStatusChange,
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
