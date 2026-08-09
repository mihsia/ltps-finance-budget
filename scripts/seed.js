#!/usr/bin/env node
/**
 * One-time seed script for a freshly created Firebase project.
 *
 * Usage:
 *   1. Download a service-account key from Firebase Console > Project settings
 *      > Service accounts > Generate new private key, save as
 *      scripts/serviceAccountKey.json (gitignored).
 *   2. npm run seed
 *
 * Seeds /years/113–115 with the school's real 115年度預算書 figures (see
 * README "Data Notes"). Everything under 圖書/族語/獎項/社團/土地現值/質詢答詢 and
 * staff counts is illustrative placeholder data and MUST be replaced with the
 * school's real figures (via the app's own forms) before this system is used
 * for an actual council submission.
 */
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { getNamedFirestore } from '../functions/firestore.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const keyPath = path.join(__dirname, 'serviceAccountKey.json');
if (!fs.existsSync(keyPath)) {
  console.error('Missing scripts/serviceAccountKey.json — see the usage comment at the top of this file.');
  process.exit(1);
}

const serviceAccount = JSON.parse(fs.readFileSync(keyPath, 'utf8'));
initializeApp({ credential: cert(serviceAccount) });
const db = getNamedFirestore(getFirestore);
const auth = getAuth();

const EXPENSE_BREAKDOWN = [
  { label: '國民教育計畫', formula: '辦理校務行政、教學活動及各項專案計畫等', amount: 6157 },
  { label: '一般行政管理計畫', formula: '教職員工人事費、歷年退休金及遺屬年金業務等', amount: 48141 },
  { label: '建築及設備計畫', formula: '改善並充實學校教學及行政環境、購置設備等', amount: 60 },
];
const REVENUE_ROWS = [
  { label: '財產處分收入（財產報廢變賣）', amount: 1 },
  { label: '租金收入（場地使用及水電清潔費等）', amount: 40 },
  { label: '利息收入', amount: 2 },
  { label: '政府撥入收入（公庫撥款）', amount: 53599 },
];
const EXPENSE_TOTAL_BY_YEAR = { '113': 56463, '114': 55101, '115': 54358 };

// Firestore rejects an array nested directly inside another array, so each
// generic-module row is wrapped in a { cells: [...] } object.
const toRows = (arrays) => arrays.map((cells) => ({ cells }));

async function seedYear(year, { withFullBudget }) {
  await db.doc(`years/${year}`).set({ locked: year !== '115', deadlines: year === '115' ? { basic: '2026-08-15' } : {} }, { merge: true });

  if (withFullBudget) {
    await db.doc(`years/${year}/modules/budget`).set({
      expense: { breakdown: EXPENSE_BREAKDOWN },
      revenue: { rows: REVENUE_ROWS },
    }, { merge: true });
  } else {
    const total = EXPENSE_TOTAL_BY_YEAR[year];
    await db.doc(`years/${year}/modules/budget`).set({
      expense: { breakdown: [{ label: '（歷史年度僅存總額，未逐項留存）', formula: '', amount: total }] },
      revenue: { rows: [] },
    }, { merge: true });
  }

  await db.doc(`years/${year}/modules/budgetbook`).set({
    fundName: '利澤國小校務基金',
    reviewAuthority: '宜蘭縣議會',
  }, { merge: true });

  if (year === '115') {
    await db.doc('years/115/modules/basic').set({
      classes: '13', students: '262', staff: '28', regularTeachers: '19', substitute: '9', partTimeTeachers: '2',
      status: 'submitted',
    }, { merge: true });

    await db.doc('years/115/modules/library').set({ generalBooks: 17296, indigenousBooks: 36 }, { merge: true });

    await db.doc('years/115/modules/language').set({
      classes: [
        { lang: '閩南語', classes: 13, students: 264 },
        { lang: '客語', classes: 1, students: 4 },
        { lang: '賽考利克泰雅語', classes: 3, students: 10 },
        { lang: '太魯閣語', classes: 1, students: 2 },
      ],
      cert: [
        { lang: '閩南語', certifiedTeachers: 2, totalTeachers: 2, tested: 264, passed: 138 },
        { lang: '客語', certifiedTeachers: 1, totalTeachers: 1, tested: 4, passed: 2 },
        { lang: '賽考利克泰雅語', certifiedTeachers: 1, totalTeachers: 1, tested: 10, passed: 2 },
        { lang: '太魯閣語', certifiedTeachers: 0, totalTeachers: 1, tested: 2, passed: 0 },
      ],
      certRecords: [
        { id: 1, lang: '閩南語', level: 'A級（初級）', name: '陳○安' },
        { id: 2, lang: '賽考利克泰雅語', level: 'B級（中級）', name: '林○恩' },
      ],
    }, { merge: true });

    await db.doc('years/115/modules/awards').set({
      rows: toRows([
        ['全國語文競賽 朗讀組', '特優', '2025-10-12'],
        ['宜蘭縣科展', '優等', '2025-09-20'],
        ['全縣運動會 大隊接力', '第二名', '2025-05-15'],
      ]),
    }, { merge: true });

    await db.doc('years/115/modules/club').set({
      rows: toRows([
        ['桌球社', '陳老師', '18', '週二 16:00'],
        ['直笛隊', '林老師', '24', '週三 16:00'],
        ['科學實驗社', '黃老師', '15', '週四 16:00'],
      ]),
    }, { merge: true });

    await db.doc('years/115/modules/land').set({
      rows: toRows([
        ['五結段123地號', '8,450', '12,800'],
        ['五結段124地號', '2,100', '12,800'],
      ]),
    }, { merge: true });

    await db.doc('years/115/modules/inquiry').set({
      rows: toRows([
        ['2025-11-08', '王議員：代理教師人力', '已答詢'],
        ['2025-11-08', '李議員：圖書館藏書更新', '已答詢'],
        ['2026-05-20', '陳議員：課後社團經費', '待答詢'],
      ]),
    }, { merge: true });
  }
}

async function seedAdmin() {
  const email = process.env.SEED_ADMIN_EMAIL;
  if (!email) {
    console.log('Set SEED_ADMIN_EMAIL=you@school.edu.tw to also create an initial admin account.');
    return;
  }
  let user;
  try {
    user = await auth.getUserByEmail(email);
  } catch {
    user = await auth.createUser({ email, password: Math.random().toString(36).slice(-10) + 'A1!' });
    console.log(`Created auth user ${email} — send them a password reset link to set their password.`);
  }
  await db.doc(`users/${user.uid}`).set({ name: '管理者', email, dept: '校長室', role: 'admin', modules: [] }, { merge: true });
  console.log(`Admin profile ready for ${email}`);
}

(async () => {
  await seedYear('113', { withFullBudget: false });
  await seedYear('114', { withFullBudget: false });
  await seedYear('115', { withFullBudget: true });
  await seedAdmin();
  console.log('Seed complete.');
  process.exit(0);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
