import { DocumentStatus, DocumentType } from "@prisma/client";
import { prismaMock, resetPrismaMock } from "@/testUtils/prismaMock";

jest.mock("@/lib/documents/weeklyReportData", () => ({ loadWeeklyReportDocumentData: jest.fn() }));
jest.mock("@/lib/documents/monthlyReportData", () => ({
  loadMonthlyReportDocumentData: jest.fn(),
}));
jest.mock("@/lib/pdf/renderHtmlToPdf", () => ({ renderHtmlToPdf: jest.fn() }));
jest.mock("@/lib/services/checklistService", () => {
  class ChecklistGateError extends Error {}
  return { ChecklistGateError, isEndorsementGateSatisfied: jest.fn() };
});
jest.mock("@/lib/documents/endorsementLetterData", () => ({
  loadEndorsementLetterData: jest.fn(),
  EndorsementDataIncompleteError: class extends Error {},
}));
jest.mock("@/lib/storage", () => {
  class PdfTooLargeError extends Error {}
  return {
    GENERATED_DOCUMENTS_BUCKET: "generated-documents",
    PdfTooLargeError,
    uploadPdfBuffer: jest.fn(),
    getSignedUrl: jest.fn(),
  };
});

import { loadWeeklyReportDocumentData } from "@/lib/documents/weeklyReportData";
import { loadMonthlyReportDocumentData } from "@/lib/documents/monthlyReportData";
import { renderHtmlToPdf } from "@/lib/pdf/renderHtmlToPdf";
import { PdfTooLargeError, uploadPdfBuffer } from "@/lib/storage";
import {
  DocumentNotReadyError,
  generateMonthlyReportPdf,
  generateMonthlyReportReferenceCode,
  generateWeeklyReportPdf,
  renderAndStoreDocument,
  getWeeklyReportDocument,
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
describe("generateMonthlyReportPdf", () => {
  const loadMonthly = loadMonthlyReportDocumentData as jest.Mock;

  it("refuses a row that is not a MONTHLY_REPORT", async () => {
    prismaMock.generatedDocument.findUnique.mockResolvedValue({
      id: "doc-w",
      documentType: DocumentType.WEEKLY_REPORT,
    } as never);
    await expect(generateMonthlyReportPdf("doc-w", "u-1", { sleep: noSleep })).rejects.toThrow(
      DocumentNotReadyError
    );
  });

  it("assigns a reference code once, then renders and marks GENERATED", async () => {
    prismaMock.generatedDocument.findUnique.mockResolvedValue({
      id: "doc-m",
      documentType: DocumentType.MONTHLY_REPORT,
      periodLabel: "2026-09",
      referenceCode: null,
      studentProfileId: "p-1",
    } as never);
    // Complete data: the real monthly template renders it inside the retry loop.
    loadMonthly.mockResolvedValue({
      generatedDocumentId: "doc-m",
      studentProfileId: "p-1",
      calendarMonth: "2026-09",
      referenceCode: "MR-202609-ABCD1234",
      generatedAt: new Date("2026-10-11T02:00:00Z"),
      student: submitted.student,
      company: null,
      weeks: [],
      approvedHours: 0,
    });
    render.mockResolvedValue(Buffer.from("%PDF"));
    upload.mockResolvedValue("monthly/p-1/2026-09.pdf");

    const result = await generateMonthlyReportPdf("doc-m", "u-1", { sleep: noSleep });

    expect(result.status).toBe(DocumentStatus.GENERATED);
    expect(loadMonthly).toHaveBeenCalledWith(
      "doc-m",
      expect.stringMatching(/^MR-202609-[0-9A-F]{8}$/)
    );
    expect(upload).toHaveBeenCalledWith(
      "generated-documents",
      "monthly/p-1/2026-09.pdf",
      expect.any(Buffer)
    );
  });
});

describe("generateMonthlyReportReferenceCode", () => {
  it("is MR-<YYYYMM>-<8 hex>", () => {
    expect(generateMonthlyReportReferenceCode("2026-09")).toMatch(/^MR-202609-[0-9A-F]{8}$/);
  });
});

// Final-review fix pass: retry policy, deadline, guarded bookkeeping,
// monthly not-ready, stale-document detection.
describe("withRetry failure policy", () => {
  it("does not retry a non-retryable error (not-ready, oversized PDF)", async () => {
    const notReady = jest.fn().mockRejectedValue(new DocumentNotReadyError());
    await expect(withRetry(notReady, { sleep: noSleep })).rejects.toThrow(DocumentNotReadyError);
    expect(notReady).toHaveBeenCalledTimes(1);

    const tooBig = jest.fn().mockRejectedValue(new PdfTooLargeError("too big"));
    await expect(withRetry(tooBig, { sleep: noSleep })).rejects.toThrow("too big");
    expect(tooBig).toHaveBeenCalledTimes(1);
  });

  it("stops retrying once the next attempt would start past the deadline", async () => {
    const fn = jest.fn().mockRejectedValue(new Error("Navigation timeout"));
    const clock = jest.fn().mockReturnValueOnce(0).mockReturnValue(59_500);
    await expect(withRetry(fn, { sleep: noSleep, deadlineMs: 60_000, now: clock })).rejects.toThrow(
      "Navigation timeout"
    );
    expect(fn).toHaveBeenCalledTimes(1);
    expect(noSleep).not.toHaveBeenCalled();
  });
});

describe("generation bookkeeping failures", () => {
  it("still reports FAILED when marking the row FAILED throws", async () => {
    loadData.mockResolvedValue(submitted);
    prismaMock.generatedDocument.findFirst.mockResolvedValue({ id: "doc-1" } as never);
    render.mockRejectedValue(new Error("Failed to launch the browser process"));
    prismaMock.generatedDocument.update
      .mockResolvedValueOnce({} as never) // PENDING_DRAFT
      .mockRejectedValueOnce(new Error("Connection pool timeout")); // FAILED

    const result = await generateWeeklyReportPdf("wr-1", "u-1", { sleep: noSleep });

    expect(result).toEqual({ generatedDocumentId: "doc-1", status: DocumentStatus.FAILED });
    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining("bookkeeping"),
      expect.objectContaining({ documentId: "doc-1" })
    );
  });

  it("returns GENERATED when only the audit log write fails", async () => {
    loadData.mockResolvedValue(submitted);
    prismaMock.generatedDocument.findFirst.mockResolvedValue({ id: "doc-1" } as never);
    render.mockResolvedValue(Buffer.from("%PDF"));
    upload.mockResolvedValue("weekly/p-1/wr-1.pdf");
    prismaMock.auditLog.create.mockRejectedValue(new Error("audit insert failed"));

    const result = await generateWeeklyReportPdf("wr-1", "u-1", { sleep: noSleep });

    expect(result.status).toBe(DocumentStatus.GENERATED);
  });

  it("refuses a monthly report whose data is gone, without rendering or retrying", async () => {
    prismaMock.generatedDocument.findUnique.mockResolvedValue({
      id: "doc-m",
      documentType: DocumentType.MONTHLY_REPORT,
      periodLabel: "2026-09",
      referenceCode: "MR-202609-ABCD1234",
      studentProfileId: "p-1",
    } as never);
    (loadMonthlyReportDocumentData as jest.Mock).mockResolvedValue(null);

    await expect(generateMonthlyReportPdf("doc-m", "u-1", { sleep: noSleep })).rejects.toThrow(
      DocumentNotReadyError
    );
    expect(render).not.toHaveBeenCalled();
  });
});

