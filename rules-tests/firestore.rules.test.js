// Emulator-backed allow/deny matrix for firestore.rules. Requires the
// Firestore emulator running locally (`npm run emulators`, or this file is
// run under `firebase emulators:exec` via `npm run test:rules`) — kept out of
// the default `npm test` glob because it needs that live emulator instead of
// the mocks the rest of the suite uses.
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

function asAdmin() {
  return testEnv.authenticatedContext('admin-1').firestore();
}
function asEditor() {
  return testEnv.authenticatedContext('editor-1').firestore();
}
function asDisabledAdmin() {
  return testEnv.authenticatedContext('disabled-admin').firestore();
}
function asAnon() {
  return testEnv.unauthenticatedContext().firestore();
}

async function seedProfiles() {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await db.collection('users').doc('admin-1').set({
      name: '管理員', email: 'admin@example.test', dept: '校長室', role: 'admin', status: 'active', modules: [],
    });
    await db.collection('users').doc('editor-1').set({
      name: '填報人員', email: 'editor@example.test', dept: '總務處', role: 'editor', status: 'active', modules: ['budget'],
    });
    await db.collection('users').doc('disabled-admin').set({
      name: '停用管理員', email: 'off@example.test', dept: '校長室', role: 'admin', status: 'disabled', modules: [],
    });
    await db.collection('years').doc('115').set({ locked: false, deadlines: {} });
    await db.collection('years').doc('114').set({ locked: true, deadlines: {} });
    await db.collection('years').doc('113').set({ deadlines: {} }); // no `locked` field at all
  });
}

describe('users/{uid}', () => {
  beforeEach(seedProfiles);

  it('lets any signed-in user read profiles, including their own disabled one', async () => {
    await assertSucceeds(asEditor().collection('users').doc('admin-1').get());
    await assertSucceeds(asDisabledAdmin().collection('users').doc('disabled-admin').get());
  });

  it('denies anonymous reads', async () => {
    await assertFails(asAnon().collection('users').doc('admin-1').get());
  });

  it('lets only an active admin write a profile', async () => {
    await assertSucceeds(asAdmin().collection('users').doc('editor-1').set({
      name: '填報人員', email: 'editor@example.test', dept: '總務處', role: 'editor', status: 'active', modules: ['budget', 'library'],
    }));
    await assertFails(asEditor().collection('users').doc('editor-1').set({ name: '改名' }, { merge: true }));
  });

  it('denies writes from an admin whose own status is disabled', async () => {
    await assertFails(asDisabledAdmin().collection('users').doc('editor-1').set({ role: 'admin' }, { merge: true }));
  });
});

describe('years/{year} and modules/{moduleKey}', () => {
  beforeEach(seedProfiles);

  it('lets anyone read year metadata and module docs, signed in or not', async () => {
    await assertSucceeds(asAnon().collection('years').doc('115').get());
    await assertSucceeds(asAnon().doc('years/115/modules/budgetbook').get());
  });

  it('lets an editor write their assigned module in an unlocked year', async () => {
    await assertSucceeds(
      asEditor().doc('years/115/modules/budget').set({ fundName: 'x', updatedAt: new Date().toISOString() }),
    );
  });

  it('denies an editor writing a module outside their assigned scope', async () => {
    await assertFails(asEditor().doc('years/115/modules/library').set({ generalBooks: 1 }));
  });

  it('denies any module write once the year is locked', async () => {
    await assertFails(asEditor().doc('years/114/modules/budget').set({ fundName: 'x' }));
    await assertFails(asAdmin().doc('years/114/modules/budget').set({ fundName: 'x' }));
  });

  it('treats a year with no `locked` field as locked, not unlocked', async () => {
    await assertFails(asAdmin().doc('years/113/modules/budget').set({ fundName: 'x' }));
  });

  it('denies a disabled admin from writing year metadata', async () => {
    await assertFails(asDisabledAdmin().collection('years').doc('115').set({ locked: true }, { merge: true }));
  });

  it('lets createNextYear create the new unlocked year doc, then copy module docs in a second batch', async () => {
    // Mirrors useYearData.js's createNextYear. A single WriteBatch would NOT
    // work here: yearWritable()'s get() does not see a sibling write's
    // still-uncommitted document from the same batch, so the year doc must
    // be committed before the module copy is rule-checked.
    const db = asAdmin();
    const yearBatch = writeBatch(db);
    yearBatch.set(doc(db, 'years', '116'), { locked: false, deadlines: {} });
    yearBatch.set(doc(db, 'years', '115'), { locked: true }, { merge: true });
    await assertSucceeds(yearBatch.commit());

    const moduleBatch = writeBatch(db);
    moduleBatch.set(doc(db, 'years', '116', 'modules', 'budget'), { fundName: 'x' });
    await assertSucceeds(moduleBatch.commit());
  });

  it('rejects the module copy if it were (incorrectly) batched with the year-doc creation itself', async () => {
    // Regression guard for the bug above: proves the single-batch form
    // really does fail under these rules, so the two-batch fix stays
    // intentional rather than silently reverting.
    const db = asAdmin();
    const batch = writeBatch(db);
    batch.set(doc(db, 'years', '117'), { locked: false, deadlines: {} });
    batch.set(doc(db, 'years', '117', 'modules', 'budget'), { fundName: 'x' });
    await assertFails(batch.commit());
  });
});

