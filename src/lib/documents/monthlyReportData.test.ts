import { prismaMock, resetPrismaMock } from "@/testUtils/prismaMock";
import { loadMonthlyReportDocumentData } from "@/lib/documents/monthlyReportData";

beforeEach(() => resetPrismaMock());

const day = (iso: string) => ({
  reportDate: new Date(`${iso}T00:00:00Z`),
  creditedHours: 8,
  actualHours: 8,
  scheduledHours: 8,
  attendanceStatus: "PRESENT",
});

it("counts only the days inside the month for a week that straddles two months", async () => {
  prismaMock.generatedDocument.findUnique.mockResolvedValue({
    id: "doc-1",
    periodLabel: "2026-07",
    studentProfileId: "p-1",
    studentProfile: {
      studentNumber: "2026-00123",
      program: "BSIT",
      positionTitle: null,
      requiredHours: 486,
      user: { email: "intern@slu.edu.ph" },
      company: null,
    },
  } as never);
  prismaMock.weeklyReport.findMany.mockResolvedValue([
    {
      weekStart: new Date("2026-06-29T00:00:00Z"),
      weekEnd: new Date("2026-07-05T00:00:00Z"),
      status: "APPROVED",
      totalHours: 40,
      dailyEntries: ["2026-06-29", "2026-06-30", "2026-07-01", "2026-07-02", "2026-07-03"].map(day),
    },
  ] as never);

  const data = await loadMonthlyReportDocumentData("doc-1", "MR-1");

  // Jul 1-3 at 8 hours each; the two June days belong to June's report.
  expect(data?.approvedHours).toBe(24);
});
