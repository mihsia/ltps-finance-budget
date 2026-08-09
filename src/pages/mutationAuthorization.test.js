import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

async function pageSource(page) {
  return readFile(new URL(`./${page}.jsx`, import.meta.url), 'utf8');
}

describe('page mutation authorization audit', () => {
  it.each([
    ['Basic', 'authorizeModule', 2],
    ['Library', 'authorizeModule', 2],
    ['Settings', 'authorizeAdmin', 1],
    ['Archive', 'authorizeAdmin', 2],
  ])('%s rechecks current access in each existing write handler', async (page, authorizeName, minimumChecks) => {
    const source = await pageSource(page);

    expect(source).toContain("import { runAuthorized } from '../lib/accessPolicy';");
    expect(source.match(new RegExp(`runAuthorized\\(\\s*\\(\\) => ${authorizeName}`, 'g'))?.length || 0)
      .toBeGreaterThanOrEqual(minimumChecks);
  });

  it.each(['Budget', 'Language', 'Generic'])(
    '%s delegates every record control and mutation to the invocation-current guard',
    async (page) => {
      const source = await pageSource(page);
      const guardSource = await readFile(
        new URL('../hooks/useRecordCrudActions.js', import.meta.url),
        'utf8',
      );

      expect(source).toContain("import { useRecordCrudActions } from '../hooks/useRecordCrudActions';");
      expect(source).toContain('actions.runControl(');
      expect(source).toContain('actions.runMutation(');
      expect(guardSource).toContain('runAuthorized(() => authorizeModule(moduleKey)');
      expect(guardSource).toContain('runAuthorized(() => authorizeModuleActor(moduleKey)');
    },
  );
});