describe('years/{year}/modules/{moduleKey}/records/{recordId}', () => {
  beforeEach(seedProfiles);

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

  it('never allows a hard delete, even for an admin', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await ctx.firestore().doc(recordPath).set({ recordType: 'expense', amount: 100 });
    });
    await assertFails(asAdmin().doc(recordPath).delete());
  });

  it('still allows a soft-delete update (deletedAt/deletedBy) as an ordinary write', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await ctx.firestore().doc(recordPath).set({ recordType: 'expense', amount: 100 });
    });
    await assertSucceeds(
      asEditor().doc(recordPath).set({ deletedAt: new Date().toISOString(), deletedBy: 'editor-1' }, { merge: true }),
    );
  });

  it('denies a record write once the year is locked', async () => {
    await assertFails(asAdmin().doc('years/114/modules/budget/records/rec-2').set({ recordType: 'expense', amount: 1 }));
  });
});

describe('years/{year}/auditLogs/{logId}', () => {
  beforeEach(seedProfiles);

  it('lets an active user create an audit entry attributed to themselves', async () => {
    await assertSucceeds(asEditor().collection('years/115/auditLogs').add({
      moduleKey: 'budget', recordId: null, action: 'update', actorUid: 'editor-1', actorName: '填報人員', before: null, after: null, createdAt: new Date().toISOString(),
    }));
  });

  it('denies forging another user as the actor', async () => {
    await assertFails(asEditor().collection('years/115/auditLogs').add({
      moduleKey: 'budget', recordId: null, action: 'update', actorUid: 'admin-1', actorName: '管理員', before: null, after: null, createdAt: new Date().toISOString(),
    }));
  });

  it('denies a disabled user from writing an audit entry at all', async () => {
    await assertFails(asDisabledAdmin().collection('years/115/auditLogs').add({
      moduleKey: 'budget', recordId: null, action: 'update', actorUid: 'disabled-admin', actorName: '停用管理員', before: null, after: null, createdAt: new Date().toISOString(),
    }));
  });

  it('is append-only: no update or delete, even for the original author', async () => {
    let logId;
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      const ref = await ctx.firestore().collection('years/115/auditLogs').add({ actorUid: 'editor-1', action: 'update' });
      logId = ref.id;
    });
    await assertFails(asEditor().doc(`years/115/auditLogs/${logId}`).set({ action: 'tampered' }, { merge: true }));
    await assertFails(asEditor().doc(`years/115/auditLogs/${logId}`).delete());
  });

  it('lets anyone read the audit trail without signing in (council transparency)', async () => {
    await assertSucceeds(asAnon().collection('years/115/auditLogs').get());
  });
});

describe('years/{year}/files/{fileId}', () => {
  beforeEach(seedProfiles);

  it('lets a signed-in user read file metadata but never write it directly', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await ctx.firestore().doc('years/115/files/f1').set({ fileName: 'x.pdf' });
    });
    await assertSucceeds(asEditor().doc('years/115/files/f1').get());
    await assertFails(asAdmin().doc('years/115/files/f2').set({ fileName: 'y.pdf' }));
  });

  it('denies an anonymous read', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await ctx.firestore().doc('years/115/files/f1').set({ fileName: 'x.pdf' });
    });
    await assertFails(asAnon().doc('years/115/files/f1').get());
  });
});

describe('years/{year}/exports/{exportId}', () => {
  beforeEach(seedProfiles);

  it('lets an active signed-in user log and read export history', async () => {
    await assertSucceeds(asEditor().collection('years/115/exports').add({ name: 'x.xlsx', user: '填報人員', time: new Date().toISOString() }));
    await assertSucceeds(asEditor().collection('years/115/exports').get());
  });

  it('denies a disabled user from reading or writing export history', async () => {
    await assertFails(asDisabledAdmin().collection('years/115/exports').add({ name: 'x.xlsx', user: '停用管理員' }));
    await assertFails(asDisabledAdmin().collection('years/115/exports').get());
  });

  it('is create-only: no update or delete', async () => {
    let ref;
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      ref = await ctx.firestore().collection('years/115/exports').add({ name: 'x.xlsx' });
    });
    await assertFails(asEditor().doc(`years/115/exports/${ref.id}`).set({ name: 'y.xlsx' }, { merge: true }));
    await assertFails(asEditor().doc(`years/115/exports/${ref.id}`).delete());
  });
});

describe('a request with no /users profile doc at all', () => {
  it('fails closed on every year/module write attempt', async () => {
    const ghost = testEnv.authenticatedContext('no-profile-uid').firestore();
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await ctx.firestore().collection('years').doc('115').set({ locked: false, deadlines: {} });
    });
    await assertFails(ghost.doc('years/115/modules/budget').set({ fundName: 'x' }));
    await expect(ghost.collection('years').doc('115').set({ locked: true }, { merge: true })).rejects.toBeTruthy();
  });
});
