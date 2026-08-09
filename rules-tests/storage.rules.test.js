// Emulator-backed allow/deny matrix for storage.rules. See
// firestore.rules.test.js for why this lives outside the default `npm test`
// glob (needs the live Storage emulator, not mocks).
import { readFileSync } from 'node:fs';
import { ref, uploadString, getBytes } from 'firebase/storage';
import {
  assertFails, assertSucceeds, initializeTestEnvironment,
} from '@firebase/rules-unit-testing';
import {
  afterAll, afterEach, beforeAll, describe, it,
} from 'vitest';

const PROJECT_ID = 'rules-test-ltps-finance-budget-storage';

let testEnv;

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    storage: {
      rules: readFileSync('storage.rules', 'utf8'),
      host: '127.0.0.1',
      port: 9199,
    },
  });
});

afterEach(async () => {
  await testEnv.clearStorage();
});

afterAll(async () => {
  await testEnv.cleanup();
});

describe('budget-books/{year}/{fileName}', () => {
  it('is publicly readable, even signed out', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await uploadString(ref(ctx.storage(), 'budget-books/115/budget.pdf'), 'pdf-bytes');
    });
    const anon = testEnv.unauthenticatedContext().storage();
    await assertSucceeds(getBytes(ref(anon, 'budget-books/115/budget.pdf')));
  });

  it('denies a direct client write, even from a signed-in user', async () => {
    const editor = testEnv.authenticatedContext('editor-1').storage();
    await assertFails(uploadString(ref(editor, 'budget-books/115/budget.pdf'), 'pdf-bytes'));
  });
});

describe('exports/{year}/{fileName}', () => {
  it('denies a signed-out read or write', async () => {
    const anon = testEnv.unauthenticatedContext().storage();
    await assertFails(uploadString(ref(anon, 'exports/115/report.xlsx'), 'x'));
    await assertFails(getBytes(ref(anon, 'exports/115/report.xlsx')));
  });

  it('allows a signed-in user to write and read', async () => {
    const editor = testEnv.authenticatedContext('editor-1').storage();
    await assertSucceeds(uploadString(ref(editor, 'exports/115/report.xlsx'), 'x'));
    await assertSucceeds(getBytes(ref(editor, 'exports/115/report.xlsx')));
  });
});
