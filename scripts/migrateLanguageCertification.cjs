// One-time migration for the 族語開班／族語認證 module split.
//
// Before this change, 認證統計 and 名冊 records lived alongside 開班資料 in
// years/{year}/modules/language/records. The 族語認證 page now reads its own
// years/{year}/modules/languageCert/records collection instead, so any
// certification/roster rows a school already entered need to be moved over
// once or the 族語認證 page will start out empty while the old rows sit
// unreachable under 族語開班.
//
// Idempotent and dry-run-safe: a row is only ever moved if nothing already
// exists at its destination, so running this twice (or against a project
// that was never on the old combined shape) finds nothing left to do.
const MOVABLE_RECORD_TYPES = ['certification', 'roster'];

async function migrateLanguageCertification({ db, years, dryRun = false }) {
  const report = { moved: [], skipped: [] };
  for (const year of years) {
    const sourceCollection = db.collection(`years/${year}/modules/language/records`);
    const snap = await sourceCollection.get();
    for (const docSnap of snap.docs) {
      const data = docSnap.data();
      if (!MOVABLE_RECORD_TYPES.includes(data?.recordType)) continue;

      const targetPath = `years/${year}/modules/languageCert/records/${docSnap.id}`;
      const targetRef = db.doc(targetPath);
      const targetSnap = await targetRef.get();
      if (targetSnap.exists) {
        report.skipped.push(targetPath);
        continue;
      }

      report.moved.push(targetPath);
      if (!dryRun) {
        await targetRef.set(data);
        await docSnap.ref.delete();
      }
    }
  }
  return report;
}

module.exports = { MOVABLE_RECORD_TYPES, migrateLanguageCertification };
