// Pure seed/migration logic for the initial 113-115 data and the first admin
// profile. Kept free of firebase-admin app initialization (unlike seed.js)
// so it can be unit-tested with a lightweight fake db/auth — mirrors
// functions/accountAdmin.cjs and functions/pdfStorage.cjs.
//
// "Migration" here means: idempotently create the target records-subcollection
// shape directly. There is no live deployed database yet to convert an older
// array-in-module-doc shape *out of* — every write below goes through
// ensureDoc, which only ever creates a document that doesn't already exist.
// That single rule gives all three properties Task 8 asks for at once:
// dry-run-safe (ensureDoc's write is skippable), idempotent (a second run
// finds every path already existing and creates nothing), and non-destructive
// toward anything a real user has since edited through the app (their write
// makes the doc exist, so this script leaves it alone from then on).

const REAL_115_EXPENSE_BREAKDOWN = [
  { label: '國民教育計畫', formula: '辦理校務行政、教學活動及各項專案計畫等', amount: 6157 },
  { label: '一般行政管理計畫', formula: '教職員工人事費、歷年退休金及遺屬年金業務等', amount: 48141 },
  { label: '建築及設備計畫', formula: '改善並充實學校教學及行政環境、購置設備等', amount: 60 },
];
const REAL_115_REVENUE_ROWS = [
  { label: '財產處分收入（財產報廢變賣）', amount: 1 },
  { label: '租金收入（場地使用及水電清潔費等）', amount: 40 },
  { label: '利息收入', amount: 2 },
  { label: '政府撥入收入（公庫撥款）', amount: 53599 },
];
// Earlier years only have the school's real total on record, not an itemized
// breakdown — see README "已知的真實數字 vs. 佔位資料".
const REAL_EXPENSE_TOTAL_BY_YEAR = { 113: 56463, 114: 55101, 115: 54358 };

// Everything below is illustrative placeholder data (also per the README)
// and MUST be replaced with the school's real figures via the app's own
// forms before an actual council submission.
const PLACEHOLDER_LANGUAGE_CLASSES = [
  { lang: '閩南語', classes: 13, students: 264 },
  { lang: '客語', classes: 1, students: 4 },
  { lang: '賽考利克泰雅語', classes: 3, students: 10 },
  { lang: '太魯閣語', classes: 1, students: 2 },
];
const PLACEHOLDER_LANGUAGE_CERTS = [
  { lang: '閩南語', certifiedTeachers: 2, totalTeachers: 2, tested: 264, passed: 138 },
  { lang: '客語', certifiedTeachers: 1, totalTeachers: 1, tested: 4, passed: 2 },
  { lang: '賽考利克泰雅語', certifiedTeachers: 1, totalTeachers: 1, tested: 10, passed: 2 },
  { lang: '太魯閣語', certifiedTeachers: 0, totalTeachers: 1, tested: 2, passed: 0 },
];
const PLACEHOLDER_LANGUAGE_ROSTER = [
  { lang: '閩南語', level: 'A級（初級）', name: '陳○安' },
  { lang: '賽考利克泰雅語', level: 'B級（中級）', name: '林○恩' },
];
const PLACEHOLDER_AWARDS = [
  { category: '語文類', item: '全國語文競賽 朗讀組', level: '特優', date: '2025-10-12' },
  { category: '科學類', item: '宜蘭縣科展', level: '優等', date: '2025-09-20' },
  { category: '體育類', item: '全縣運動會 大隊接力', level: '第二名', date: '2025-05-15' },
];
const PLACEHOLDER_CLUBS = [
  { name: '桌球社', instructor: '陳老師', participants: 18, schedule: '週二 16:00' },
  { name: '直笛隊', instructor: '林老師', participants: 24, schedule: '週三 16:00' },
  { name: '科學實驗社', instructor: '黃老師', participants: 15, schedule: '週四 16:00' },
];
const PLACEHOLDER_LAND = [
  { parcel: '五結段123地號', area: 8450, announcedValue: 12800 },
  { parcel: '五結段124地號', area: 2100, announcedValue: 12800 },
];
const PLACEHOLDER_INQUIRY = [
  { date: '2025-11-08', subject: '王議員：代理教師人力', status: '已答詢' },
  { date: '2025-11-08', subject: '李議員：圖書館藏書更新', status: '已答詢' },
  { date: '2026-05-20', subject: '陳議員：課後社團經費', status: '待答詢' },
];
const PLACEHOLDER_SPECIAL_NEEDS = [
  { category: '身障生', count: 14, note: '含資源班與巡迴輔導' },
  { category: '原住民', count: 17, note: '' },
  { category: '新住民', count: 25, note: '' },
];
// 校方尚未提供 115 年度正式決算數字（決算須待年度結束後陸續填報），此處僅為
// 示意資料，用以展示「預算／決算／差異原因」報表呈現方式，正式啟用前請由
// 承辦人員以系統表單填入實際決算數字。
const PLACEHOLDER_115_EXPENSE_VARIANCE = {
  國民教育計畫: { actualAmount: 6020, varianceNote: '部分計畫延至次年度執行' },
};

const SEED_YEARS = ['113', '114', '115'];

const indexed = (recordType, rows) => rows.map((data, i) => ({
  id: `${recordType}-${i}`,
  data: { recordType, ...data },
}));

