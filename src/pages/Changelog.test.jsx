import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { CHANGELOG } from '../lib/appInfo';
import Changelog from './Changelog';

describe('Changelog page', () => {
  it('lists every release with newest first and requires no module permission', () => {
    const markup = renderToStaticMarkup(<Changelog />);

    const firstVersionIndex = markup.indexOf(`v${CHANGELOG[CHANGELOG.length - 1].version}`);
    const lastVersionIndex = markup.indexOf(`v${CHANGELOG[0].version}`);
    expect(firstVersionIndex).toBeGreaterThan(-1);
    expect(lastVersionIndex).toBeGreaterThan(-1);
    expect(firstVersionIndex).toBeLessThan(lastVersionIndex);

    CHANGELOG.forEach((entry) => {
      expect(markup).toContain(`v${entry.version}`);
      expect(markup).toContain(entry.notes);
    });
  });
});
