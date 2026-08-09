#!/usr/bin/env node
/**
 * Idempotent initial-data seed for a freshly created Firebase project.
 *
 * Usage:
 *   1. Download a service-account key from Firebase Console > Project settings
 *      > Service accounts > Generate new private key, save as
 *      scripts/serviceAccountKey.json (gitignored).
 *   2. npm run seed -- --dry-run   # preview what would be created, writes nothing
 *      SEED_ADMIN_EMAIL=you@school.edu.tw npm run seed
 *
 * Every document this script writes is only ever created if it doesn't
 * already exist (see scripts/migration.cjs) — running it again, or against a
 * project that already has real data, creates nothing new and never
 * overwrites anything a user has since edited through the app.
 *
 * Seeds /years/113-115 with the school's real 115年度預算書 figures (see
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
import { runMigration } from './migration.cjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dryRun = process.argv.includes('--dry-run');

const keyPath = path.join(__dirname, 'serviceAccountKey.json');
if (!fs.existsSync(keyPath)) {
  console.error('Missing scripts/serviceAccountKey.json — see the usage comment at the top of this file.');
  process.exit(1);
}

const serviceAccount = JSON.parse(fs.readFileSync(keyPath, 'utf8'));
initializeApp({ credential: cert(serviceAccount) });
const db = getNamedFirestore(getFirestore);
const auth = getAuth();

const adminEmail = process.env.SEED_ADMIN_EMAIL || null;
if (!adminEmail) {
  console.log('Set SEED_ADMIN_EMAIL=you@school.edu.tw to also create/ensure an initial admin account.');
}

(async () => {
  console.log(dryRun ? 'Dry run — no writes will be made.' : 'Seeding…');
  const { report, adminUid } = await runMigration({
    db, auth, adminEmail, dryRun,
  });

  if (report.created.length === 0) {
    console.log('Nothing to create — every seed document already exists.');
  } else {
    console.log(`${dryRun ? 'Would create' : 'Created'} ${report.created.length} document(s):`);
    for (const path_ of report.created) console.log(`  + ${path_}`);
  }
  if (report.skipped.length > 0) {
    console.log(`Skipped ${report.skipped.length} document(s) that already existed.`);
  }
  if (adminUid) {
    console.log(`Admin profile ready for ${adminEmail} (uid ${adminUid}).`);
    if (!dryRun) {
      console.log('If this Auth user is new, send them a password-reset link so they can sign in.');
    }
  }
  console.log(dryRun ? 'Dry run complete.' : 'Seed complete.');
  process.exit(0);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
