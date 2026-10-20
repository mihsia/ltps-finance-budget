// One-time migration for the 議會質詢／答詢紀錄 field split.
//
// Before this change, a single `subject` field held "議員：題目" combined
// (e.g. "王議員：代理教師人力"), and there was no `answer` field for the
// actual answer text — only a `status` label. The schema now has separate
// `councilor`／`subject` fields plus an `answer` field, so existing records
// need their `subject` split once or 議員 will show blank and 題目 will
// still show the old combined text.
//
// Idempotent and dry-run-safe: a record is only touched if it has no
// `councilor` field yet (the old shape never wrote one), so running this
// twice — or against a project already on the new shape — finds nothing
// left to do.
//
// The split only works where the existing `subject` follows the
// "議員：題目" convention (full-width or half-width colon). A record with no
// colon is left with `councilor: ''` and the original `subject` text
// unchanged, and is reported separately under `needsReview` so an admin
// knows to fill in 議員 by hand — this script never guesses a name.
const COLON_PATTERN = /[：:]/;

function splitSubject(subject) {
  const text = typeof subject === 'string' ? subject : '';
  const match = COLON_PATTERN.exec(text);
  if (!match) return { councilor: '', subject: text.trim(), matched: false };
  return {
    councilor: text.slice(0, match.index).trim(),
    subject: text.slice(match.index + 1).trim(),
    matched: true,
  };
}

async function migrateInquiryFields({ db, years, dryRun = false }) {
  const report = { moved: [], needsReview: [], skipped: [] };
  for (const year of years) {
    const sourceCollection = db.collection(`years/${year}/modules/inquiry/records`);
    const snap = await sourceCollection.get();
    for (const docSnap of snap.docs) {
      const data = docSnap.data();
      if (data?.councilor !== undefined) {
        report.skipped.push(docSnap.ref.path);
        continue;
      }

      const { councilor, subject, matched } = splitSubject(data?.subject);
      const updated = {
        ...data, councilor, subject, answer: data?.answer ?? null,
      };
      (matched ? report.moved : report.needsReview).push(docSnap.ref.path);
      if (!dryRun) await docSnap.ref.set(updated);
    }
  }
  return report;
}

module.exports = { migrateInquiryFields };
