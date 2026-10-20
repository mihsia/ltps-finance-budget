import { describe, expect, it } from 'vitest';
import { migrateInquiryFields } from './migrateInquiryFields.cjs';

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

describe('migrateInquiryFields', () => {
  it('splits a full-width "議員：題目" subject into councilor and subject, and backfills a null answer', async () => {
    const db = fakeDb({
      'years/115/modules/inquiry/records/r1': {
        recordType: 'inquiry', date: '2025-11-08', subject: '王議員：代理教師人力', status: '已答詢',
      },
    });

    const report = await migrateInquiryFields({ db, years: ['115'] });

    expect(report.moved).toEqual(['years/115/modules/inquiry/records/r1']);
    expect(report.needsReview).toEqual([]);
    expect(db.store.get('years/115/modules/inquiry/records/r1')).toEqual({
      recordType: 'inquiry', date: '2025-11-08', councilor: '王議員', subject: '代理教師人力', answer: null, status: '已答詢',
    });
  });

  it('also splits on a half-width colon', async () => {
    const db = fakeDb({
      'years/115/modules/inquiry/records/r1': { recordType: 'inquiry', date: '2025-11-08', subject: '李議員:圖書館藏書更新', status: '待答詢' },
    });
    const report = await migrateInquiryFields({ db, years: ['115'] });
    expect(report.moved).toEqual(['years/115/modules/inquiry/records/r1']);
    expect(db.store.get('years/115/modules/inquiry/records/r1').councilor).toBe('李議員');
    expect(db.store.get('years/115/modules/inquiry/records/r1').subject).toBe('圖書館藏書更新');
  });

  it('leaves 議員 blank and reports needsReview when the old subject has no colon to split on', async () => {
    const db = fakeDb({
      'years/115/modules/inquiry/records/r1': { recordType: 'inquiry', date: '2025-11-08', subject: '代理教師人力（無議員標記）', status: '已答詢' },
    });

    const report = await migrateInquiryFields({ db, years: ['115'] });

    expect(report.moved).toEqual([]);
    expect(report.needsReview).toEqual(['years/115/modules/inquiry/records/r1']);
    expect(db.store.get('years/115/modules/inquiry/records/r1')).toMatchObject({
      councilor: '', subject: '代理教師人力（無議員標記）', answer: null,
    });
  });

  it('preserves an existing answer instead of overwriting it with null', async () => {
    const db = fakeDb({
      'years/115/modules/inquiry/records/r1': {
        recordType: 'inquiry', date: '2025-11-08', subject: '王議員：代理教師人力', answer: '已完成', status: '已答詢',
      },
    });
    await migrateInquiryFields({ db, years: ['115'] });
    expect(db.store.get('years/115/modules/inquiry/records/r1').answer).toBe('已完成');
  });

  it('is a dry-run-safe, idempotent no-op once every record already has a councilor field', async () => {
    const db = fakeDb({
      'years/115/modules/inquiry/records/r1': { recordType: 'inquiry', date: '2025-11-08', subject: '王議員：代理教師人力', status: '已答詢' },
    });

    const dryRunReport = await migrateInquiryFields({ db, years: ['115'], dryRun: true });
    expect(dryRunReport.moved).toEqual(['years/115/modules/inquiry/records/r1']);
    expect(db.store.get('years/115/modules/inquiry/records/r1').councilor).toBeUndefined();

    const firstRun = await migrateInquiryFields({ db, years: ['115'] });
    expect(firstRun.moved).toEqual(['years/115/modules/inquiry/records/r1']);

    const secondRun = await migrateInquiryFields({ db, years: ['115'] });
    expect(secondRun.moved).toEqual([]);
    expect(secondRun.needsReview).toEqual([]);
    expect(secondRun.skipped).toEqual(['years/115/modules/inquiry/records/r1']);
  });

  it('never touches a record whose councilor field is already an empty string (deliberately left blank by an admin)', async () => {
    const db = fakeDb({
      'years/115/modules/inquiry/records/r1': {
        recordType: 'inquiry', date: '2025-11-08', councilor: '', subject: '代理教師人力', answer: null, status: '已答詢',
      },
    });
    const report = await migrateInquiryFields({ db, years: ['115'] });
    expect(report.skipped).toEqual(['years/115/modules/inquiry/records/r1']);
  });
});
