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
