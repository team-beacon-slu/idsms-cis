// Client-side JSON request that never throws. A dropped connection or a non-JSON
// error page becomes an ordinary failure, so a form can always re-enable itself and
// keep what the user typed instead of freezing on an unhandled rejection.
export const OFFLINE_MESSAGE = "No connection. Your changes are still here; try again.";
// After a timeout the server may already have saved, so ask the user to check before resending.
export const TIMEOUT_MESSAGE =
  "The connection is too slow and this timed out. Your changes are still here; refresh to check whether it saved before trying again.";
// Long enough for a weak mobile signal, short enough that a stalled request does not spin forever.
export const REQUEST_TIMEOUT_MS = 30_000;
// A 5 MB file on a weak signal (~1 Mbps) needs about 40 s.
export const UPLOAD_TIMEOUT_MS = 120_000;
// Sessions end after 30 minutes idle; typing does not reach the server.
export const SESSION_MESSAGE =
  "Your session timed out. Your text is still here: sign in again in a new tab, then come back and try again.";

export type SendJsonResult =
  | { ok: true; status: number; body: Record<string, unknown> }
  | { ok: false; status: number; body: Record<string, unknown>; error: string };

export async function sendJson(
  url: string,
  init: { method: string; body?: unknown } = { method: "GET" }
): Promise<SendJsonResult> {
  // A file upload goes as multipart; the browser sets its own Content-Type boundary.
  const form = init.body instanceof FormData ? init.body : null;
  // AbortController rather than AbortSignal.timeout(): older iPhones (iOS 15) lack the latter.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), form ? UPLOAD_TIMEOUT_MS : REQUEST_TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(url, {
      method: init.method,
      headers: init.body === undefined || form ? undefined : { "Content-Type": "application/json" },
      body: form ?? (init.body === undefined ? undefined : JSON.stringify(init.body)),
      signal: controller.signal,
    });
  } catch {
    clearTimeout(timer);
    const error = controller.signal.aborted ? TIMEOUT_MESSAGE : OFFLINE_MESSAGE;
    return { ok: false, status: 0, body: {}, error };
  }
  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  clearTimeout(timer);
  if (res.ok) return { ok: true, status: res.status, body };
  // Only the bare "no session" 401: wrong password, inactive account etc. keep their message.
  if (res.status === 401 && body.error === "Unauthorized")
    return { ok: false, status: 401, body, error: SESSION_MESSAGE };
  const issues = body.issues as { message?: string }[] | undefined;
  const error =
    issues?.[0]?.message ??
    (typeof body.error === "string" ? body.error : undefined) ??
    `Something went wrong (${res.status}). Please try again.`;
  return { ok: false, status: res.status, body, error };
}