describe("getWeeklyReportDocument", () => {
  const confirmedReport = {
    studentProfileId: "p-1",
    weekStart: new Date("2026-10-05T00:00:00Z"),
    status: "PENDING",
    revisionHistory: [
      { type: "SUBMITTED", timestamp: "2026-10-12T02:00:00.000Z", referenceCode: "WR-NEW" },
    ],
  };

  it("treats a PDF carrying an older submission's reference code as not generated", async () => {
    prismaMock.weeklyReport.findUnique.mockResolvedValue(confirmedReport as never);
    prismaMock.generatedDocument.findFirst.mockResolvedValue({
      id: "doc-1",
      referenceCode: "WR-OLD",
      status: DocumentStatus.GENERATED,
    } as never);
    await expect(getWeeklyReportDocument("wr-1")).resolves.toBeNull();
  });

  it("returns the document when it matches the current submission", async () => {
    prismaMock.weeklyReport.findUnique.mockResolvedValue(confirmedReport as never);
    const doc = { id: "doc-1", referenceCode: "WR-NEW", status: DocumentStatus.GENERATED };
    prismaMock.generatedDocument.findFirst.mockResolvedValue(doc as never);
    await expect(getWeeklyReportDocument("wr-1")).resolves.toEqual(doc);
  });
});

