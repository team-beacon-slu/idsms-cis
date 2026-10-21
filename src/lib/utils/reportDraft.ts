// Browser-only safety net for unsaved weekly-report edits (closed tab, refresh, dead
// battery). The server stays authoritative: a draft row is restored only while the
// server's copy of that day is still exactly what the student started editing, and
// deadlines are judged by the server's submit time, never by the draft.

const PREFIX = "idsms:weekly-draft:";
const MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000;

type Row = { dirty: boolean };
type StoredRow<R> = { base: string; row: R };
type Stored<R> = { savedAt: number; rows: Record<string, StoredRow<R>> };

const fingerprint = (row: Row) => JSON.stringify({ ...row, dirty: false });

// Keeps the dirty rows; `server` is each row as the server last sent it.
export function saveDraft<R extends Row>(
  reportId: string,
  rows: Record<string, R>,
  server: Record<string, R>,
  now = Date.now()
) {
  const dirty: Record<string, StoredRow<R>> = {};
  for (const [id, row] of Object.entries(rows)) {
    if (row.dirty && server[id]) dirty[id] = { base: fingerprint(server[id]), row };
  }
  try {
    if (Object.keys(dirty).length === 0) localStorage.removeItem(PREFIX + reportId);
    else localStorage.setItem(PREFIX + reportId, JSON.stringify({ savedAt: now, rows: dirty }));
  } catch {
    // Private mode or full storage: no safety net, but the form still works.
  }
}

// Returns the draft rows still safe to restore, and when they were saved.
export function loadDraft<R extends Row>(
  reportId: string,
  server: Record<string, R>,
  now = Date.now()
): { savedAt: number; rows: Record<string, R> } | null {
  let stored: Stored<R>;
  try {
    const raw = localStorage.getItem(PREFIX + reportId);
    if (!raw) return null;
    stored = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!stored?.rows || now - stored.savedAt > MAX_AGE_MS) {
    clearDraft(reportId);
    return null;
  }
  const rows: Record<string, R> = {};
  for (const [id, { base, row }] of Object.entries(stored.rows)) {
    // The server's copy changed since (saved elsewhere, returned by faculty): it wins.
    if (server[id] && fingerprint(server[id]) === base) rows[id] = { ...row, dirty: true };
  }
  if (Object.keys(rows).length === 0) {
    clearDraft(reportId);
    return null;
  }
  return { savedAt: stored.savedAt, rows };
}

export function clearDraft(reportId: string) {
  try {
    localStorage.removeItem(PREFIX + reportId);
  } catch {
    // Nothing to clear if storage is unavailable.
  }
}
