/**
 * Sums 課後社團 participants across every active club and expresses the
 * total as a share of the whole student body — a participation-slot rate,
 * not a distinct-student headcount: the data model only stores a headcount
 * per club, not a roster, so a student enrolled in two clubs is counted in
 * both and there is no way to dedupe that here.
 */
export function summarizeClubParticipation(records, totalStudents) {
  const totalParticipants = records.reduce((sum, r) => sum + (Number(r?.participants) || 0), 0);
  const pct = totalStudents > 0 ? Math.round((totalParticipants / totalStudents) * 1000) / 10 : null;
  return { totalParticipants, totalStudents, pct };
}
