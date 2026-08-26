import { WeeklyReportStatus } from "@prisma/client";
import { prismaMock, resetPrismaMock } from "@/testUtils/prismaMock";
import {
  calculateRunningTotalAndRemaining,
  calculateWeeklyTotalHours,
  generateReportPdfPreview,
  generateReportReferenceCode,
  generateWeeklyReportForm,
  getDailyReportEntryWeeklyReportId,
  getWeeklyReport,
  listWeeklyReportsForStudent,
  reviewWeeklyReport_Approve,
  reviewWeeklyReport_Disregard,
  reviewWeeklyReport_Regard,
  reviewWeeklyReport_Return,
  saveDailyAccomplishment,
  validateLateSubmissionReason,
} from "@/lib/services/weeklyReportService";

beforeEach(() => resetPrismaMock());

describe("weeklyReportService stubs — reachable and wired correctly", () => {
  // TODO(JayPing23): replace each of these placeholder-return assertions
  // once the real logic behind it lands (see PHASE3_TASKS.md for owners).
  it("generateWeeklyReportForm resolves a week range", async () => {
    const weekStart = new Date("2026-08-24");
    const result = await generateWeeklyReportForm("profile-1", weekStart);
    expect(result.weekStart).toEqual(weekStart);
    expect(result.weekEnd.getTime()).toBeGreaterThan(weekStart.getTime());
  });

  it("calculateWeeklyTotalHours resolves a number", async () => {
    await expect(calculateWeeklyTotalHours("wr-1")).resolves.toBe(0);
  });

  it("calculateRunningTotalAndRemaining resolves a shape", async () => {
    const result = await calculateRunningTotalAndRemaining("profile-1", "wr-1");
    expect(result).toEqual({ runningTotal: 0, remainingHours: 0 });
  });

  it("saveDailyAccomplishment echoes its input", async () => {
    const result = await saveDailyAccomplishment("entry-1", 8, "Fixed a bug", "student-1");
    expect(result.hours).toBe(8);
  });

  it("validateLateSubmissionReason resolves without throwing", async () => {
    await expect(validateLateSubmissionReason("wr-1", "Power outage")).resolves.toBeUndefined();
  });

  it("reviewWeeklyReport_Approve resolves without throwing", async () => {
    const result = await reviewWeeklyReport_Approve("wr-1", "faculty-1");
    expect(result.id).toBe("wr-1");
  });

  it("reviewWeeklyReport_Return resolves without throwing", async () => {
    const result = await reviewWeeklyReport_Return("wr-1", "faculty-1", "Missing Tuesday entry");
    expect(result.status).toBe(WeeklyReportStatus.PENDING);
  });

  it("reviewWeeklyReport_Regard resolves without throwing", async () => {
    const result = await reviewWeeklyReport_Regard("wr-1", "faculty-1");
    expect(result.id).toBe("wr-1");
  });

  it("reviewWeeklyReport_Disregard resolves without throwing", async () => {
    const result = await reviewWeeklyReport_Disregard("wr-1", "faculty-1");
    expect(result.id).toBe("wr-1");
  });

  it("generateReportPdfPreview resolves a null preview", async () => {
    await expect(generateReportPdfPreview("wr-1")).resolves.toEqual({ previewUrl: null });
  });

  it("generateReportReferenceCode resolves a shape", async () => {
    const result = await generateReportReferenceCode("wr-1");
    expect(result.timestamp).toBeInstanceOf(Date);
  });

  it("listWeeklyReportsForStudent calls prisma with the right filter", async () => {
    prismaMock.weeklyReport.findMany.mockResolvedValue([] as never);
    await listWeeklyReportsForStudent("profile-1");
    expect(prismaMock.weeklyReport.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { studentProfileId: "profile-1" } })
    );
  });

  it("getWeeklyReport calls prisma with the right id", async () => {
    prismaMock.weeklyReport.findUnique.mockResolvedValue(null);
    await getWeeklyReport("wr-1");
    expect(prismaMock.weeklyReport.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "wr-1" } })
    );
  });

  it("getDailyReportEntryWeeklyReportId resolves the owning weekly report id", async () => {
    prismaMock.dailyReportEntry.findUniqueOrThrow.mockResolvedValue({
      weeklyReportId: "wr-1",
    } as never);
    const result = await getDailyReportEntryWeeklyReportId("entry-1");
    expect(result).toBe("wr-1");
    expect(prismaMock.dailyReportEntry.findUniqueOrThrow).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "entry-1" } })
    );
  });
});
