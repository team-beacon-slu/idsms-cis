/** @jest-environment node */
// handleApiError is imported by nearly every API route, so it must not pull
// the headless-browser stack (puppeteer-core/@sparticuz/chromium) into every
// function bundle. If anything in its import graph reaches the PDF renderer,
// this factory throws and the import below fails.
jest.mock("@/lib/pdf/renderHtmlToPdf", () => {
  throw new Error("apiError must not import the PDF renderer");
});
jest.mock("@supabase/supabase-js", () => ({ createClient: jest.fn(() => ({ storage: {} })) }));

import { handleApiError } from "@/lib/utils/apiError";
import { AiProviderError } from "@/lib/services/ai/aiService";
import { DocumentNotReadyError } from "@/lib/documents/errors";
import {
  ComplianceNotFoundError,
  DataRequestStateError,
  RetentionStateError,
} from "@/lib/errors/compliance";

it("maps DocumentNotReadyError to 400 without loading the PDF renderer", async () => {
  const res = handleApiError(new DocumentNotReadyError());
  expect(res.status).toBe(400);
});

describe("compliance errors", () => {
  it("maps DataRequestStateError to 409 with its message", async () => {
    const res = handleApiError(new DataRequestStateError("x"));
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: "x" });
  });

  it("maps RetentionStateError to 409", async () => {
    const res = handleApiError(new RetentionStateError("already reviewed"));
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: "already reviewed" });
  });

  it("maps ComplianceNotFoundError to 404", async () => {
    const res = handleApiError(new ComplianceNotFoundError("Not found"));
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "Not found" });
  });
});

it("maps a malformed JSON body to 400, not a server error", async () => {
  const parseError = await Promise.resolve()
    .then(() => JSON.parse("{bad"))
    .catch((e: unknown) => e);
  const res = handleApiError(parseError);
  expect(res.status).toBe(400);
  await expect(res.json()).resolves.toEqual({ error: "Malformed JSON body" });
});

it("gives an unexpected crash a reference that matches the log", async () => {
  const log = jest.spyOn(console, "error").mockImplementation(() => {});
  const res = handleApiError(new Error("boom"));
  expect(res.status).toBe(500);
  const body = await res.json();
  expect(body.ref).toMatch(/^[0-9a-f]{8}$/);
  expect(body.error).toContain(`ref ${body.ref}`);
  expect(log.mock.calls[0][0]).toBe(`[error ${body.ref}]`);
  log.mockRestore();
});

it("turns an AI quota or outage into a plain 'busy' message", async () => {
  const log = jest.spyOn(console, "error").mockImplementation(() => {});
  const busy = handleApiError(new AiProviderError("chat failed (429): quota", 429));
  expect(busy.status).toBe(503);
  expect((await busy.json()).error).toMatch(/AI assist is busy/);
  const rejected = handleApiError(new AiProviderError("bad input", 400));
  expect(rejected.status).toBe(502);
  log.mockRestore();
});
