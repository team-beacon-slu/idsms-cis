import { prismaMock, resetPrismaMock } from "@/testUtils/prismaMock";
import { loadWeeklyReportDocumentData } from "@/lib/documents/weeklyReportData";

beforeEach(() => resetPrismaMock());

const row = {
  id: "wr-1",
  studentProfileId: "p-1",
  status: "PENDING",
  weekStart: new Date("2026-10-05T00:00:00Z"),
  weekEnd: new Date("2026-10-11T00:00:00Z"),
  totalHours: 8,
  runningTotal: 48,
  remainingHours: 552,
  revisionHistory: [
    {
      type: "SUBMITTED",
      timestamp: "2026-10-12T02:00:00.000Z",
      referenceCode: "WR-20261005-ABCD1234",
      late: false,
      reasonForDelay: null,
      submittedBy: "u-1",
    },
  ],
  dailyEntries: [
    {
      reportDate: new Date("2026-10-05T00:00:00Z"),
      actualHours: 8,
      accomplishments: "Built the login page",
      toolsUsed: null,
    },
  ],
  studentProfile: {
    studentNumber: "2026-00123-MN-0",
    program: "BSIT",
    positionTitle: null,
    requiredHours: 600,
    user: { email: "student.test@idsms.local" },
    company: null,
  },
};

describe("loadWeeklyReportDocumentData", () => {
  it("maps a submitted report into template data with the latest reference code", async () => {
    prismaMock.weeklyReport.findUnique.mockResolvedValue(row as never);

    const data = await loadWeeklyReportDocumentData("wr-1");

    expect(data).toEqual(
      expect.objectContaining({
        weeklyReportId: "wr-1",
        studentProfileId: "p-1",
        referenceCode: "WR-20261005-ABCD1234",
        submittedAt: new Date("2026-10-12T02:00:00.000Z"),
        dueDate: new Date("2026-10-13T00:00:00Z"),
        company: null,
        totals: { totalHours: 8, runningTotal: 48, remainingHours: 552 },
      })
    );
    expect(data!.entries[0]).toEqual(expect.objectContaining({ actualHours: 8 }));
  });

  it("returns referenceCode null for a returned report being revised (FR-DG-05)", async () => {
    prismaMock.weeklyReport.findUnique.mockResolvedValue({
      ...row,
      status: "RETURNED",
      revisionHistory: [
        ...row.revisionHistory,
        { type: "RETURNED", timestamp: "2026-10-13T02:00:00.000Z", notes: "Add details" },
      ],
    } as never);
    const data = await loadWeeklyReportDocumentData("wr-1");
    expect(data!.referenceCode).toBeNull();
    expect(data!.submittedAt).toBeNull();
  });

  it("returns referenceCode null for a draft (never submitted)", async () => {
    prismaMock.weeklyReport.findUnique.mockResolvedValue({ ...row, revisionHistory: [] } as never);
    const data = await loadWeeklyReportDocumentData("wr-1");
    expect(data!.referenceCode).toBeNull();
    expect(data!.submittedAt).toBeNull();
  });

  it("returns null for an unknown report", async () => {
    prismaMock.weeklyReport.findUnique.mockResolvedValue(null);
    await expect(loadWeeklyReportDocumentData("missing")).resolves.toBeNull();
  });
});
