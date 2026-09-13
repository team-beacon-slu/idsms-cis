import { DocumentStatus, DocumentType } from "@prisma/client";
import { prismaMock, resetPrismaMock } from "@/testUtils/prismaMock";
import {
  checkMonthlyAggregationEligibility,
  listMonthlyReportsForStudent,
  submitMonthlyReport,
} from "@/lib/services/monthlyReportService";

beforeEach(() => resetPrismaMock());

describe("monthlyReportService stubs — reachable and wired correctly", () => {
  // TODO(JayPing23): replace each of these placeholder-return assertions
  // once the real logic behind it lands.
  it("checkMonthlyAggregationEligibility resolves false", async () => {
    await expect(checkMonthlyAggregationEligibility("profile-1", "2026-08")).resolves.toBe(false);
  });

  it("listMonthlyReportsForStudent calls prisma with the right filter", async () => {
    prismaMock.generatedDocument.findMany.mockResolvedValue([] as never);
    await listMonthlyReportsForStudent("profile-1");
    expect(prismaMock.generatedDocument.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ studentProfileId: "profile-1" }) })
    );
  });
});

describe("submitMonthlyReport", () => {
  it("creates a PENDING_DRAFT MONTHLY_REPORT and logs the submission", async () => {
    prismaMock.generatedDocument.findFirst.mockResolvedValue(null);
    prismaMock.generatedDocument.create.mockResolvedValue({ id: "doc-1" } as never);

    const result = await submitMonthlyReport("profile-1", "2026-08", "actor-1", "1.2.3.4");

    expect(result).toEqual({ generatedDocumentId: "doc-1", calendarMonth: "2026-08" });
    expect(prismaMock.generatedDocument.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          studentProfileId: "profile-1",
          documentType: DocumentType.MONTHLY_REPORT,
          periodLabel: "2026-08",
        },
      })
    );
    expect(prismaMock.generatedDocument.create).toHaveBeenCalledWith({
      data: {
        studentProfileId: "profile-1",
        documentType: DocumentType.MONTHLY_REPORT,
        status: DocumentStatus.PENDING_DRAFT,
        periodLabel: "2026-08",
      },
    });
    expect(prismaMock.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId: "actor-1",
          action: "MONTHLY_REPORT_SUBMITTED",
          entityType: "GeneratedDocument",
          entityId: "doc-1",
          ipAddress: "1.2.3.4",
        }),
      })
    );
  });

  it("is idempotent: returns the existing row instead of creating a duplicate", async () => {
    prismaMock.generatedDocument.findFirst.mockResolvedValue({ id: "existing-doc" } as never);

    const result = await submitMonthlyReport("profile-1", "2026-08", "actor-1");

    expect(result).toEqual({ generatedDocumentId: "existing-doc", calendarMonth: "2026-08" });
    expect(prismaMock.generatedDocument.create).not.toHaveBeenCalled();
    expect(prismaMock.auditLog.create).not.toHaveBeenCalled();
  });
});
