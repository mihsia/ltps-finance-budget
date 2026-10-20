import { describe, expect, it } from 'vitest';
import { migrateLanguageCertification } from './migrateLanguageCertification.cjs';

function fakeDb(initial = {}) {
  const store = new Map(Object.entries(initial));
  const makeRef = (path) => ({
    path,
    async get() {
      return { exists: store.has(path), data: () => store.get(path) };
    },
    async set(data) {
      store.set(path, data);
    },
    async delete() {
      store.delete(path);
    },
  });
  return {
    store,
    doc(path) {
      return makeRef(path);
    },
    collection(prefix) {
      return {
        async get() {
          const docs = [...store.entries()]
            .filter(([path]) => path.startsWith(`${prefix}/`) && !path.slice(prefix.length + 1).includes('/'))
            .map(([path, data]) => ({
              id: path.slice(prefix.length + 1),
              data: () => data,
              ref: makeRef(path),
            }));
          return { docs };
        },
      };
    },
  };
}

describe('migrateLanguageCertification', () => {
  it('moves certification and roster rows to languageCert, leaving class rows under language', async () => {
    const db = fakeDb({
      'years/115/modules/language/records/class-0': { recordType: 'class', lang: '閩南語', classes: 13, students: 264 },
      'years/115/modules/language/records/cert-0': { recordType: 'certification', lang: '閩南語', certifiedTeachers: 2, totalTeachers: 2, tested: 264, passed: 138 },
      'years/115/modules/language/records/roster-0': { recordType: 'roster', lang: '閩南語', level: '初級', name: '陳○安' },
    });

    const report = await migrateLanguageCertification({ db, years: ['115'] });

    expect(report.moved).toEqual([
      'years/115/modules/languageCert/records/cert-0',
      'years/115/modules/languageCert/records/roster-0',
    ]);
    expect(db.store.has('years/115/modules/language/records/class-0')).toBe(true);
    expect(db.store.has('years/115/modules/language/records/cert-0')).toBe(false);
    expect(db.store.get('years/115/modules/languageCert/records/cert-0')).toEqual({
      recordType: 'certification', lang: '閩南語', certifiedTeachers: 2, totalTeachers: 2, tested: 264, passed: 138,
    });
  });

  it('is a dry-run-safe, idempotent no-op once nothing is left to move', async () => {
    const db = fakeDb({
      'years/115/modules/language/records/cert-0': { recordType: 'certification', lang: '客語', certifiedTeachers: 1, totalTeachers: 1, tested: 4, passed: 2 },
    });

    const dryRunReport = await migrateLanguageCertification({ db, years: ['115'], dryRun: true });
    expect(dryRunReport.moved).toEqual(['years/115/modules/languageCert/records/cert-0']);
    expect(db.store.has('years/115/modules/language/records/cert-0')).toBe(true);
    expect(db.store.has('years/115/modules/languageCert/records/cert-0')).toBe(false);

    const firstRun = await migrateLanguageCertification({ db, years: ['115'] });
    expect(firstRun.moved).toEqual(['years/115/modules/languageCert/records/cert-0']);

    const secondRun = await migrateLanguageCertification({ db, years: ['115'] });
    expect(secondRun.moved).toEqual([]);
    expect(secondRun.skipped).toEqual([]);
  });

  it('never moves a destination row that already exists', async () => {
    const db = fakeDb({
      'years/115/modules/language/records/roster-0': { recordType: 'roster', lang: '泰雅語', level: '中級', name: '林○恩' },
      'years/115/modules/languageCert/records/roster-0': { recordType: 'roster', lang: '泰雅語', level: '高級', name: '已手動輸入的資料' },
    });

    const report = await migrateLanguageCertification({ db, years: ['115'] });

    expect(report.moved).toEqual([]);
    expect(report.skipped).toEqual(['years/115/modules/languageCert/records/roster-0']);
    expect(db.store.get('years/115/modules/languageCert/records/roster-0').name).toBe('已手動輸入的資料');
    expect(db.store.has('years/115/modules/language/records/roster-0')).toBe(true);
  });
});
