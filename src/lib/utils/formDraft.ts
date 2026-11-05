import { useEffect, useRef } from "react";

// Browser-only safety net for one long form (final report, journal, company evaluation):
// a closed tab, a refresh or a session timeout no longer loses typed text. Same rule as
// reportDraft.ts: the server stays authoritative, so a draft is restored only while the
// server's copy is still exactly what the user started editing.

const PREFIX = "idsms:form-draft:";
const MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000;

type Stored<T> = { savedAt: number; base: string; value: T };

export function saveFormDraft<T>(key: string, value: T, server: T, now = Date.now()) {
  const base = JSON.stringify(server);
  try {
    if (JSON.stringify(value) === base) localStorage.removeItem(PREFIX + key);
    else localStorage.setItem(PREFIX + key, JSON.stringify({ savedAt: now, base, value }));
  } catch {
    // Private mode or full storage: no safety net, but the form still works.
  }
}

export function loadFormDraft<T>(
  key: string,
  server: T,
  now = Date.now()
): { savedAt: number; value: T } | null {
  let stored: Stored<T>;
  try {
    const raw = localStorage.getItem(PREFIX + key);
    if (!raw) return null;
    stored = JSON.parse(raw);
  } catch {
    return null;
  }
  // Too old, or the server's copy changed since (saved elsewhere, returned): the server wins.
  if (!stored || now - stored.savedAt > MAX_AGE_MS || stored.base !== JSON.stringify(server)) {
    clearFormDraft(key);
    return null;
  }
  return { savedAt: stored.savedAt, value: stored.value };
}

export function clearFormDraft(key: string) {
  try {
    localStorage.removeItem(PREFIX + key);
  } catch {
    // Nothing to clear if storage is unavailable.
  }
}

/**
 * Keeps `value` backed up while it differs from `server`, offers it back once on mount
 * through `restore`, and warns before leaving the page with unsaved changes.
 * Returns whether there are unsaved changes.
 */
export function useFormDraft<T>(
  key: string,
  value: T,
  server: T,
  restore: (value: T, savedAt: number) => void,
  enabled = true
) {
  // Nothing is saved until the stored draft has been offered back (else it would be overwritten).
  const checked = useRef(false);
  const restoreRef = useRef(restore);
  useEffect(() => {
    restoreRef.current = restore;
  });
  const serverJson = JSON.stringify(server);
  const dirty = enabled && JSON.stringify(value) !== serverJson;

  useEffect(() => {
    if (!enabled) return;
    const draft = loadFormDraft(key, JSON.parse(serverJson) as T);
    if (draft) restoreRef.current(draft.value, draft.savedAt);
    checked.current = true;
    // Once per form: later server changes are the user's own saves.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, enabled]);

  useEffect(() => {
    // The render that restores a draft saves it again right after, so it is never lost.
    if (enabled && checked.current) saveFormDraft(key, value, JSON.parse(serverJson) as T);
  }, [key, enabled, value, serverJson]);

  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  return dirty;
}
