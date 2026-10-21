/**
 * Resolves which year a page should actually show, given the years
 * currently known to exist and whichever year the user has explicitly
 * picked this session (null if they haven't picked one yet).
 *
 * Until the user picks a year, this always tracks the true latest year —
 * so a session that renders for the first time before `years` has finished
 * syncing from Firestore (it starts from a hardcoded fallback), or where a
 * newer year gets created mid-session, lands on/follows the real latest
 * year instead of getting stuck on whatever `years` happened to contain at
 * that first render. `src/App.jsx`'s `Shell` used to seed its year state
 * with `useState(latestYear)`, which only evaluates once at mount — once a
 * later year appeared, the selected year silently stopped being "the
 * latest one" and nothing ever corrected it.
 *
 * Once the user does pick a year (via the header switcher or 歷史歸檔's
 * 檢視／匯出), that choice sticks for the rest of the session as long as
 * the year still exists in `years`.
 */
export function resolveEffectiveYear(years, selectedYear) {
  const latestYear = years[years.length - 1];
  if (selectedYear != null && years.includes(selectedYear)) return selectedYear;
  return latestYear;
}
