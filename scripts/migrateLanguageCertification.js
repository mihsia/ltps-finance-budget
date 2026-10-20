#!/usr/bin/env node
/**
 * One-time migration: moves existing 族語認證（認證統計／名冊）records out of
 * the 族語開班 (language) module's records subcollection into the new,
 * separate 族語認證 (languageCert) module — see
 * scripts/migrateLanguageCertification.cjs for why this is needed.
 *
 * Usage (same service-account key as scripts/seed.js):
 *   node scripts/migrateLanguageCertification.js --dry-run   # preview, writes nothing
 *   node scripts/migrateLanguageCertification.js
 *
 * Safe to run more than once — a row already present at its destination is
 * left alone, so a second run moves nothing further.
 */
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { getNamedFirestore } from '../functions/firestore.js';
import { migrateLanguageCertification } from './migrateLanguageCertification.cjs';

// Kept in sync by hand with src/hooks/useYearData.js's YEARS — not imported
// directly, since that module pulls in the firebase client SDK which isn't
// meant to run under plain Node.
const YEARS = ['113', '114', '115'];

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

(async () => {
  console.log(dryRun ? 'Dry run — no writes will be made.' : 'Migrating 族語認證 records…');
  const report = await migrateLanguageCertification({ db, years: YEARS, dryRun });

  if (report.moved.length === 0) {
    console.log('Nothing to move — no 族語開班 records are still holding 認證統計／名冊 data.');
  } else {
    console.log(`${dryRun ? 'Would move' : 'Moved'} ${report.moved.length} record(s):`);
    for (const path_ of report.moved) console.log(`  → ${path_}`);
  }
  if (report.skipped.length > 0) {
    console.log(`Skipped ${report.skipped.length} record(s) that already existed at their destination.`);
  }
  console.log(dryRun ? 'Dry run complete.' : 'Migration complete.');
  process.exit(0);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