function budgetRecordsFor(year) {
  if (year === '115') {
    const expenseRows = REAL_115_EXPENSE_BREAKDOWN.map((row) => ({
      ...row,
      actualAmount: null,
      varianceNote: null,
      ...(PLACEHOLDER_115_EXPENSE_VARIANCE[row.label] || {}),
    }));
    return [
      ...indexed('expense', expenseRows),
      ...indexed('revenue', REAL_115_REVENUE_ROWS),
    ];
  }
  return [{
    id: 'expense-legacy-total',
    data: {
      recordType: 'expense', label: '（歷史年度僅存總額，未逐項留存）', formula: '', amount: REAL_EXPENSE_TOTAL_BY_YEAR[Number(year)],
    },
  }];
}

/** The full desired document tree for one year. Pure data — no I/O. */
function buildYearPlan(year) {
  const plan = {
    yearDoc: {
      path: `years/${year}`,
      data: { locked: year !== '115', deadlines: year === '115' ? { basic: '2026-08-15' } : {} },
    },
    modules: [
      { path: `years/${year}/modules/budgetbook`, data: { fundName: '利澤國小校務基金', reviewAuthority: '宜蘭縣議會' } },
    ],
    recordGroups: [
      { modulePath: `years/${year}/modules/budget`, rows: budgetRecordsFor(year) },
    ],
  };
  if (year === '115') {
    plan.modules.push(
      {
        path: 'years/115/modules/basic',
        data: {
          classes: '13', students: '262', staff: '28', regularTeachers: '19', partTimeTeachers: '2', status: 'submitted',
          // 代理教師僅留有「9 人」的合計，校方尚未提供懸缺代理／增置員額的分項數字，
          // 暫將合計全數計入懸缺代理，待總務處以系統表單更正實際分項。
          substituteVacancy: '9', substituteAdditional: '0',
          // 學雜費／午餐補助為新增欄位，尚未取得校方正式數字，暫以示意資料填入。
          tuitionFeeAvg: '827', lunchSubsidyTotal: '236',
        },
      },
      { path: 'years/115/modules/library', data: { generalBooks: 17296, indigenousBooks: 36 } },
    );
    plan.recordGroups.push(
      {
        modulePath: 'years/115/modules/language',
        rows: [
          ...indexed('class', PLACEHOLDER_LANGUAGE_CLASSES),
          ...indexed('certification', PLACEHOLDER_LANGUAGE_CERTS),
          ...indexed('roster', PLACEHOLDER_LANGUAGE_ROSTER),
        ],
      },
      { modulePath: 'years/115/modules/awards', rows: indexed('award', PLACEHOLDER_AWARDS) },
      { modulePath: 'years/115/modules/club', rows: indexed('club', PLACEHOLDER_CLUBS) },
      { modulePath: 'years/115/modules/land', rows: indexed('land', PLACEHOLDER_LAND) },
      { modulePath: 'years/115/modules/inquiry', rows: indexed('inquiry', PLACEHOLDER_INQUIRY) },
      { modulePath: 'years/115/modules/specialNeeds', rows: indexed('specialNeeds', PLACEHOLDER_SPECIAL_NEEDS) },
    );
  }
  return plan;
}

/** Creates `path` with `data` only if nothing is there yet; otherwise a no-op. */
async function ensureDoc(db, path, data, { dryRun, report }) {
  const ref = db.doc(path);
  const snap = await ref.get();
  if (snap.exists) {
    report.skipped.push(path);
    return false;
  }
  report.created.push(path);
  if (!dryRun) await ref.set(data);
  return true;
}

async function applyYearPlan(db, plan, { dryRun, now, report }) {
  await ensureDoc(db, plan.yearDoc.path, plan.yearDoc.data, { dryRun, report });
  for (const moduleDoc of plan.modules) {
    await ensureDoc(db, moduleDoc.path, moduleDoc.data, { dryRun, report });
  }
  for (const group of plan.recordGroups) {
    for (const row of group.rows) {
      await ensureDoc(db, `${group.modulePath}/records/${row.id}`, {
        ...row.data, createdAt: now, updatedAt: now, deletedAt: null, deletedBy: null,
      }, { dryRun, report });
    }
  }
}

/**
 * Resolves `email`'s Auth UID (creating the Auth user if it doesn't exist
 * yet — skipped under dry-run, since that's a real, non-Firestore side
 * effect) and ensures an **active** admin profile. Fail-closed access checks
 * throughout the app require the literal status 'active', so a profile
 * without it would leave the admin locked out of their own system.
 */
async function ensureAdminProfile(db, auth, email, { dryRun, now, report }) {
  let user;
  try {
    user = await auth.getUserByEmail(email);
  } catch {
    if (dryRun) {
      report.created.push(`auth-user:${email} (dry-run, not created)`);
      return null;
    }
    user = await auth.createUser({ email, password: `${Math.random().toString(36).slice(-10)}A1!` });
    report.created.push(`auth-user:${email}`);
  }

  const path = `users/${user.uid}`;
  await ensureDoc(db, path, {
    name: '系統管理員', email, dept: '校長室', role: 'admin', status: 'active', modules: [], createdAt: now, createdBy: 'seed-script',
  }, { dryRun, report });
  return user.uid;
}

async function runMigration({
  db, auth, adminEmail = null, dryRun = false, now = new Date().toISOString(),
}) {
  const report = { created: [], skipped: [] };
  for (const year of SEED_YEARS) {
    const plan = buildYearPlan(year);
    await applyYearPlan(db, plan, { dryRun, now, report });
  }
  const adminUid = adminEmail
    ? await ensureAdminProfile(db, auth, adminEmail, {
      dryRun, now, report,
    })
    : null;
  return { report, adminUid };
}

module.exports = {
  SEED_YEARS,
  buildYearPlan,
  ensureDoc,
  applyYearPlan,
  ensureAdminProfile,
  runMigration,
};
