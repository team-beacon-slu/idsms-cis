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
