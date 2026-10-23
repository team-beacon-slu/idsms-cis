/** @jest-environment node */
import {
  OFFLINE_MESSAGE,
  REQUEST_TIMEOUT_MS,
  TIMEOUT_MESSAGE,
  sendJson,
} from "@/lib/utils/sendJson";

const fetchMock = jest.fn();
beforeEach(() => {
  fetchMock.mockReset();
  global.fetch = fetchMock as unknown as typeof fetch;
});

it("turns a dropped connection into a failure instead of throwing", async () => {
  fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));
  await expect(sendJson("/api/x", { method: "PATCH", body: {} })).resolves.toEqual({
    ok: false,
    status: 0,
    body: {},
    error: OFFLINE_MESSAGE,
  });
});

it("gives up on a stalled request and says it may already have saved", async () => {
  jest.useFakeTimers();
  fetchMock.mockImplementation(
    (_url: string, init: RequestInit) =>
      new Promise((_resolve, reject) =>
        init.signal?.addEventListener("abort", () => reject(new DOMException("", "AbortError")))
      )
  );
  const pending = sendJson("/api/x", { method: "POST", body: {} });
  jest.advanceTimersByTime(REQUEST_TIMEOUT_MS);
  await expect(pending).resolves.toEqual(
    expect.objectContaining({ ok: false, status: 0, error: TIMEOUT_MESSAGE })
  );
  jest.useRealTimers();
});

it("reads a validation message, then the server's error, then a generic one", async () => {
  fetchMock.mockResolvedValueOnce(
    new Response(JSON.stringify({ issues: [{ message: "Hours must be positive" }] }), {
      status: 400,
    })
  );
  expect((await sendJson("/api/x", { method: "POST" })).ok).toBe(false);

  fetchMock.mockResolvedValueOnce(new Response("<html>Bad gateway</html>", { status: 502 }));
  const gateway = await sendJson("/api/x", { method: "POST" });
  expect(gateway).toEqual(
    expect.objectContaining({ ok: false, error: "Something went wrong (502). Please try again." })
  );
});

it("returns the parsed body on success", async () => {
  fetchMock.mockResolvedValue(new Response(JSON.stringify({ id: "wr-1" }), { status: 200 }));
  await expect(sendJson("/api/x", { method: "GET" })).resolves.toEqual({
    ok: true,
    status: 200,
    body: { id: "wr-1" },
  });
});
