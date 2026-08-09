import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

async function pageSource(page) {
  return readFile(new URL(`./${page}.jsx`, import.meta.url), 'utf8');
}

describe('page mutation authorization audit', () => {
  it.each([
    ['Basic', 'authorizeModule', 2],
    ['Budget', 'authorizeModule', 1],
    ['Library', 'authorizeModule', 2],
    ['Language', 'authorizeModule', 3],
    ['Generic', 'authorizeModule', 3],
    ['Settings', 'authorizeAdmin', 1],
    ['Archive', 'authorizeAdmin', 2],
  ])('%s rechecks current access in each existing write handler', async (page, authorizeName, minimumChecks) => {
    const source = await pageSource(page);

    expect(source).toContain("import { runAuthorized } from '../lib/accessPolicy';");
    expect(source.match(new RegExp(`runAuthorized\\(\\s*\\(\\) => ${authorizeName}`, 'g'))?.length || 0)
      .toBeGreaterThanOrEqual(minimumChecks);
  });
});
