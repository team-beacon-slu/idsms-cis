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
//
// Approach: normalize both texts (lowercase, strip punctuation, collapse
// whitespace), then compare with a Levenshtein similarity ratio
// (1 - distance / longer length). A ratio of 0.9 or higher counts as
// near-exact. That catches re-pasted text with a changed date or a fixed typo,
// while real entries that share a sentence still pass. Texts shorter than
// MIN_COMPARABLE_LENGTH after normalizing are never flagged, so terse
// entries like "Holiday" or "Absent" can repeat legitimately.

export const NEAR_EXACT_THRESHOLD = 0.9;
const MIN_COMPARABLE_LENGTH = 15;

export function normalizeAccomplishment(text: string): string {
  return (
    text
      .toLowerCase()
      // Keeps ASCII letters/digits plus Latin-1/Extended-A letters (ñ, é, …)
      // so Filipino/Spanish names survive normalization.
      .replace(/[^a-z0-9À-ſ\s]/g, " ")
      .replace(/\s+/g, " ")
      .trim()
  );
}

// Two-row Levenshtein distance — O(n·m) time, O(min(n, m)) memory.
function levenshtein(a: string, b: string): number {
  if (a.length < b.length) [a, b] = [b, a];
  let previous = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i += 1) {
    const current = [i];
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      current[j] = Math.min(previous[j] + 1, current[j - 1] + 1, previous[j - 1] + cost);
    }
    previous = current;
  }
  return previous[b.length];
}

export function accomplishmentSimilarity(newText: string, priorText: string): number {
  const a = normalizeAccomplishment(newText);
  const b = normalizeAccomplishment(priorText);
  if (!a || !b) return 0;
  if (a === b) return 1;
  return 1 - levenshtein(a, b) / Math.max(a.length, b.length);
}

export function detectCopyPasteWarning(newText: string, priorText: string): boolean {
  const a = normalizeAccomplishment(newText);
  const b = normalizeAccomplishment(priorText);
  if (a.length < MIN_COMPARABLE_LENGTH || b.length < MIN_COMPARABLE_LENGTH) return false;
  return accomplishmentSimilarity(a, b) >= NEAR_EXACT_THRESHOLD;
}
