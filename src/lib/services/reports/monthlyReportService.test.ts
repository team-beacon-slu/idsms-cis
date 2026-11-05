import { DocumentStatus, DocumentType, WeeklyReportStatus } from "@prisma/client";
import { prismaMock, resetPrismaMock } from "@/testUtils/prismaMock";
import {
  checkMonthlyAggregationEligibility,
  LearningJournalError,
  listMonthlyReportsForStudent,
  saveLearningJournal,
  submitMonthlyReport,
} from "@/lib/services/reports/monthlyReportService";

beforeEach(() => resetPrismaMock());

describe("monthlyReportService — reachable and wired correctly", () => {
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
    prismaMock.learningJournal.findUnique.mockResolvedValue({
      narrative: "x".repeat(200),
    } as never);
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

describe("the Journal on Learning Experience", () => {
  it("refuses to submit a month whose journal is missing or too short", async () => {
    prismaMock.generatedDocument.findFirst.mockResolvedValue(null);
    prismaMock.learningJournal.findUnique.mockResolvedValue({ narrative: "  short  " } as never);
    await expect(submitMonthlyReport("profile-1", "2026-08", "actor-1")).rejects.toThrow(
      LearningJournalError
    );
    prismaMock.learningJournal.findUnique.mockResolvedValue(null);
    await expect(submitMonthlyReport("profile-1", "2026-08", "actor-1")).rejects.toThrow(
      /Journal on Learning Experience/
    );
    expect(prismaMock.generatedDocument.create).not.toHaveBeenCalled();
  });

  it("saves the narrative and the office until the month is submitted", async () => {
    prismaMock.generatedDocument.findFirst.mockResolvedValue(null);
    await saveLearningJournal("profile-1", "2026-08", { narrative: "I learned.", office: "IT" });
    expect(prismaMock.learningJournal.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { studentProfileId_month: { studentProfileId: "profile-1", month: "2026-08" } },
        update: { narrative: "I learned." },
      })
    );
    expect(prismaMock.studentProfile.update).toHaveBeenCalledWith({
      where: { id: "profile-1" },
      data: { office: "IT" },
    });

    prismaMock.generatedDocument.findFirst.mockResolvedValue({ id: "doc-1" } as never);
    await expect(
      saveLearningJournal("profile-1", "2026-08", { narrative: "late edit", office: "IT" })
    ).rejects.toThrow("already submitted");
  });
});

// A weekly report row for the Monday `monday` (YYYY-MM-DD).
const week = (monday: string, status: WeeklyReportStatus = WeeklyReportStatus.APPROVED) => {
  const weekStart = new Date(`${monday}T00:00:00.000Z`);
  return { weekStart, weekEnd: new Date(weekStart.getTime() + 6 * 86_400_000), status };
};

describe("checkMonthlyAggregationEligibility", () => {
  // Oct 7 2026, 09:00 Manila: October is still under way.
  const midOctober = new Date("2026-10-07T01:00:00Z");
  const octoberWeeks = [week("2026-09-28"), week("2026-10-05")];

  it("returns false for the current month while the intern still owes hours", async () => {
    prismaMock.weeklyReport.findMany.mockResolvedValue(octoberWeeks as never);
    prismaMock.studentProfile.findUnique.mockResolvedValue({
      renderedHours: 80,
      requiredHours: 486,
    } as never);

    await expect(
      checkMonthlyAggregationEligibility("profile-1", "2026-10", midOctober)
    ).resolves.toBe(false);
  });

  it("allows the current month once the intern has finished their hours", async () => {
    prismaMock.weeklyReport.findMany.mockResolvedValue(octoberWeeks as never);
    prismaMock.studentProfile.findUnique.mockResolvedValue({
      renderedHours: 486,
      requiredHours: 486,
    } as never);

    await expect(
      checkMonthlyAggregationEligibility("profile-1", "2026-10", midOctober)
    ).resolves.toBe(true);
  });

  it("returns false when no weekly reports overlap the calendar month", async () => {
    prismaMock.weeklyReport.findMany.mockResolvedValue([week("2026-06-01")] as never);

    await expect(checkMonthlyAggregationEligibility("profile-1", "2026-08")).resolves.toBe(false);
    expect(prismaMock.weeklyReport.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { studentProfileId: "profile-1" } })
    );
  });

  it("returns true when every overlapping report is APPROVED or REGARDED", async () => {
    prismaMock.weeklyReport.findMany.mockResolvedValue([
      week("2026-08-03"),
      week("2026-08-10", WeeklyReportStatus.REGARDED),
    ] as never);

    await expect(checkMonthlyAggregationEligibility("profile-1", "2026-08")).resolves.toBe(true);
  });

  it("returns false when any overlapping report is still PENDING/RETURNED", async () => {
    prismaMock.weeklyReport.findMany.mockResolvedValue([
      week("2026-08-03"),
      week("2026-08-10", WeeklyReportStatus.PENDING),
    ] as never);

    await expect(checkMonthlyAggregationEligibility("profile-1", "2026-08")).resolves.toBe(false);
  });

  it("returns false when a week inside the month has no report at all", async () => {
    // Aug 10 was never started: approving the weeks around it must not unlock August.
    prismaMock.weeklyReport.findMany.mockResolvedValue([
      week("2026-08-03"),
      week("2026-08-17"),
    ] as never);

    await expect(checkMonthlyAggregationEligibility("profile-1", "2026-08")).resolves.toBe(false);
  });

  it("ignores a missing week that falls in another month", async () => {
    // Jul 13 is missing, but it ends Jul 19 and so only blocks July.
    prismaMock.weeklyReport.findMany.mockResolvedValue([
      week("2026-07-06"),
      week("2026-07-20"),
      week("2026-07-27"),
      week("2026-08-03"),
      week("2026-08-10"),
    ] as never);

    await expect(checkMonthlyAggregationEligibility("profile-1", "2026-08")).resolves.toBe(true);
  });

  it("counts a missing week that straddles into the month", async () => {
    // Jul 27 – Aug 2 has no report and overlaps August.
    prismaMock.weeklyReport.findMany.mockResolvedValue([
      week("2026-07-20"),
      week("2026-08-03"),
    ] as never);

    await expect(checkMonthlyAggregationEligibility("profile-1", "2026-08")).resolves.toBe(false);
  });
});
