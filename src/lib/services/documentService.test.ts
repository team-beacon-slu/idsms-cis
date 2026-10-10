import { DocumentStatus, DocumentType } from "@prisma/client";
import { prismaMock, resetPrismaMock } from "@/testUtils/prismaMock";

jest.mock("@/lib/documents/weeklyReportData", () => ({ loadWeeklyReportDocumentData: jest.fn() }));
jest.mock("@/lib/pdf/renderHtmlToPdf", () => ({ renderHtmlToPdf: jest.fn() }));
jest.mock("@/lib/storage", () => ({
  GENERATED_DOCUMENTS_BUCKET: "generated-documents",
  uploadPdfBuffer: jest.fn(),
  getSignedUrl: jest.fn(),
}));

import { loadWeeklyReportDocumentData } from "@/lib/documents/weeklyReportData";
import { renderHtmlToPdf } from "@/lib/pdf/renderHtmlToPdf";
import { uploadPdfBuffer } from "@/lib/storage";
import {
  DocumentNotReadyError,
  generateWeeklyReportPdf,
  weeklyPeriodLabel,
  withRetry,
} from "@/lib/services/documentService";

const loadData = loadWeeklyReportDocumentData as jest.Mock;
const render = renderHtmlToPdf as jest.Mock;
const upload = uploadPdfBuffer as jest.Mock;
const noSleep = jest.fn().mockResolvedValue(undefined);

const submitted = {
  weeklyReportId: "wr-1",
  studentProfileId: "p-1",
  referenceCode: "WR-20261005-ABCD1234",
  submittedAt: new Date("2026-10-12T02:00:00Z"),
  reasonForDelay: null,
  weekStart: new Date("2026-10-05T00:00:00Z"),
  weekEnd: new Date("2026-10-11T00:00:00Z"),
  dueDate: new Date("2026-10-13T00:00:00Z"),
  student: {
    email: "s@x",
    studentNumber: "1",
    program: "BSIT",
    positionTitle: null,
    requiredHours: 600,
  },
  company: null,
  entries: [],
  totals: { totalHours: 0, runningTotal: 0, remainingHours: 600 },
};

beforeEach(() => {
  resetPrismaMock();
  jest.clearAllMocks();
  jest.spyOn(console, "error").mockImplementation(() => {});
});

describe("withRetry", () => {
  it("retries up to 3 times with 1s/2s/4s backoff, then rethrows", async () => {
    const fn = jest.fn().mockRejectedValue(new Error("boom"));
    await expect(withRetry(fn, { sleep: noSleep })).rejects.toThrow("boom");
    expect(fn).toHaveBeenCalledTimes(4);
    expect(noSleep.mock.calls.map(([ms]) => ms)).toEqual([1000, 2000, 4000]);
  });

  it("returns as soon as an attempt succeeds", async () => {
    const fn = jest.fn().mockRejectedValueOnce(new Error("cold start")).mockResolvedValue("ok");
    await expect(withRetry(fn, { sleep: noSleep })).resolves.toBe("ok");
    expect(fn).toHaveBeenCalledTimes(2);
  });
});

describe("generateWeeklyReportPdf", () => {
  it("refuses a report that has not been submitted (FR-DG-05)", async () => {
    loadData.mockResolvedValue({ ...submitted, referenceCode: null, submittedAt: null });
    await expect(generateWeeklyReportPdf("wr-1", "u-1", { sleep: noSleep })).rejects.toThrow(
      DocumentNotReadyError
    );
    expect(prismaMock.generatedDocument.create).not.toHaveBeenCalled();
  });

  it("creates the row, renders, uploads, and marks GENERATED", async () => {
    loadData.mockResolvedValue(submitted);
    prismaMock.generatedDocument.findFirst.mockResolvedValue(null);
    prismaMock.generatedDocument.create.mockResolvedValue({ id: "doc-1" } as never);
    render.mockResolvedValue(Buffer.from("%PDF"));
    upload.mockResolvedValue("weekly/p-1/wr-1.pdf");

    const result = await generateWeeklyReportPdf("wr-1", "u-1", { sleep: noSleep });

    expect(result).toEqual({ generatedDocumentId: "doc-1", status: DocumentStatus.GENERATED });
    expect(prismaMock.generatedDocument.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        studentProfileId: "p-1",
        documentType: DocumentType.WEEKLY_REPORT,
        periodLabel: "2026-10-05",
        referenceCode: "WR-20261005-ABCD1234",
        status: DocumentStatus.PENDING_DRAFT,
      }),
    });
    expect(upload).toHaveBeenCalledWith(
      "generated-documents",
      "weekly/p-1/wr-1.pdf",
      expect.any(Buffer)
    );
    expect(prismaMock.generatedDocument.update).toHaveBeenLastCalledWith({
      where: { id: "doc-1" },
      data: expect.objectContaining({
        status: DocumentStatus.GENERATED,
        fileUrl: "weekly/p-1/wr-1.pdf",
        generatedAt: expect.any(Date),
      }),
    });
  });

  it("reuses the existing row for the same week and updates its reference code", async () => {
    loadData.mockResolvedValue({ ...submitted, referenceCode: "WR-20261005-NEWCODE1" });
    prismaMock.generatedDocument.findFirst.mockResolvedValue({ id: "doc-1" } as never);
    render.mockResolvedValue(Buffer.from("%PDF"));
    upload.mockResolvedValue("weekly/p-1/wr-1.pdf");

    await generateWeeklyReportPdf("wr-1", "u-1", { sleep: noSleep });

    expect(prismaMock.generatedDocument.create).not.toHaveBeenCalled();
    expect(prismaMock.generatedDocument.update).toHaveBeenCalledWith({
      where: { id: "doc-1" },
      data: expect.objectContaining({
        referenceCode: "WR-20261005-NEWCODE1",
        status: DocumentStatus.PENDING_DRAFT,
      }),
    });
  });

  it("marks FAILED after 4 attempts, logs, and does not throw (FR-DG-07)", async () => {
    loadData.mockResolvedValue(submitted);
    prismaMock.generatedDocument.findFirst.mockResolvedValue(null);
    prismaMock.generatedDocument.create.mockResolvedValue({ id: "doc-1" } as never);
    render.mockRejectedValue(new Error("Failed to launch the browser process"));

    const result = await generateWeeklyReportPdf("wr-1", "u-1", { sleep: noSleep });

    expect(result).toEqual({ generatedDocumentId: "doc-1", status: DocumentStatus.FAILED });
    expect(render).toHaveBeenCalledTimes(4);
    expect(prismaMock.generatedDocument.update).toHaveBeenLastCalledWith({
      where: { id: "doc-1" },
      data: { status: DocumentStatus.FAILED },
    });
    expect(prismaMock.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: "DOCUMENT_GENERATION_FAILED" }),
      })
    );
    expect(console.error).toHaveBeenCalled();
  });
});

describe("weeklyPeriodLabel", () => {
  it("is the YYYY-MM-DD week start", () => {
    expect(weeklyPeriodLabel(new Date("2026-10-05T00:00:00Z"))).toBe("2026-10-05");
  });
});
