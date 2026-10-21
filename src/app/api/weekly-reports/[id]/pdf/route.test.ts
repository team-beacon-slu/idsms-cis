/** @jest-environment node */
jest.mock("@/lib/auth/session", () => ({ requireUserApi: jest.fn() }));
jest.mock("@/lib/services/userService", () => {
  class ForbiddenError extends Error {}
  return { ForbiddenError, assertCanAccessStudent: jest.fn() };
});
jest.mock("@/lib/services/weeklyReportService", () => ({ getWeeklyReport: jest.fn() }));
jest.mock("@/lib/services/documentService", () => {
  class DocumentNotReadyError extends Error {}
  return {
    DocumentNotReadyError,
    generateWeeklyReportPdf: jest.fn(),
    getWeeklyReportDocument: jest.fn(),
    getGeneratedDocumentDownloadUrl: jest.fn(),
  };
});
jest.mock("@/lib/utils/apiError", () => ({
  handleApiError: (error: Error) =>
    Response.json(
      { error: error.message },
      { status: error.constructor.name === "ForbiddenError" ? 403 : 400 }
    ),
}));

import { NextRequest } from "next/server";
import { requireUserApi } from "@/lib/auth/session";
import { assertCanAccessStudent, ForbiddenError } from "@/lib/services/userService";
import { getWeeklyReport } from "@/lib/services/weeklyReportService";
import {
  generateWeeklyReportPdf,
  getGeneratedDocumentDownloadUrl,
  getWeeklyReportDocument,
} from "@/lib/services/documentService";
import { GET, POST } from "@/app/api/weekly-reports/[id]/pdf/route";

const params = { params: Promise.resolve({ id: "wr-1" }) };
const req = (method: string) =>
  new NextRequest("http://localhost/api/weekly-reports/wr-1/pdf", { method });

beforeEach(() => {
  jest.clearAllMocks();
  (requireUserApi as jest.Mock).mockResolvedValue({ id: "u-1", role: "STUDENT_INTERN" });
  (getWeeklyReport as jest.Mock).mockResolvedValue({ id: "wr-1", studentProfileId: "p-1" });
});

describe("POST /api/weekly-reports/[id]/pdf", () => {
  it("returns 200 with FAILED status instead of erroring when generation fails", async () => {
    (generateWeeklyReportPdf as jest.Mock).mockResolvedValue({
      generatedDocumentId: "doc-1",
      status: "FAILED",
    });
    const res = await POST(req("POST"), params);
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ generatedDocumentId: "doc-1", status: "FAILED" });
  });

  it("returns 404 for an unknown report", async () => {
    (getWeeklyReport as jest.Mock).mockResolvedValue(null);
    const res = await POST(req("POST"), params);
    expect(res.status).toBe(404);
  });
});

describe("GET /api/weekly-reports/[id]/pdf", () => {
  it("redirects to a signed URL when the PDF is generated", async () => {
    (getWeeklyReportDocument as jest.Mock).mockResolvedValue({ id: "doc-1", status: "GENERATED" });
    (getGeneratedDocumentDownloadUrl as jest.Mock).mockResolvedValue(
      "https://signed.example/doc.pdf"
    );
    const res = await GET(req("GET"), params);
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe("https://signed.example/doc.pdf");
  });

  it("returns 404 with the current status when not generated", async () => {
    (getWeeklyReportDocument as jest.Mock).mockResolvedValue({ id: "doc-1", status: "FAILED" });
    const res = await GET(req("GET"), params);
    expect(res.status).toBe(404);
    await expect(res.json()).resolves.toEqual(expect.objectContaining({ status: "FAILED" }));
  });

  it("GET refuses a user who cannot access the student", async () => {
    (assertCanAccessStudent as jest.Mock).mockRejectedValue(new ForbiddenError("Forbidden"));
    const res = await GET(req("GET"), params);
    expect(res.status).toBe(403);
    expect(getGeneratedDocumentDownloadUrl).not.toHaveBeenCalled();
  });
});
