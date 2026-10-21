import { describe, expect, it } from 'vitest';
import { DEADLINE_MODULE_KEYS, moduleMetaByKey, navGroups } from './nav.js';

describe('DEADLINE_MODULE_KEYS', () => {
  it('includes every data-entry module and excludes the report/management/always-open pages', () => {
    expect(DEADLINE_MODULE_KEYS).toEqual(expect.arrayContaining([
      'basic', 'specialNeeds', 'library', 'language', 'languageCert',
      'club', 'careSupport', 'awards', 'budget', 'land', 'inquiry', 'budgetbook',
    ]));
    for (const key of ['dashboard', 'report', 'archive', 'settings', 'manual', 'changelog']) {
      expect(DEADLINE_MODULE_KEYS).not.toContain(key);
    }
  });

  it('stays in sync with navGroups so a newly added data module is picked up automatically', () => {
    const allKeys = navGroups.flatMap((g) => g.items).map((it) => it.key);
    const expected = allKeys.filter((key) => (
      !['dashboard', 'report', 'archive', 'settings', 'manual', 'changelog'].includes(key)
    ));
    expect(DEADLINE_MODULE_KEYS).toEqual(expected);
  });
});

describe('moduleMetaByKey', () => {
  it('maps every nav item key to its own {key, label, color} entry', () => {
    expect(moduleMetaByKey.basic).toMatchObject({ key: 'basic', label: '基本資料', color: '#C9832F' });
    expect(moduleMetaByKey.careSupport).toMatchObject({ key: 'careSupport', label: '課照學扶' });
  });
});
