import { WeeklyReportStatus } from "@prisma/client";
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
  it("submitMonthlyReport echoes its calendarMonth", async () => {
    const result = await submitMonthlyReport("profile-1", "2026-08", "actor-1");
    expect(result.calendarMonth).toBe("2026-08");
  });

  it("listMonthlyReportsForStudent calls prisma with the right filter", async () => {
    prismaMock.generatedDocument.findMany.mockResolvedValue([] as never);
    await listMonthlyReportsForStudent("profile-1");
    expect(prismaMock.generatedDocument.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ studentProfileId: "profile-1" }) })
    );
  });
});

describe("checkMonthlyAggregationEligibility", () => {
  it("returns false when no weekly reports overlap the calendar month", async () => {
    prismaMock.weeklyReport.findMany.mockResolvedValue([] as never);

    await expect(checkMonthlyAggregationEligibility("profile-1", "2026-08")).resolves.toBe(false);
    expect(prismaMock.weeklyReport.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          studentProfileId: "profile-1",
          weekStart: { lte: new Date("2026-08-31T23:59:59.999Z") },
          weekEnd: { gte: new Date("2026-08-01T00:00:00.000Z") },
        },
      })
    );
  });

  it("returns true when every overlapping report is APPROVED or REGARDED", async () => {
    prismaMock.weeklyReport.findMany.mockResolvedValue([
      { status: WeeklyReportStatus.APPROVED },
      { status: WeeklyReportStatus.REGARDED },
    ] as never);

    await expect(checkMonthlyAggregationEligibility("profile-1", "2026-08")).resolves.toBe(true);
  });

  it("returns false when any overlapping report is still PENDING/RETURNED", async () => {
    prismaMock.weeklyReport.findMany.mockResolvedValue([
      { status: WeeklyReportStatus.APPROVED },
      { status: WeeklyReportStatus.PENDING },
    ] as never);

    await expect(checkMonthlyAggregationEligibility("profile-1", "2026-08")).resolves.toBe(false);
  });
});
