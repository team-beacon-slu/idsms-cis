/** @jest-environment node */
// Real requireRole, error mapping, and file validation — only the session,
// report lookup, ownership check, and Storage writes are mocked — so these
// tests exercise the actual authorization and upload-validation paths.
jest.mock("@supabase/supabase-js", () => ({ createClient: jest.fn(() => ({ storage: {} })) }));
jest.mock("@/lib/auth/session", () => ({
  ...jest.requireActual("@/lib/auth/session"),
  requireUserApi: jest.fn(),
}));
jest.mock("@/lib/services/userService", () => ({
  ...jest.requireActual("@/lib/services/userService"),
  assertCanAccessStudent: jest.fn(),
}));
jest.mock("@/lib/services/weeklyReportService", () => ({
  ...jest.requireActual("@/lib/services/weeklyReportService"),
  getWeeklyReport: jest.fn(),
  attachSignedCopy: jest.fn(),
}));
jest.mock("@/lib/storage", () => ({
  ...jest.requireActual("@/lib/storage"),
  uploadFile: jest.fn(),
  getSignedUrl: jest.fn(),
}));

import { NextRequest } from "next/server";
import { requireUserApi } from "@/lib/auth/session";
import { assertCanAccessStudent, ForbiddenError } from "@/lib/services/userService";
import { attachSignedCopy, getWeeklyReport } from "@/lib/services/weeklyReportService";
import { getSignedUrl, uploadFile } from "@/lib/storage";
import { GET, POST } from "@/app/api/weekly-reports/[id]/signed-copy/route";

const params = { params: { id: "wr-1" } };
const submittedReport = {
  id: "wr-1",
  studentProfileId: "p-1",
  status: "PENDING",
  revisionHistory: [{ type: "SUBMITTED", timestamp: "t1", referenceCode: "WR-1" }],
};
const PDF_BYTES = [0x25, 0x50, 0x44, 0x46, 0x2d, 0x31];

function upload(bytes: number[], type: string) {
  const form = new FormData();
  form.set("file", new File([new Uint8Array(bytes)], "signed", { type }));
  return new NextRequest("http://localhost/api/weekly-reports/wr-1/signed-copy", {
    method: "POST",
    body: form,
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, "error").mockImplementation(() => {});
  (requireUserApi as jest.Mock).mockResolvedValue({ id: "student-1", role: "STUDENT_INTERN" });
  (getWeeklyReport as jest.Mock).mockResolvedValue(submittedReport);
  (assertCanAccessStudent as jest.Mock).mockResolvedValue(undefined);
  (uploadFile as jest.Mock).mockImplementation(async (_bucket, path) => path);
  (attachSignedCopy as jest.Mock).mockResolvedValue({ type: "SIGNED_COPY_UPLOADED" });
});

describe("POST /api/weekly-reports/[id]/signed-copy", () => {
  it("stores the owner's PDF under a server-built path", async () => {
    const res = await POST(upload(PDF_BYTES, "application/pdf"), params);
    expect(res.status).toBe(201);
    expect(uploadFile).toHaveBeenCalledWith(
      "checklist-documents",
      "signed-copies/p-1/wr-1-WR-1.pdf",
      expect.any(File)
    );
  });

  it("refuses a faculty adviser (students upload their own signed copies)", async () => {
    (requireUserApi as jest.Mock).mockResolvedValue({ id: "fac-1", role: "FACULTY_ADVISER" });
    const res = await POST(upload(PDF_BYTES, "application/pdf"), params);
    expect(res.status).toBe(401);
    expect(uploadFile).not.toHaveBeenCalled();
  });

  it("refuses another student's report", async () => {
    (assertCanAccessStudent as jest.Mock).mockRejectedValue(new ForbiddenError());
    const res = await POST(upload(PDF_BYTES, "application/pdf"), params);
    expect(res.status).toBe(403);
    expect(uploadFile).not.toHaveBeenCalled();
  });

  it("rejects an HTML file disguised as a PNG before storing anything", async () => {
    const html = Array.from("<html><script>alert(1)</script>", (c) => c.charCodeAt(0));
    const res = await POST(upload(html, "image/png"), params);
    expect(res.status).toBe(400);
    expect(uploadFile).not.toHaveBeenCalled();
  });
});

describe("POST eligibility is checked before anything is stored", () => {
  it("refuses a returned report without uploading", async () => {
    (getWeeklyReport as jest.Mock).mockResolvedValue({
      ...submittedReport,
      status: "RETURNED",
      revisionHistory: [
        ...submittedReport.revisionHistory,
        { type: "RETURNED", timestamp: "t2", notes: "Fix" },
      ],
    });
    const res = await POST(upload(PDF_BYTES, "application/pdf"), params);
    expect(res.status).toBe(400);
    expect(uploadFile).not.toHaveBeenCalled();
  });
});

describe("GET /api/weekly-reports/[id]/signed-copy", () => {
  const get = () => new NextRequest("http://localhost/api/weekly-reports/wr-1/signed-copy");
  const withCopy = (referenceCode: string) => ({
    ...submittedReport,
    revisionHistory: [
      ...submittedReport.revisionHistory,
      { type: "SIGNED_COPY_UPLOADED", timestamp: "t2", path: "signed.pdf", referenceCode },
    ],
  });

  it("redirects an authorized viewer to a signed URL of the current copy", async () => {
    (getWeeklyReport as jest.Mock).mockResolvedValue(withCopy("WR-1"));
    (getSignedUrl as jest.Mock).mockResolvedValue("https://signed.example/s.pdf");
    const res = await GET(get(), params);
    expect(res.status).toBe(307);
    expect(getSignedUrl).toHaveBeenCalledWith("checklist-documents", "signed.pdf");
  });

  it("refuses a user who cannot access the student, without minting a URL", async () => {
    (getWeeklyReport as jest.Mock).mockResolvedValue(withCopy("WR-1"));
    (assertCanAccessStudent as jest.Mock).mockRejectedValue(new ForbiddenError());
    const res = await GET(get(), params);
    expect(res.status).toBe(403);
    expect(getSignedUrl).not.toHaveBeenCalled();
  });

  it("404s when the only signed copy belongs to an older submission", async () => {
    (getWeeklyReport as jest.Mock).mockResolvedValue(withCopy("WR-OLD"));
    const res = await GET(get(), params);
    expect(res.status).toBe(404);
  });

  it("404s for an unknown report", async () => {
    (getWeeklyReport as jest.Mock).mockResolvedValue(null);
    const res = await GET(get(), params);
    expect(res.status).toBe(404);
  });
});
