// FR-WR-04 — Owner: AndresBonifaci0 (Matt)
// Requirement: before submission, compare new accomplishment text against
// the student's immediate prior submission; block submit on an exact or
// near-exact match.
// Connects to: called from `WeeklyReportForm` (F1, `weekly-report-form.tsx`,
// same task) to gate its submit button — pure client-side check, no server
// round-trip (distinct from the server-side vector similarity in FR-AI-01 /
// Module 9, which is out of scope for Phase 3).
// Edge cases: what counts as "near-exact" is this function's actual design
// work (e.g. Levenshtein distance ratio, or a simpler normalized-string
// equality check) — document whichever approach is chosen here.
export function detectCopyPasteWarning(newText: string, priorText: string): boolean {
  void newText;
  void priorText;
  return false;
}
