// Client-side JSON request that never throws. A dropped connection or a non-JSON
// error page becomes an ordinary failure, so a form can always re-enable itself and
// keep what the user typed instead of freezing on an unhandled rejection.
export const OFFLINE_MESSAGE = "No connection. Your changes are still here; try again.";

export type SendJsonResult =
  | { ok: true; status: number; body: Record<string, unknown> }
  | { ok: false; status: number; body: Record<string, unknown>; error: string };

export async function sendJson(
  url: string,
  init: { method: string; body?: unknown } = { method: "GET" }
): Promise<SendJsonResult> {
  let res: Response;
  try {
    res = await fetch(url, {
      method: init.method,
      headers: init.body === undefined ? undefined : { "Content-Type": "application/json" },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
    });
  } catch {
    return { ok: false, status: 0, body: {}, error: OFFLINE_MESSAGE };
  }
  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (res.ok) return { ok: true, status: res.status, body };
  const issues = body.issues as { message?: string }[] | undefined;
  const error =
    issues?.[0]?.message ??
    (typeof body.error === "string" ? body.error : undefined) ??
    `Something went wrong (${res.status}). Please try again.`;
  return { ok: false, status: res.status, body, error };
}
