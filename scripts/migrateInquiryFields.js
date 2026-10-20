#!/usr/bin/env node
/**
 * One-time migration: splits existing 議會質詢／答詢紀錄 records' combined
 * "議員：題目" `subject` field into separate `councilor`／`subject` fields,
 * and backfills a null `answer` field — see
 * scripts/migrateInquiryFields.cjs for why this is needed.
 *
 * Usage (same service-account key as scripts/seed.js):
 *   node scripts/migrateInquiryFields.js --dry-run   # preview, writes nothing
 *   node scripts/migrateInquiryFields.js
 *
 * Safe to run more than once — a record that already has a `councilor`
 * field is left alone, so a second run touches nothing further.
 */
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { getNamedFirestore } from '../functions/firestore.js';
import { migrateInquiryFields } from './migrateInquiryFields.cjs';

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
  console.log(dryRun ? 'Dry run — no writes will be made.' : 'Migrating 議會質詢／答詢 records…');
  const report = await migrateInquiryFields({ db, years: YEARS, dryRun });

  if (report.moved.length === 0 && report.needsReview.length === 0) {
    console.log('Nothing to migrate — no 議會質詢／答詢 records are still on the old combined 議員/題目 shape.');
  } else {
    console.log(`${dryRun ? 'Would split' : 'Split'} ${report.moved.length} record(s) on "議員：題目":`);
    for (const path_ of report.moved) console.log(`  → ${path_}`);
  }
  if (report.needsReview.length > 0) {
    console.log(`${report.needsReview.length} record(s) had no "議員：題目" colon to split — 議員 left blank, please fill in by hand:`);
    for (const path_ of report.needsReview) console.log(`  → ${path_}`);
  }
  if (report.skipped.length > 0) {
    console.log(`Skipped ${report.skipped.length} record(s) already on the new field shape.`);
  }
  console.log(dryRun ? 'Dry run complete.' : 'Migration complete.');
  process.exit(0);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
