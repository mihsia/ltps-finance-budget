import { describe, expect, it } from 'vitest';
import {
  SEED_YEARS, buildYearPlan, ensureAdminProfile, runMigration,
} from './migration.cjs';

function fakeDb(initial = {}) {
  const store = new Map(Object.entries(initial));
  return {
    store,
    doc(path) {
      return {
        async get() {
          return { exists: store.has(path), data: () => store.get(path) };
        },
        async set(data) {
          store.set(path, data);
        },
      };
    },
  };
}

function fakeAuth(existingUsers = {}) {
  const byEmail = new Map(Object.entries(existingUsers));
  const created = [];
  return {
    created,
    async getUserByEmail(email) {
      if (!byEmail.has(email)) throw new Error('auth/user-not-found');
      return { uid: byEmail.get(email) };
    },
    async createUser({ email }) {
      const uid = `new-${email}`;
      byEmail.set(email, uid);
      created.push(email);
      return { uid };
    },
  };
}

describe('buildYearPlan', () => {
  it('gives 115 an itemized real budget breakdown and the placeholder modules', () => {
    const plan = buildYearPlan('115');
    const budgetGroup = plan.recordGroups.find((g) => g.modulePath === 'years/115/modules/budget');
    expect(budgetGroup.rows.filter((r) => r.data.recordType === 'expense')).toHaveLength(3);
    expect(budgetGroup.rows.filter((r) => r.data.recordType === 'revenue')).toHaveLength(4);
    expect(plan.recordGroups.map((g) => g.modulePath)).toEqual(expect.arrayContaining([
      'years/115/modules/language', 'years/115/modules/awards', 'years/115/modules/club',
      'years/115/modules/land', 'years/115/modules/inquiry',
    ]));
    expect(plan.yearDoc.data.locked).toBe(false);
  });

  it('gives earlier years only a single legacy-total expense record and no placeholder modules', () => {
    const plan = buildYearPlan('113');
    expect(plan.recordGroups).toHaveLength(1);
    expect(plan.recordGroups[0].rows).toEqual([
      expect.objectContaining({ id: 'expense-legacy-total', data: expect.objectContaining({ amount: 56463 }) }),
    ]);
    expect(plan.yearDoc.data.locked).toBe(true);
  });

  it('every generated record id is unique within its module', () => {
    for (const year of SEED_YEARS) {
      const plan = buildYearPlan(year);
      for (const group of plan.recordGroups) {
        const ids = group.rows.map((r) => r.id);
        expect(new Set(ids).size).toBe(ids.length);
      }
    }
  });
});

describe('runMigration', () => {
  it('shapes every record with recordType, timestamps, and a live (non-deleted) soft-delete state', async () => {
    const db = fakeDb();
    await runMigration({ db, auth: fakeAuth(), now: '2026-08-09T00:00:00.000Z' });

    const expenseRecord = db.store.get('years/115/modules/budget/records/expense-0');
    expect(expenseRecord).toMatchObject({
      recordType: 'expense', createdAt: '2026-08-09T00:00:00.000Z', updatedAt: '2026-08-09T00:00:00.000Z', deletedAt: null, deletedBy: null,
    });
  });

  it('is idempotent: a second run creates nothing new', async () => {
    const db = fakeDb();
    const first = await runMigration({ db, auth: fakeAuth() });
    expect(first.report.created.length).toBeGreaterThan(0);

    const sizeAfterFirst = db.store.size;
    const second = await runMigration({ db, auth: fakeAuth() });

    expect(second.report.created).toHaveLength(0);
    expect(second.report.skipped.length).toBe(first.report.created.length);
    expect(db.store.size).toBe(sizeAfterFirst);
  });

  it('dry-run reports what it would do but writes nothing at all', async () => {
    const db = fakeDb();
    const { report } = await runMigration({ db, auth: fakeAuth(), dryRun: true });

    expect(report.created.length).toBeGreaterThan(0);
    expect(db.store.size).toBe(0);
  });

  it('never overwrites a document a real user has since edited, even if its content differs from the seed default', async () => {
    const db = fakeDb({
      'years/115/modules/budgetbook': { fundName: '使用者已更新的基金名稱', reviewAuthority: '使用者已更新' },
    });
    await runMigration({ db, auth: fakeAuth() });

    expect(db.store.get('years/115/modules/budgetbook')).toEqual({
      fundName: '使用者已更新的基金名稱', reviewAuthority: '使用者已更新',
    });
  });
});

describe('ensureAdminProfile', () => {
  it('resolves an existing Auth user by email and writes an active admin profile', async () => {
    const db = fakeDb();
    const auth = fakeAuth({ 'mihsia@gmail.com': 'existing-uid' });
    const report = { created: [], skipped: [] };

    const uid = await ensureAdminProfile(db, auth, 'mihsia@gmail.com', { dryRun: false, now: 't', report });

    expect(uid).toBe('existing-uid');
    expect(db.store.get('users/existing-uid')).toMatchObject({ role: 'admin', status: 'active', email: 'mihsia@gmail.com' });
  });

  it('creates the Auth user when none exists yet', async () => {
    const db = fakeDb();
    const auth = fakeAuth();
    const report = { created: [], skipped: [] };

    const uid = await ensureAdminProfile(db, auth, 'new-admin@example.test', { dryRun: false, now: 't', report });

    expect(auth.created).toEqual(['new-admin@example.test']);
    expect(db.store.get(`users/${uid}`).status).toBe('active');
  });

  it('does not touch Auth or Firestore at all under dry-run when no user exists yet', async () => {
    const db = fakeDb();
    const auth = fakeAuth();
    const report = { created: [], skipped: [] };

    const uid = await ensureAdminProfile(db, auth, 'ghost@example.test', { dryRun: true, now: 't', report });

    expect(uid).toBeNull();
    expect(auth.created).toEqual([]);
    expect(db.store.size).toBe(0);
  });

  it('does not downgrade or touch an existing admin profile', async () => {
    const db = fakeDb({ 'users/existing-uid': { role: 'admin', status: 'disabled', modules: [] } });
    const auth = fakeAuth({ 'mihsia@gmail.com': 'existing-uid' });
    const report = { created: [], skipped: [] };

    await ensureAdminProfile(db, auth, 'mihsia@gmail.com', { dryRun: false, now: 't', report });

    expect(db.store.get('users/existing-uid').status).toBe('disabled');
  });
});
