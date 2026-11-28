// Emulator-backed allow/deny matrix for firestore.rules.
// 權限來源已遷移至校級帳號中心（ltps-accounts）同步寫入的 Firebase Auth Custom Claims。
import { readFileSync } from 'node:fs';
import { doc, writeBatch } from 'firebase/firestore';
import {
  assertFails, assertSucceeds, initializeTestEnvironment,
} from '@firebase/rules-unit-testing';
import {
  afterAll, afterEach, beforeAll, beforeEach, describe, expect, it,
} from 'vitest';

const PROJECT_ID = 'rules-test-ltps-finance-budget';

let testEnv;

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: {
      rules: readFileSync('firestore.rules', 'utf8'),
      host: '127.0.0.1',
      port: 8080,
    },
  });
});

afterEach(async () => {
  await testEnv.clearFirestore();
});

afterAll(async () => {
  await testEnv.cleanup();
});

function asSuperAdmin() {
  return testEnv.authenticatedContext('super-1', { g: 1, sa: 1, v: 1, apps: {} }).firestore();
}
function asAdmin() {
  return testEnv.authenticatedContext('admin-1', {
    g: 1, sa: 0, v: 1, apps: { finance: { r: 'a' } },
  }).firestore();
}
function asEditor() {
  return testEnv.authenticatedContext('editor-1', {
    g: 1, sa: 0, v: 1, apps: { finance: { r: 'e', m: ['bg'] } },
  }).firestore();
}
function asDisabledAdmin() {
  return testEnv.authenticatedContext('disabled-admin', {
    g: 0, sa: 0, v: 2, apps: {},
  }).firestore();
}
function asBoardViewer() {
  return testEnv.authenticatedContext('board-viewer-1', {
    g: 1, sa: 0, v: 1, apps: { board: { r: 'v' } },
  }).firestore();
}
function asDisabledBoardViewer() {
  return testEnv.authenticatedContext('board-viewer-off', {
    g: 0, sa: 0, v: 2, apps: { board: { r: 'v' } },
  }).firestore();
}
function asAnon() {
  return testEnv.unauthenticatedContext().firestore();
}

async function seedYears() {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await db.collection('users').doc('admin-1').set({ name: '舊資料封存' });
    await db.collection('users').doc('editor-1').set({ name: '舊資料封存' });
    await db.collection('years').doc('115').set({ locked: false, deadlines: {} });
    await db.collection('years').doc('114').set({ locked: true, deadlines: {} });
    await db.collection('years').doc('113').set({ deadlines: {} });
    await db.collection('principalBoard').doc('students').set({ school: { t: 247 } });
  });
}

describe('legacy users/{uid} (archived read-only)', () => {
  beforeEach(seedYears);

  it('allows self or active admin to read archived legacy user docs, but denies all client writes', async () => {
    await assertSucceeds(asEditor().collection('users').doc('editor-1').get());
    await assertSucceeds(asAdmin().collection('users').doc('editor-1').get());
    await assertSucceeds(asSuperAdmin().collection('users').doc('editor-1').get());
    await assertFails(asEditor().collection('users').doc('admin-1').get());
    await assertFails(asAnon().collection('users').doc('admin-1').get());

    await assertFails(asAdmin().collection('users').doc('editor-1').set({ role: 'admin' }, { merge: true }));
    await assertFails(asSuperAdmin().collection('users').doc('editor-1').set({ role: 'admin' }, { merge: true }));
  });
});

describe('years/{year} and modules/{moduleKey}', () => {
  beforeEach(seedYears);

  it('lets anyone read year metadata and module docs, signed in or not', async () => {
    await assertSucceeds(asAnon().collection('years').doc('115').get());
    await assertSucceeds(asAnon().doc('years/115/modules/budgetbook').get());
  });

  it('lets an editor write their assigned module (short code bg -> budget) in an unlocked year', async () => {
    await assertSucceeds(
      asEditor().doc('years/115/modules/budget').set({ fundName: 'x', updatedAt: new Date().toISOString() }),
    );
  });

  it('denies an editor writing a module outside their assigned scope', async () => {
    await assertFails(asEditor().doc('years/115/modules/library').set({ generalBooks: 1 }));
  });

  it('lets a super admin manage years and any module when unlocked', async () => {
    await assertSucceeds(asSuperAdmin().doc('years/115/modules/library').set({ generalBooks: 10 }));
    await assertSucceeds(asSuperAdmin().collection('years').doc('116').set({ locked: false, deadlines: {} }));
  });

  it('denies any module write once the year is locked', async () => {
    await assertFails(asEditor().doc('years/114/modules/budget').set({ fundName: 'x' }));
    await assertFails(asAdmin().doc('years/114/modules/budget').set({ fundName: 'x' }));
    await assertFails(asSuperAdmin().doc('years/114/modules/budget').set({ fundName: 'x' }));
  });

  it('treats a year with no `locked` field as locked, not unlocked', async () => {
    await assertFails(asAdmin().doc('years/113/modules/budget').set({ fundName: 'x' }));
  });

  it('denies a disabled admin from writing year metadata', async () => {
    await assertFails(asDisabledAdmin().collection('years').doc('115').set({ locked: true }, { merge: true }));
  });

  it('lets createNextYear create the new unlocked year doc, then copy module docs in a second batch', async () => {
    const db = asAdmin();
    const yearBatch = writeBatch(db);
    yearBatch.set(doc(db, 'years', '116'), { locked: false, deadlines: {} });
    yearBatch.set(doc(db, 'years', '115'), { locked: true }, { merge: true });
    await assertSucceeds(yearBatch.commit());

    const moduleBatch = writeBatch(db);
    moduleBatch.set(doc(db, 'years', '116', 'modules', 'budget'), { fundName: 'x' });
    await assertSucceeds(moduleBatch.commit());
  });
});

