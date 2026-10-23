// Client-side JSON request that never throws. A dropped connection or a non-JSON
// error page becomes an ordinary failure, so a form can always re-enable itself and
// keep what the user typed instead of freezing on an unhandled rejection.
export const OFFLINE_MESSAGE = "No connection. Your changes are still here; try again.";
// After a timeout the server may already have saved, so ask the user to check before resending.
export const TIMEOUT_MESSAGE =
  "The connection is too slow and this timed out. Your changes are still here; refresh to check whether it saved before trying again.";
// Long enough for a weak mobile signal, short enough that a stalled request does not spin forever.
export const REQUEST_TIMEOUT_MS = 30_000;

export type SendJsonResult =
  | { ok: true; status: number; body: Record<string, unknown> }
  | { ok: false; status: number; body: Record<string, unknown>; error: string };

export async function sendJson(
  url: string,
  init: { method: string; body?: unknown } = { method: "GET" }
): Promise<SendJsonResult> {
  // AbortController rather than AbortSignal.timeout(): older iPhones (iOS 15) lack the latter.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(url, {
      method: init.method,
      headers: init.body === undefined ? undefined : { "Content-Type": "application/json" },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
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
  const issues = body.issues as { message?: string }[] | undefined;
  const error =
    issues?.[0]?.message ??
    (typeof body.error === "string" ? body.error : undefined) ??
    `Something went wrong (${res.status}). Please try again.`;
  return { ok: false, status: res.status, body, error };
}
