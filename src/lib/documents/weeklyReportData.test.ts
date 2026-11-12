import { prismaMock, resetPrismaMock } from "@/testUtils/prismaMock";
import { loadWeeklyReportDocumentData } from "@/lib/documents/weeklyReportData";

beforeEach(() => {
  resetPrismaMock();
  prismaMock.deviationReport.findMany.mockResolvedValue([] as never);
  prismaMock.weeklyReport.findFirst.mockResolvedValue({
    weekStart: new Date("2026-09-21T00:00:00Z"),
  } as never);
});

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
      attendanceStatus: "PRESENT",
      timeIn: "08:00",
      timeOut: "17:00",
    },
  ],
  studentProfile: {
    studentNumber: "2026-00123-MN-0",
    program: "BSIT",
    positionTitle: null,
    requiredHours: 600,
    fullName: null,
    user: { email: "juan.delacruz@slu.edu.ph" },
    company: null,
    semester: { weekOneStart: null },
  },
};

describe("SLU Weekly Work Report fields", () => {
  it("numbers the week from the intern's own first report, not the term's Week 1", async () => {
    prismaMock.weeklyReport.findUnique.mockResolvedValue({
      ...row,
      studentProfile: {
        ...row.studentProfile,
        semester: { weekOneStart: new Date("2026-08-10T00:00:00Z") }, // the class is at week 9
      },
    } as never);
    const data = await loadWeeklyReportDocumentData("wr-1");
    expect(data!.weekNumber).toBe(3); // first report 2026-09-21, this one 2026-10-05
  });

  it("prints Week No. 1 for the week the intern started, whenever in the term that is", async () => {
    prismaMock.weeklyReport.findFirst.mockResolvedValue({ weekStart: row.weekStart } as never);
    prismaMock.weeklyReport.findUnique.mockResolvedValue(row as never);
    expect((await loadWeeklyReportDocumentData("wr-1"))!.weekNumber).toBe(1);
  });

  it("carries the week's overtime, under time and absence sections, only those it has", async () => {
    prismaMock.weeklyReport.findUnique.mockResolvedValue(row as never);
    prismaMock.studentProfile.findUnique.mockResolvedValue(row.studentProfile as never);
    prismaMock.weeklyReport.findFirst.mockResolvedValue({
      weekStart: row.weekStart,
      weekEnd: row.weekEnd,
    } as never);
    prismaMock.dailyReportEntry.findMany.mockResolvedValue([]);
    prismaMock.deviationReport.findMany.mockImplementation(((args: {
      where: { deviationType: string };
    }) =>
      Promise.resolve(
        args.where.deviationType === "OVERTIME"
          ? [
              {
                date: new Date("2026-10-05T00:00:00Z"),
                endDate: null,
                startTime: "17:00",
                endTime: "19:00",
                requestedMinutes: 120,
                reason: "Finished the client deployment",
                requestKind: null,
                proofType: null,
                validationStatus: "VALIDATED",
              },
            ]
          : []
      )) as never);
    const data = (await loadWeeklyReportDocumentData("wr-1"))!;
    expect(data.timeReports?.map((t) => [t.kind, t.week])).toEqual([["OT", "IN_WEEKLY_REPORT"]]);
  });

  it("uses the full name as entered, else a name from the school email", async () => {
    prismaMock.weeklyReport.findUnique.mockResolvedValue(row as never);
    expect((await loadWeeklyReportDocumentData("wr-1"))!.student.name).toBe("Delacruz, Juan");

    prismaMock.weeklyReport.findUnique.mockResolvedValue({
      ...row,
      studentProfile: { ...row.studentProfile, fullName: "Dela Cruz, Juan P." },
    } as never);
    expect((await loadWeeklyReportDocumentData("wr-1"))!.student.name).toBe("Dela Cruz, Juan P.");
  });

  it("computes beginning and ending, with beginning + this week = ending", async () => {
    prismaMock.weeklyReport.findUnique.mockResolvedValue(row as never);
    const { totals } = (await loadWeeklyReportDocumentData("wr-1"))!;
    expect(totals.beginning).toBe(40);
    expect(totals.ending).toBe(48);
    expect(totals.beginning + totals.totalHours).toBe(totals.ending);
  });

  it("credits each day by SLU rules and leaves OT and UT to their own reports", async () => {
    prismaMock.weeklyReport.findUnique.mockResolvedValue({
      ...row,
      dailyEntries: [
        { ...row.dailyEntries[0], actualHours: 9, scheduledHours: 8, creditedHours: null },
      ],
    } as never);
    const data = (await loadWeeklyReportDocumentData("wr-1"))!;

    expect(data.entries[0].creditedHours).toBe(8);
    expect(prismaMock.deviationReport.findMany).not.toHaveBeenCalled();
  });
});

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
        totals: {
          totalHours: 8,
          runningTotal: 48,
          conductDeductions: 0,
          remainingHours: 552,
          beginning: 40,
          ending: 48,
        },
      })
    );
    expect(data!.entries[0]).toEqual(
      expect.objectContaining({
        actualHours: 8,
        attendanceStatus: "PRESENT",
        timeIn: "08:00",
        timeOut: "17:00",
      })
    );
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