describe('years/{year}/modules/{moduleKey}/records/{recordId}', () => {
  beforeEach(seedYears);

  const recordPath = 'years/115/modules/budget/records/rec-1';

  it('lets anyone read records without signing in', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await ctx.firestore().doc(recordPath).set({ recordType: 'expense', amount: 100 });
    });
    await assertSucceeds(asAnon().doc(recordPath).get());
  });

  it('lets the assigned editor create and update a record in an unlocked year', async () => {
    await assertSucceeds(asEditor().doc(recordPath).set({ recordType: 'expense', amount: 100 }));
    await assertSucceeds(asEditor().doc(recordPath).set({ recordType: 'expense', amount: 200 }, { merge: true }));
  });

  it('denies changing recordType through an ordinary update', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await ctx.firestore().doc(recordPath).set({ recordType: 'expense', amount: 100 });
    });
    await assertFails(asEditor().doc(recordPath).set({ recordType: 'revenue' }, { merge: true }));
  });

  it('lets an admin hard-delete a record in an unlocked year, denies editor and locked years', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await ctx.firestore().doc(recordPath).set({ recordType: 'expense', amount: 100 });
      await ctx.firestore().doc('years/114/modules/budget/records/rec-2').set({ recordType: 'expense', amount: 100 });
    });
    await assertFails(asEditor().doc(recordPath).delete());
    await assertSucceeds(asAdmin().doc(recordPath).delete());
    await assertFails(asAdmin().doc('years/114/modules/budget/records/rec-2').delete());
  });
});

describe('years/{year}/auditLogs, files, exports & missing claims', () => {
  beforeEach(seedYears);

  it('enforces append-only self-attributed auditLogs', async () => {
    await assertSucceeds(asEditor().collection('years/115/auditLogs').add({
      moduleKey: 'budget', recordId: null, action: 'update', actorUid: 'editor-1',
    }));
    await assertFails(asEditor().collection('years/115/auditLogs').add({
      moduleKey: 'budget', recordId: null, action: 'update', actorUid: 'admin-1',
    }));
    await assertFails(asDisabledAdmin().collection('years/115/auditLogs').add({
      moduleKey: 'budget', recordId: null, action: 'update', actorUid: 'disabled-admin',
    }));
  });

  it('lets active users log exports and denies disabled or claimless users', async () => {
    await assertSucceeds(asEditor().collection('years/115/exports').add({ name: 'x.xlsx' }));
    await assertFails(asDisabledAdmin().collection('years/115/exports').add({ name: 'x.xlsx' }));
    const ghost = testEnv.authenticatedContext('no-claims-uid').firestore();
    await assertFails(ghost.doc('years/115/modules/budget').set({ fundName: 'x' }));
    await expect(ghost.collection('years').doc('115').set({ locked: true }, { merge: true })).rejects.toBeTruthy();
  });
});

describe('principalBoard/{docId}', () => {
  beforeEach(seedYears);

  it('lets super admin, finance admin, and board viewer read the board', async () => {
    await assertSucceeds(asSuperAdmin().doc('principalBoard/students').get());
    await assertSucceeds(asAdmin().doc('principalBoard/students').get());
    await assertSucceeds(asBoardViewer().doc('principalBoard/students').get());
  });

  it('denies finance-only editor, disabled board viewer, and anonymous reads', async () => {
    await assertFails(asEditor().doc('principalBoard/students').get());
    await assertFails(asDisabledBoardViewer().doc('principalBoard/students').get());
    await assertFails(asAnon().doc('principalBoard/students').get());
  });

  it('denies every client write, even from a super admin', async () => {
    await assertFails(asSuperAdmin().doc('principalBoard/students').set({ school: { t: 1 } }));
    await assertFails(asAdmin().doc('principalBoard/students').delete());
  });
});