describe("renderAndStoreDocument", () => {
  it("rebuilds the HTML on each retry attempt and marks GENERATED on success", async () => {
    const buildHtml = jest.fn().mockResolvedValue("<p>x</p>");
    render.mockRejectedValueOnce(new Error("cold start")).mockResolvedValue(Buffer.from("%PDF"));
    upload.mockResolvedValue("endorsement/p-1.pdf");

    const status = await renderAndStoreDocument({
      documentId: "doc-1",
      path: "endorsement/p-1.pdf",
      buildHtml,
      actingUserId: "u-1",
      sleep: noSleep,
    });

    expect(status).toBe(DocumentStatus.GENERATED);
    expect(buildHtml).toHaveBeenCalledTimes(2);
    expect(prismaMock.generatedDocument.update).toHaveBeenLastCalledWith({
      where: { id: "doc-1" },
      data: expect.objectContaining({
        status: DocumentStatus.GENERATED,
        fileUrl: "endorsement/p-1.pdf",
      }),
    });
  });
});
import { ChecklistGateError, isEndorsementGateSatisfied } from "@/lib/services/checklistService";
import { loadEndorsementLetterData } from "@/lib/documents/endorsementLetterData";
import {
  generateEndorsementLetterPdf,
  generateEndorsementReferenceCode,
} from "@/lib/services/documentService";

describe("generateEndorsementLetterPdf", () => {
  const gate = isEndorsementGateSatisfied as jest.Mock;
  const loadLetter = loadEndorsementLetterData as jest.Mock;

  it("refuses when the checklist gate is not satisfied (FR-CK-04)", async () => {
    gate.mockResolvedValue(false);
    await expect(
      generateEndorsementLetterPdf("p-1", "coord-1", { sleep: noSleep })
    ).rejects.toThrow(ChecklistGateError);
    expect(prismaMock.generatedDocument.create).not.toHaveBeenCalled();
    expect(render).not.toHaveBeenCalled();
  });

  it("validates FR-DG-01 data before touching the document row", async () => {
    gate.mockResolvedValue(true);
    loadLetter.mockRejectedValue(new Error("The student's full name is missing"));
    await expect(
      generateEndorsementLetterPdf("p-1", "coord-1", { sleep: noSleep })
    ).rejects.toThrow(/full name/);
    expect(prismaMock.generatedDocument.update).not.toHaveBeenCalled();
  });

  it("reuses the FR-WP-05 queued row, assigns a code once, and generates", async () => {
    gate.mockResolvedValue(true);
    // Complete letter data: the real template renders it inside the retry loop.
    loadLetter.mockResolvedValue({
      studentProfileId: "p-1",
      referenceCode: "EL-20261011-ABCD1234",
      endorsementDate: new Date("2026-10-11T00:00:00Z"),
      student: {
        fullName: "Juan Dela Cruz",
        studentNumber: "1",
        program: "BSIT",
        positionTitle: null,
        requiredHours: 600,
      },
      company: {
        name: "Acme",
        address: "Baguio",
        supervisorName: "Maria",
        supervisorPosition: null,
      },
    });
    prismaMock.generatedDocument.findFirst.mockResolvedValue({
      id: "doc-el",
      referenceCode: null,
    } as never);
    render.mockResolvedValue(Buffer.from("%PDF"));
    upload.mockResolvedValue("endorsement/p-1.pdf");

    const result = await generateEndorsementLetterPdf("p-1", "coord-1", { sleep: noSleep });

    expect(result).toEqual({ generatedDocumentId: "doc-el", status: DocumentStatus.GENERATED });
    expect(prismaMock.generatedDocument.update).toHaveBeenCalledWith({
      where: { id: "doc-el" },
      data: expect.objectContaining({
        referenceCode: expect.stringMatching(/^EL-\d{8}-[0-9A-F]{8}$/),
      }),
    });
    expect(upload).toHaveBeenCalledWith(
      "generated-documents",
      "endorsement/p-1.pdf",
      expect.any(Buffer)
    );
  });
});

describe("generateEndorsementReferenceCode", () => {
  it("is EL-<YYYYMMDD>-<8 hex>", () => {
    expect(generateEndorsementReferenceCode(new Date("2026-10-11T03:00:00Z"))).toMatch(
      /^EL-20261011-[0-9A-F]{8}$/
    );
  });
});
