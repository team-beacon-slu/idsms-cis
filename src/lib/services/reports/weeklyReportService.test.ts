import { Role, WeeklyReportStatus } from "@prisma/client";
import { prismaMock, resetPrismaMock } from "@/testUtils/prismaMock";
import { ScheduleNotConfiguredError } from "@/lib/services/attendance/attendanceService";
import { ForbiddenError } from "@/lib/services/accounts/userService";
import {
  addDailyEntry,
  DailyEntryDateError,
  removeDailyEntry,
  isAwaitingReview,
  recomputeCreditedHours,
  isWeeklyReportEditable,
  LateSubmissionReasonRequiredError,
  recordWeeklyReportSubmission,
  WeeklyReportIncompleteError,
  WeeklyReportLockedError,
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
  reviewWeeklyReport_Return,
  saveDailyAccomplishment,
  validateLateSubmissionReason,
} from "@/lib/services/reports/weeklyReportService";

beforeEach(() => {
  resetPrismaMock();
  // Review actions require a submitted report awaiting review; tests that
  // need another state set their own.
  prismaMock.weeklyReport.findUniqueOrThrow.mockResolvedValue({
    status: WeeklyReportStatus.PENDING,
    revisionHistory: [{ type: "SUBMITTED", timestamp: "t0" }],
  } as never);
});

describe("reviewWeeklyReport_Return", () => {
  it.each([
    [[{ type: "SUBMITTED", timestamp: "2026-10-10", referenceCode: "WR-1" }]],
    [
      [
        { type: "SUBMITTED", timestamp: "2026-10-03", referenceCode: "WR-0" },
        { type: "RETURNED", timestamp: "2026-10-04", notes: "Fix" },
        { type: "SUBMITTED", timestamp: "2026-10-10", referenceCode: "WR-1" },
      ],
    ],
  ])(
    "preserves history %p and appends revision notes without recalculating hours",
    async (history) => {
      prismaMock.weeklyReport.findUniqueOrThrow.mockResolvedValue({
        status: WeeklyReportStatus.PENDING,
        revisionHistory: history,
      } as never);
      prismaMock.weeklyReport.update.mockResolvedValue({
        id: "wr-1",
        status: WeeklyReportStatus.RETURNED,
      } as never);
      await expect(
        reviewWeeklyReport_Return("wr-1", "faculty-1", "  Add Tuesday details  ", "127.0.0.1")
      ).resolves.toEqual({ id: "wr-1", status: WeeklyReportStatus.RETURNED });
      expect(prismaMock.weeklyReport.update).toHaveBeenCalledWith({
        where: { id: "wr-1" },
        data: {
          status: WeeklyReportStatus.RETURNED,
          facultyAction: "RETURNED by faculty-1",
          revisionHistory: [
            ...(history ?? []),
            {
              type: "RETURNED",
              timestamp: expect.any(String),
              facultyId: "faculty-1",
              notes: "Add Tuesday details",
            },
          ],
        },
        select: { id: true, status: true },
      });
      expect(prismaMock.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            userId: "faculty-1",
            entityId: "wr-1",
            ipAddress: "127.0.0.1",
          }),
        })
      );
      expect(prismaMock.studentProfile.update).not.toHaveBeenCalled();
      expect(prismaMock.dailyReportEntry.aggregate).not.toHaveBeenCalled();
    }
  );

  it.each(["", "   "])("rejects blank notes %p without changing the report", async (notes) => {
    await expect(reviewWeeklyReport_Return("wr-1", "faculty-1", notes)).rejects.toThrow(
      "Revision notes are required"
    );
    expect(prismaMock.weeklyReport.update).not.toHaveBeenCalled();
  });

  it("propagates missing reports without writing or logging", async () => {
    prismaMock.weeklyReport.findUniqueOrThrow.mockRejectedValue(new Error("Not found"));
    await expect(reviewWeeklyReport_Return("missing", "faculty-1", "Add detail")).rejects.toThrow(
      "Not found"
    );
    expect(prismaMock.weeklyReport.update).not.toHaveBeenCalled();
    expect(prismaMock.auditLog.create).not.toHaveBeenCalled();
  });
});

describe("weeklyReportService — reachable and wired correctly", () => {
  it("generateReportPdfPreview resolves a null preview for an unknown report", async () => {
    prismaMock.weeklyReport.findUnique.mockResolvedValue(null);
    await expect(generateReportPdfPreview("wr-1")).resolves.toEqual({ previewUrl: null });
  });

  it("generateReportPdfPreview points at the student's printable preview page", async () => {
    prismaMock.weeklyReport.findUnique.mockResolvedValue({
      studentProfileId: "profile-1",
    } as never);
    await expect(generateReportPdfPreview("wr-1")).resolves.toEqual({
      previewUrl: "/students/profile-1/weekly-reports/wr-1/preview",
    });
  });

  it("generateReportReferenceCode builds WR-<week start>-<random hex>", async () => {
    prismaMock.weeklyReport.findUniqueOrThrow.mockResolvedValue({
      weekStart: new Date("2026-10-05T00:00:00Z"),
    } as never);
    const first = await generateReportReferenceCode("wr-1");
    const second = await generateReportReferenceCode("wr-1");
    expect(first.referenceCode).toMatch(/^WR-20261005-[0-9A-F]{8}$/);
    expect(second.referenceCode).not.toBe(first.referenceCode);
    expect(first.timestamp).toBeInstanceOf(Date);
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

describe("generateWeeklyReportForm", () => {
  const approvedPlan = {
    id: "wp-1",
    scheduleConfig: { daysOfWeek: [1, 2, 3, 4, 5], hoursPerDay: 8 },
  };

  it("returns the existing report for that week instead of creating a duplicate", async () => {
    prismaMock.weeklyReport.findUnique.mockResolvedValue({ id: "wr-existing" } as never);

    const result = await generateWeeklyReportForm("profile-1", new Date("2026-10-07T00:00:00Z"));

    expect(result.weeklyReportId).toBe("wr-existing");
    expect(result.weekStart).toEqual(new Date("2026-10-05T00:00:00Z"));
    expect(result.weekEnd).toEqual(new Date("2026-10-11T00:00:00Z"));
    expect(prismaMock.weeklyReport.create).not.toHaveBeenCalled();
  });

  it("creates a 0-hour HOLIDAY row for an applicable holiday on a scheduled day", async () => {
    prismaMock.weeklyReport.findUnique.mockResolvedValue(null);
    prismaMock.workPlan.findFirst.mockResolvedValue(approvedPlan as never);
    prismaMock.studentProfile.findUnique.mockResolvedValue({ semesterId: "sem-1" } as never);
    prismaMock.holidayCalendarEntry.findMany
      .mockResolvedValueOnce([
        { id: "h-1", date: new Date("2026-10-07T00:00:00Z"), name: "Holiday" },
        // Saturday is not a scheduled day: no row.
        { id: "h-2", date: new Date("2026-10-10T00:00:00Z"), name: "Weekend holiday" },
      ] as never)
      .mockResolvedValueOnce([] as never);
    prismaMock.weeklyReport.create.mockResolvedValue({ id: "wr-new" } as never);

    await generateWeeklyReportForm("profile-1", new Date("2026-10-09T00:00:00Z"));

    const createArgs = prismaMock.weeklyReport.create.mock.calls[0][0] as {
      data: { dailyEntries: { create: Record<string, unknown>[] } };
    };
    expect(createArgs.data.dailyEntries.create).toHaveLength(5);
    expect(createArgs.data.dailyEntries.create[2]).toEqual({
      reportDate: new Date("2026-10-07T00:00:00Z"),
      attendanceStatus: "HOLIDAY",
      scheduledHours: 8,
      actualHours: 0,
    });
  });

  it("creates no row for a non-applicable holiday beyond the normal day", async () => {
    prismaMock.weeklyReport.findUnique.mockResolvedValue(null);
    prismaMock.workPlan.findFirst.mockResolvedValue(approvedPlan as never);
    prismaMock.studentProfile.findUnique.mockResolvedValue({ semesterId: "sem-1" } as never);
    prismaMock.holidayCalendarEntry.findMany
      .mockResolvedValueOnce([
        { id: "h-1", date: new Date("2026-10-07T00:00:00Z"), name: "Holiday" },
      ] as never)
      // the student marked it not applicable
      .mockResolvedValueOnce([{ date: new Date("2026-10-07T00:00:00Z") }] as never);
    prismaMock.weeklyReport.create.mockResolvedValue({ id: "wr-new" } as never);

    await generateWeeklyReportForm("profile-1", new Date("2026-10-09T00:00:00Z"));

    const createArgs = prismaMock.weeklyReport.create.mock.calls[0][0] as {
      data: { dailyEntries: { create: Record<string, unknown>[] } };
    };
    expect(createArgs.data.dailyEntries.create.map((e) => e.attendanceStatus)).toEqual([
      "SCHEDULED",
      "SCHEDULED",
      "SCHEDULED",
      "SCHEDULED",
      "SCHEDULED",
    ]);
  });

  it("creates one entry per scheduled weekday, marking applicable holidays", async () => {
    prismaMock.weeklyReport.findUnique.mockResolvedValue(null);
    prismaMock.workPlan.findFirst.mockResolvedValue(approvedPlan as never);
    // getHolidayCalendarForStudent: Wed is a holiday that applies.
    prismaMock.studentProfile.findUnique.mockResolvedValue({ semesterId: "sem-1" } as never);
    prismaMock.holidayCalendarEntry.findMany
      .mockResolvedValueOnce([
        { id: "h-1", date: new Date("2026-10-07T00:00:00Z"), name: "Holiday" },
      ] as never)
      .mockResolvedValueOnce([] as never);
    prismaMock.weeklyReport.create.mockResolvedValue({ id: "wr-new" } as never);

    const result = await generateWeeklyReportForm("profile-1", new Date("2026-10-09T00:00:00Z"));

    expect(result.weeklyReportId).toBe("wr-new");
    const createArgs = prismaMock.weeklyReport.create.mock.calls[0][0] as {
      data: { weekStart: Date; dailyEntries: { create: { reportDate: Date }[] } };
    };
    expect(createArgs.data.weekStart).toEqual(new Date("2026-10-05T00:00:00Z"));
    expect(createArgs.data.dailyEntries.create.map((e) => e.reportDate.toISOString())).toEqual([
      "2026-10-05T00:00:00.000Z",
      "2026-10-06T00:00:00.000Z",
      "2026-10-07T00:00:00.000Z",
      "2026-10-08T00:00:00.000Z",
      "2026-10-09T00:00:00.000Z",
    ]);
  });

  it("requires an approved work plan with a configured schedule", async () => {
    prismaMock.weeklyReport.findUnique.mockResolvedValue(null);
    prismaMock.workPlan.findFirst.mockResolvedValue({ id: "wp-1", scheduleConfig: null } as never);
    await expect(
      generateWeeklyReportForm("profile-1", new Date("2026-10-05T00:00:00Z"))
    ).rejects.toThrow(ScheduleNotConfiguredError);
  });
});

describe("weekly hour totals (FR-WR-02)", () => {
  it("calculateWeeklyTotalHours treats unfilled days as 0 and persists the sum", async () => {
    prismaMock.dailyReportEntry.findMany.mockResolvedValue([
      { actualHours: 8 },
      { actualHours: null },
      { actualHours: 7.5 },
    ] as never);

    await expect(calculateWeeklyTotalHours("wr-1")).resolves.toBe(15.5);
    expect(prismaMock.weeklyReport.update).toHaveBeenCalledWith({
      where: { id: "wr-1" },
      data: { totalHours: 15.5 },
    });
  });

  it("totals use credited hours (legacy rows capped at scheduled)", async () => {
    prismaMock.dailyReportEntry.findMany.mockResolvedValue([
      { actualHours: 9, scheduledHours: 8, creditedHours: null, attendanceStatus: "PRESENT" },
      { actualHours: 9, scheduledHours: 0, creditedHours: 4, attendanceStatus: "PRESENT" },
    ] as never);
    await expect(calculateWeeklyTotalHours("wr-1")).resolves.toBe(12);

    prismaMock.weeklyReport.findUniqueOrThrow.mockResolvedValue({
      weekStart: new Date("2026-10-12T00:00:00Z"),
      dailyEntries: [{ actualHours: 10, scheduledHours: 8, creditedHours: null }],
    } as never);
    prismaMock.studentProfile.findUniqueOrThrow.mockResolvedValue({ requiredHours: 100 } as never);
    prismaMock.weeklyReport.findMany.mockResolvedValue([
      { dailyEntries: [{ actualHours: 9, scheduledHours: 8, creditedHours: null }] },
    ] as never);
    await expect(calculateRunningTotalAndRemaining("profile-1", "wr-1")).resolves.toEqual({
      runningTotal: 16,
      remainingHours: 84,
      conductDeductions: 0,
    });
  });

  it("calculateRunningTotalAndRemaining adds only earlier APPROVED/REGARDED weeks", async () => {
    prismaMock.weeklyReport.findUniqueOrThrow.mockResolvedValue({
      weekStart: new Date("2026-10-12T00:00:00Z"),
      dailyEntries: [{ actualHours: 8 }, { actualHours: 8 }],
    } as never);
    prismaMock.studentProfile.findUniqueOrThrow.mockResolvedValue({ requiredHours: 486 } as never);
    prismaMock.weeklyReport.findMany.mockResolvedValue([
      { dailyEntries: [{ actualHours: 40 }] },
    ] as never);

    const result = await calculateRunningTotalAndRemaining("profile-1", "wr-1");

    expect(result).toEqual({ runningTotal: 56, remainingHours: 430, conductDeductions: 0 });
    expect(prismaMock.weeklyReport.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: { in: [WeeklyReportStatus.APPROVED, WeeklyReportStatus.REGARDED] },
        }),
      })
    );
  });
});

describe("conduct deductions beside the running total", () => {
  it("keeps the running total as hours worked and takes deductions off remaining", async () => {
    prismaMock.weeklyReport.findUniqueOrThrow.mockResolvedValue({
      weekStart: new Date("2026-10-12T00:00:00Z"),
      weekEnd: new Date("2026-10-18T00:00:00Z"),
      dailyEntries: [{ actualHours: 8 }],
    } as never);
    prismaMock.studentProfile.findUniqueOrThrow.mockResolvedValue({ requiredHours: 100 } as never);
    prismaMock.weeklyReport.findMany.mockResolvedValue([] as never);
    prismaMock.conductRecord.aggregate.mockResolvedValue({ _sum: { hoursDeducted: 4 } } as never);

    await expect(calculateRunningTotalAndRemaining("profile-1", "wr-1")).resolves.toEqual({
      runningTotal: 8,
      conductDeductions: 4,
      remainingHours: 96,
    });
    expect(prismaMock.conductRecord.aggregate).toHaveBeenCalledWith({
      where: {
        studentProfileId: "profile-1",
        revokedAt: null,
        date: { lte: new Date("2026-10-18T00:00:00Z") },
      },
      _sum: { hoursDeducted: true },
    });
  });
});

describe("saveDailyAccomplishment", () => {
  function mockEntry(
    status: WeeklyReportStatus,
    revisionHistory: unknown[] = [],
    userId = "student-1"
  ) {
    prismaMock.dailyReportEntry.findUniqueOrThrow.mockResolvedValue({
      reportDate: new Date("2026-10-05T00:00:00Z"),
      scheduledHours: 8,
      weeklyReport: {
        status,
        revisionHistory,
        studentProfileId: "profile-1",
        studentProfile: { userId },
      },
    } as never);
    prismaMock.deviationReport.findMany.mockResolvedValue([] as never);
  }

  it("saves hours, accomplishments, and tools for the owning student", async () => {
    mockEntry(WeeklyReportStatus.PENDING);
    prismaMock.dailyReportEntry.update.mockResolvedValue({
      id: "entry-1",
      actualHours: 8,
      accomplishments: "Fixed a bug",
    } as never);

    const result = await saveDailyAccomplishment(
      "entry-1",
      8,
      "Fixed a bug",
      "student-1",
      "VS Code"
    );

    expect(result).toEqual({ id: "entry-1", hours: 8, accomplishments: "Fixed a bug" });
    expect(prismaMock.dailyReportEntry.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          actualHours: 8,
          toolsUsed: "VS Code",
          attendanceStatus: "PRESENT",
        }),
      })
    );
  });

  it("refuses a student who doesn't own the report", async () => {
    mockEntry(WeeklyReportStatus.PENDING, [], "student-2");
    await expect(saveDailyAccomplishment("entry-1", 8, "x", "student-1")).rejects.toThrow(
      ForbiddenError
    );
  });

  it("locks the report while it is awaiting review", async () => {
    mockEntry(WeeklyReportStatus.PENDING, [{ type: "SUBMITTED", timestamp: "t" }]);
    await expect(saveDailyAccomplishment("entry-1", 8, "x", "student-1")).rejects.toThrow(
      WeeklyReportLockedError
    );
  });

  it("locks a finalized report", async () => {
    mockEntry(WeeklyReportStatus.APPROVED);
    await expect(saveDailyAccomplishment("entry-1", 8, "x", "student-1")).rejects.toThrow(
      WeeklyReportLockedError
    );
  });

  it("reopens a RETURNED report for edits", async () => {
    mockEntry(WeeklyReportStatus.RETURNED, [
      { type: "SUBMITTED", timestamp: "t0" },
      { type: "RETURNED", timestamp: "t1", notes: "Add detail" },
    ]);
    prismaMock.dailyReportEntry.update.mockResolvedValue({
      id: "entry-1",
      actualHours: 0,
      accomplishments: "Absent",
    } as never);
    await expect(saveDailyAccomplishment("entry-1", 0, "Absent", "student-1")).resolves.toEqual(
      expect.objectContaining({ hours: 0 })
    );
  });

  it("ABSENT forces 0 hours and stores status and times", async () => {
    mockEntry(WeeklyReportStatus.PENDING);
    prismaMock.dailyReportEntry.update.mockResolvedValue({
      id: "entry-1",
      actualHours: 0,
      accomplishments: "",
    } as never);

    await saveDailyAccomplishment("entry-1", 5, "", "student-1", undefined, {
      attendanceStatus: "ABSENT",
      timeIn: null,
      timeOut: null,
    });

    expect(prismaMock.dailyReportEntry.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          actualHours: 0,
          attendanceStatus: "ABSENT",
          timeIn: null,
          timeOut: null,
        }),
      })
    );
  });

  it("clears stale tools, times and text when a day is marked non-PRESENT", async () => {
    mockEntry(WeeklyReportStatus.PENDING);
    prismaMock.dailyReportEntry.update.mockResolvedValue({
      id: "entry-1",
      actualHours: 0,
      accomplishments: "",
    } as never);

    await saveDailyAccomplishment("entry-1", 8, "Old text", "student-1", "VS Code", {
      attendanceStatus: "HOLIDAY",
      timeIn: "08:00",
      timeOut: "17:00",
    });

    expect(prismaMock.dailyReportEntry.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          actualHours: 0,
          accomplishments: "",
          toolsUsed: null,
          timeIn: null,
          timeOut: null,
          attendanceStatus: "HOLIDAY",
        }),
      })
    );
  });

  it("stores times for a PRESENT day and leaves them untouched for legacy callers", async () => {
    mockEntry(WeeklyReportStatus.PENDING);
    prismaMock.dailyReportEntry.update.mockResolvedValue({
      id: "entry-1",
      actualHours: 8,
      accomplishments: "x",
    } as never);

    await saveDailyAccomplishment("entry-1", 8, "x", "student-1", undefined, {
      attendanceStatus: "PRESENT",
      timeIn: "08:00",
      timeOut: "17:00",
    });
    expect(prismaMock.dailyReportEntry.update).toHaveBeenLastCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ actualHours: 8, timeIn: "08:00", timeOut: "17:00" }),
      })
    );

    await saveDailyAccomplishment("entry-1", 8, "x", "student-1");
    const legacy = prismaMock.dailyReportEntry.update.mock.calls.at(-1)![0] as {
      data: Record<string, unknown>;
    };
    expect(legacy.data).not.toHaveProperty("timeIn");
    expect(legacy.data).not.toHaveProperty("timeOut");
  });

  it("stores the second range and nulls it on non-PRESENT days", async () => {
    mockEntry(WeeklyReportStatus.PENDING);
    prismaMock.dailyReportEntry.update.mockResolvedValue({
      id: "entry-1",
      actualHours: 8,
      accomplishments: "x",
    } as never);

    await saveDailyAccomplishment("entry-1", 8, "x", "student-1", undefined, {
      attendanceStatus: "PRESENT",
      timeIn: "08:00",
      timeOut: "12:00",
      timeIn2: "13:00",
      timeOut2: "17:00",
    });
    expect(prismaMock.dailyReportEntry.update).toHaveBeenLastCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ timeIn2: "13:00", timeOut2: "17:00" }),
      })
    );

    await saveDailyAccomplishment("entry-1", 0, "", "student-1", undefined, {
      attendanceStatus: "ABSENT",
    });
    expect(prismaMock.dailyReportEntry.update).toHaveBeenLastCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ timeIn2: null, timeOut2: null }),
      })
    );
  });
});

describe("saveDailyAccomplishment credited hours", () => {
  it("stores the SLU-credited hours computed at save time", async () => {
    prismaMock.dailyReportEntry.findUniqueOrThrow.mockResolvedValue({
      reportDate: new Date("2026-10-05T00:00:00Z"),
      scheduledHours: 8,
      weeklyReport: {
        status: WeeklyReportStatus.PENDING,
        revisionHistory: [],
        studentProfileId: "profile-1",
        studentProfile: { userId: "student-1" },
      },
    } as never);
    prismaMock.workPlan.findFirst.mockResolvedValue({
      scheduleConfig: {
        daysOfWeek: [1],
        hoursPerDay: 8,
        startTime: "08:00",
        endTime: "17:00",
        breakMinutes: 60,
      },
    } as never);
    prismaMock.deviationReport.findMany.mockResolvedValue([] as never);
    prismaMock.dailyReportEntry.update.mockResolvedValue({
      id: "entry-1",
      actualHours: 7.5,
      accomplishments: "x",
    } as never);

    await saveDailyAccomplishment("entry-1", 7.5, "x", "student-1", undefined, {
      attendanceStatus: "PRESENT",
      timeIn: "08:30",
      timeOut: "12:00",
      timeIn2: "13:00",
      timeOut2: "17:00",
    });

    expect(prismaMock.dailyReportEntry.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ creditedHours: 7.5 }) })
    );
  });
});

describe("recomputeCreditedHours", () => {
  it("rewrites credited hours for the given dates and refreshes this and later weeks", async () => {
    const sat = new Date("2026-10-10T00:00:00Z");
    prismaMock.workPlan.findFirst.mockResolvedValue({
      scheduleConfig: {
        daysOfWeek: [1, 2, 3, 4, 5],
        hoursPerDay: 8,
        startTime: "08:00",
        endTime: "17:00",
        breakMinutes: 60,
      },
    } as never);
    prismaMock.deviationReport.findMany.mockResolvedValue([
      { date: sat, requestedMinutes: 240 },
    ] as never);
    prismaMock.dailyReportEntry.findMany
      // entries on the requested dates
      .mockResolvedValueOnce([
        {
          id: "entry-sat",
          weeklyReportId: "wr-1",
          reportDate: sat,
          scheduledHours: 0,
          actualHours: 4,
          creditedHours: 0,
          attendanceStatus: "PRESENT",
          timeIn: "08:00",
          timeOut: "12:00",
          timeIn2: null,
          timeOut2: null,
          weeklyReport: { weekStart: new Date("2026-10-05T00:00:00Z") },
        },
      ] as never)
      // calculateWeeklyTotalHours reads, one per refreshed week
      .mockResolvedValue([] as never);
    prismaMock.weeklyReport.findMany
      // weeks to refresh (this and later)
      .mockResolvedValueOnce([{ id: "wr-1" }, { id: "wr-2" }] as never)
      // prior weeks for each running total, then calculateRenderedHours
      .mockResolvedValue([] as never);
    prismaMock.weeklyReport.findUniqueOrThrow.mockResolvedValue({
      weekStart: new Date("2026-10-05T00:00:00Z"),
      dailyEntries: [],
    } as never);
    prismaMock.studentProfile.findUniqueOrThrow.mockResolvedValue({ requiredHours: 100 } as never);

    await recomputeCreditedHours("profile-1", { dates: [sat] });

    expect(prismaMock.dailyReportEntry.update).toHaveBeenCalledWith({
      where: { id: "entry-sat" },
      data: { creditedHours: 4 },
    });
    const weekArgs = prismaMock.weeklyReport.findMany.mock.calls[0][0] as { where: unknown };
    expect(weekArgs.where).toEqual({
      studentProfileId: "profile-1",
      weekStart: { gte: new Date("2026-10-05T00:00:00Z") },
    });
    // totals refreshed for both weeks
    expect(prismaMock.weeklyReport.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "wr-2" } })
    );
    // rendered hours refreshed
    expect(prismaMock.studentProfile.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "profile-1" } })
    );
  });

  it("does nothing when no entry falls on the dates", async () => {
    prismaMock.workPlan.findFirst.mockResolvedValue(null);
    prismaMock.deviationReport.findMany.mockResolvedValue([] as never);
    prismaMock.dailyReportEntry.findMany.mockResolvedValue([] as never);

    await recomputeCreditedHours("profile-1", { dates: [new Date("2026-10-10T00:00:00Z")] });

    expect(prismaMock.dailyReportEntry.update).not.toHaveBeenCalled();
    expect(prismaMock.weeklyReport.update).not.toHaveBeenCalled();
  });
});

describe("removeDailyEntry", () => {
  function mockAdded(over: Record<string, unknown> = {}, report: Record<string, unknown> = {}) {
    prismaMock.dailyReportEntry.findUniqueOrThrow.mockResolvedValue({
      scheduledHours: 0,
      weeklyReport: {
        status: WeeklyReportStatus.PENDING,
        revisionHistory: [],
        studentProfile: { userId: "student-1" },
        ...report,
      },
      ...over,
    } as never);
  }

  it("removes a day the student added", async () => {
    mockAdded();
    await removeDailyEntry("entry-sat", "student-1");
    expect(prismaMock.dailyReportEntry.delete).toHaveBeenCalledWith({ where: { id: "entry-sat" } });
  });

  it("refuses a scheduled day", async () => {
    mockAdded({ scheduledHours: 8 });
    await expect(removeDailyEntry("entry-mon", "student-1")).rejects.toThrow(DailyEntryDateError);
    expect(prismaMock.dailyReportEntry.delete).not.toHaveBeenCalled();
  });

  it("refuses another student and a locked report", async () => {
    mockAdded({}, { studentProfile: { userId: "student-2" } });
    await expect(removeDailyEntry("entry-sat", "student-1")).rejects.toThrow(ForbiddenError);
    mockAdded({}, { status: WeeklyReportStatus.APPROVED });
    await expect(removeDailyEntry("entry-sat", "student-1")).rejects.toThrow(
      WeeklyReportLockedError
    );
    expect(prismaMock.dailyReportEntry.delete).not.toHaveBeenCalled();
  });
});

describe("addDailyEntry", () => {
  const report = {
    id: "wr-1",
    weekStart: new Date("2026-10-05T00:00:00Z"),
    weekEnd: new Date("2026-10-11T00:00:00Z"),
    status: WeeklyReportStatus.PENDING,
    revisionHistory: [],
    studentProfile: { userId: "student-1" },
    dailyEntries: [{ reportDate: new Date("2026-10-05T00:00:00Z") }],
  };

  it("adds a non-scheduled day with 0 scheduled hours", async () => {
    prismaMock.weeklyReport.findUniqueOrThrow.mockResolvedValue(report as never);
    prismaMock.dailyReportEntry.create.mockResolvedValue({ id: "entry-sat" } as never);

    await expect(
      addDailyEntry("wr-1", new Date("2026-10-10T00:00:00Z"), "student-1")
    ).resolves.toEqual({ id: "entry-sat" });
    expect(prismaMock.dailyReportEntry.create).toHaveBeenCalledWith({
      data: {
        weeklyReportId: "wr-1",
        reportDate: new Date("2026-10-10T00:00:00Z"),
        attendanceStatus: "SCHEDULED",
        scheduledHours: 0,
      },
      select: { id: true },
    });
  });

  it("refuses a student who doesn't own the report", async () => {
    prismaMock.weeklyReport.findUniqueOrThrow.mockResolvedValue(report as never);
    await expect(
      addDailyEntry("wr-1", new Date("2026-10-10T00:00:00Z"), "student-2")
    ).rejects.toThrow(ForbiddenError);
  });

  it("rejects a date outside the week", async () => {
    prismaMock.weeklyReport.findUniqueOrThrow.mockResolvedValue(report as never);
    await expect(
      addDailyEntry("wr-1", new Date("2026-10-12T00:00:00Z"), "student-1")
    ).rejects.toThrow("within this report's week");
  });

  it("rejects a date that already has a row", async () => {
    prismaMock.weeklyReport.findUniqueOrThrow.mockResolvedValue(report as never);
    await expect(
      addDailyEntry("wr-1", new Date("2026-10-05T00:00:00Z"), "student-1")
    ).rejects.toThrow("already");
  });

  it("rejects a locked report", async () => {
    prismaMock.weeklyReport.findUniqueOrThrow.mockResolvedValue({
      ...report,
      status: WeeklyReportStatus.APPROVED,
    } as never);
    await expect(
      addDailyEntry("wr-1", new Date("2026-10-10T00:00:00Z"), "student-1")
    ).rejects.toThrow(WeeklyReportLockedError);
  });
});

describe("validateLateSubmissionReason (FR-WR-05)", () => {
  afterEach(() => jest.useRealTimers());

  it("is a no-op before the Tuesday deadline", async () => {
    jest.useFakeTimers({ now: new Date("2026-10-13T10:00:00Z") }); // Tue 18:00 Manila
    prismaMock.weeklyReport.findUniqueOrThrow.mockResolvedValue({
      weekEnd: new Date("2026-10-11T00:00:00Z"),
    } as never);
    await expect(validateLateSubmissionReason("wr-1")).resolves.toBeUndefined();
  });

  it("requires a reason once the deadline has passed", async () => {
    jest.useFakeTimers({ now: new Date("2026-10-13T16:30:00Z") }); // Wed 00:30 Manila
    prismaMock.weeklyReport.findUniqueOrThrow.mockResolvedValue({
      weekEnd: new Date("2026-10-11T00:00:00Z"),
    } as never);
    await expect(validateLateSubmissionReason("wr-1", "  ")).rejects.toThrow(
      LateSubmissionReasonRequiredError
    );
    await expect(validateLateSubmissionReason("wr-1", "Power outage")).resolves.toBeUndefined();
  });
});

describe("recordWeeklyReportSubmission", () => {
  const actingUser = { id: "student-1", role: Role.STUDENT_INTERN };
  const filledEntries = [
    { actualHours: 8, accomplishments: "Built the login page", attendanceStatus: "PRESENT" },
  ];

  it("submittable when all days are ABSENT/HOLIDAY (no accomplishments needed)", async () => {
    prismaMock.weeklyReport.findUniqueOrThrow.mockResolvedValue({
      status: WeeklyReportStatus.PENDING,
      weekEnd: new Date("2026-10-11T00:00:00Z"),
      revisionHistory: [],
      dailyEntries: [
        { actualHours: 0, accomplishments: null, attendanceStatus: "HOLIDAY" },
        { actualHours: 0, accomplishments: "", attendanceStatus: "ABSENT" },
      ],
    } as never);
    await expect(
      recordWeeklyReportSubmission(
        "wr-1",
        { referenceCode: "WR-1", timestamp: new Date("2026-10-12T02:00:00Z") },
        actingUser
      )
    ).resolves.toEqual(expect.objectContaining({ type: "SUBMITTED" }));
  });

  describe("late arrival / early leave gate", () => {
    const tardyDay = {
      reportDate: new Date("2026-10-06T00:00:00Z"),
      scheduledHours: 8,
      actualHours: 7.5,
      accomplishments: "Worked",
      attendanceStatus: "PRESENT",
      timeIn: "08:30",
      timeOut: "12:00",
      timeIn2: "13:00",
      timeOut2: "17:00",
    };
    function mockReport(dailyEntries: unknown[]) {
      prismaMock.weeklyReport.findUniqueOrThrow.mockResolvedValue({
        status: WeeklyReportStatus.PENDING,
        weekEnd: new Date("2026-10-11T00:00:00Z"),
        revisionHistory: [],
        studentProfileId: "profile-1",
        dailyEntries,
      } as never);
    }
    const shiftPlan = {
      scheduleConfig: {
        daysOfWeek: [1, 2, 3, 4, 5],
        hoursPerDay: 8,
        startTime: "08:00",
        endTime: "17:00",
        breakMinutes: 60,
      },
    };
    const submit = () =>
      recordWeeklyReportSubmission(
        "wr-1",
        { referenceCode: "WR-1", timestamp: new Date("2026-10-12T02:00:00Z") },
        actingUser
      );

    it("blocks a tardy day with no undertime request, listing the date", async () => {
      mockReport([tardyDay]);
      prismaMock.workPlan.findFirst.mockResolvedValue(shiftPlan as never);
      prismaMock.deviationReport.findMany.mockResolvedValue([] as never);
      await expect(submit()).rejects.toThrow("File an undertime request for: Oct 6 (late arrival)");
    });

    it("passes with an undertime request of any status on that date", async () => {
      mockReport([tardyDay]);
      prismaMock.workPlan.findFirst.mockResolvedValue(shiftPlan as never);
      prismaMock.deviationReport.findMany.mockResolvedValue([
        {
          date: tardyDay.reportDate,
          deviationType: "UNDERTIME",
          startTime: "08:00",
          endTime: "08:30",
          validationStatus: "REJECTED",
        },
      ] as never);
      await expect(submit()).resolves.toEqual(expect.objectContaining({ type: "SUBMITTED" }));
    });

    it("passes with a partial-day leave covering the gap, but not one that misses it", async () => {
      mockReport([
        { ...tardyDay, timeIn: "08:00", timeOut: "12:00", timeIn2: "13:00", timeOut2: "15:00" },
      ]);
      prismaMock.workPlan.findFirst.mockResolvedValue(shiftPlan as never);
      prismaMock.deviationReport.findMany.mockResolvedValueOnce([
        {
          date: tardyDay.reportDate,
          deviationType: "ABSENCE",
          startTime: "15:00",
          endTime: "17:00",
        },
      ] as never);
      await expect(submit()).resolves.toEqual(expect.objectContaining({ type: "SUBMITTED" }));

      prismaMock.deviationReport.findMany.mockResolvedValueOnce([
        {
          date: tardyDay.reportDate,
          deviationType: "ABSENCE",
          startTime: "16:00",
          endTime: "17:00",
        },
      ] as never);
      await expect(submit()).rejects.toThrow("Oct 6 (early leave)");
    });

    it("skips the check for a schedule without shift times", async () => {
      mockReport([tardyDay]);
      prismaMock.workPlan.findFirst.mockResolvedValue({
        scheduleConfig: { daysOfWeek: [1], hoursPerDay: 8 },
      } as never);
      prismaMock.deviationReport.findMany.mockResolvedValue([] as never);
      await expect(submit()).resolves.toEqual(expect.objectContaining({ type: "SUBMITTED" }));
    });
  });

  it("clears the cached AI advisory so the resubmitted text is analysed again", async () => {
    prismaMock.weeklyReport.findUniqueOrThrow.mockResolvedValue({
      status: WeeklyReportStatus.RETURNED,
      weekEnd: new Date("2026-10-11T00:00:00Z"),
      revisionHistory: [
        { type: "SUBMITTED", timestamp: "t0" },
        { type: "RETURNED", timestamp: "t1" },
      ],
      dailyEntries: filledEntries,
    } as never);
    await recordWeeklyReportSubmission(
      "wr-1",
      { referenceCode: "WR-2", timestamp: new Date("2026-10-12T02:00:00Z") },
      actingUser
    );
    expect(prismaMock.weeklyReport.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          aiProcessedAt: null,
          similarityScore: null,
          similarityFlag: false,
          sentimentLabel: null,
          sentimentConfidence: null,
          sentimentReasoning: null,
        }),
      })
    );
  });

  it("still rejects an unfilled SCHEDULED day", async () => {
    prismaMock.weeklyReport.findUniqueOrThrow.mockResolvedValue({
      status: WeeklyReportStatus.PENDING,
      weekEnd: new Date("2026-10-11T00:00:00Z"),
      revisionHistory: [],
      dailyEntries: [{ actualHours: null, accomplishments: null, attendanceStatus: "SCHEDULED" }],
    } as never);
    await expect(
      recordWeeklyReportSubmission(
        "wr-1",
        { referenceCode: "x", timestamp: new Date() },
        actingUser
      )
    ).rejects.toThrow(WeeklyReportIncompleteError);
  });

  it("appends a SUBMITTED entry with the reference code and audit-logs it", async () => {
    prismaMock.weeklyReport.findUniqueOrThrow.mockResolvedValue({
      status: WeeklyReportStatus.PENDING,
      weekEnd: new Date("2026-10-11T00:00:00Z"),
      revisionHistory: [],
      dailyEntries: filledEntries,
    } as never);

    const entry = await recordWeeklyReportSubmission(
      "wr-1",
      { referenceCode: "WR-20261005-ABCD1234", timestamp: new Date("2026-10-12T02:00:00Z") },
      actingUser
    );

    expect(entry).toEqual(
      expect.objectContaining({
        type: "SUBMITTED",
        referenceCode: "WR-20261005-ABCD1234",
        late: false,
      })
    );
    expect(prismaMock.weeklyReport.update).toHaveBeenCalledWith({
      where: { id: "wr-1" },
      data: expect.objectContaining({
        status: WeeklyReportStatus.PENDING,
        revisionHistory: [entry],
      }),
    });
    expect(prismaMock.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: "WEEKLY_REPORT_SUBMITTED" }),
      })
    );
  });

  it("records the delay reason on a late submission", async () => {
    prismaMock.weeklyReport.findUniqueOrThrow.mockResolvedValue({
      status: WeeklyReportStatus.PENDING,
      weekEnd: new Date("2026-10-11T00:00:00Z"),
      revisionHistory: [],
      dailyEntries: filledEntries,
    } as never);

    const entry = await recordWeeklyReportSubmission(
      "wr-1",
      {
        referenceCode: "WR-1",
        timestamp: new Date("2026-10-20T00:00:00Z"),
        reasonForDelay: "Typhoon",
      },
      actingUser
    );

    expect(entry).toEqual(expect.objectContaining({ late: true, reasonForDelay: "Typhoon" }));
  });

  it("rejects a report with unfilled days", async () => {
    prismaMock.weeklyReport.findUniqueOrThrow.mockResolvedValue({
      status: WeeklyReportStatus.PENDING,
      weekEnd: new Date("2026-10-11T00:00:00Z"),
      revisionHistory: [],
      dailyEntries: [{ actualHours: null, accomplishments: null }],
    } as never);
    await expect(
      recordWeeklyReportSubmission(
        "wr-1",
        { referenceCode: "x", timestamp: new Date() },
        actingUser
      )
    ).rejects.toThrow(WeeklyReportIncompleteError);
  });

  it("rejects a double submission", async () => {
    prismaMock.weeklyReport.findUniqueOrThrow.mockResolvedValue({
      status: WeeklyReportStatus.PENDING,
      weekEnd: new Date("2026-10-11T00:00:00Z"),
      revisionHistory: [{ type: "SUBMITTED", timestamp: "t" }],
      dailyEntries: filledEntries,
    } as never);
    await expect(
      recordWeeklyReportSubmission(
        "wr-1",
        { referenceCode: "x", timestamp: new Date() },
        actingUser
      )
    ).rejects.toThrow(WeeklyReportLockedError);
  });
});

describe("reviewWeeklyReport_Disregard", () => {
  it("deletes the report's daily entries before deleting the report itself", async () => {
    prismaMock.dailyReportEntry.deleteMany.mockResolvedValue({ count: 5 } as never);
    prismaMock.weeklyReport.delete.mockResolvedValue({} as never);

    const result = await reviewWeeklyReport_Disregard("wr-1", "faculty-1");

    expect(result).toEqual({ id: "wr-1", status: WeeklyReportStatus.DISREGARDED });
    expect(prismaMock.dailyReportEntry.deleteMany).toHaveBeenCalledWith({
      where: { weeklyReportId: "wr-1" },
    });
    expect(prismaMock.weeklyReport.delete).toHaveBeenCalledWith({ where: { id: "wr-1" } });
    expect(prismaMock.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: "WEEKLY_REPORT_DISREGARDED", entityId: "wr-1" }),
      })
    );
  });

  it("deletes daily entries before the report, within the same transaction", async () => {
    const callOrder: string[] = [];
    prismaMock.dailyReportEntry.deleteMany.mockImplementation(() => {
      callOrder.push("dailyReportEntry.deleteMany");
      return Promise.resolve({ count: 0 }) as never;
    });
    prismaMock.weeklyReport.delete.mockImplementation(() => {
      callOrder.push("weeklyReport.delete");
      return Promise.resolve({}) as never;
    });

    await reviewWeeklyReport_Disregard("wr-1", "faculty-1");

    expect(callOrder).toEqual(["dailyReportEntry.deleteMany", "weeklyReport.delete"]);
  });
});

describe("approving an earlier week refreshes later weeks' running totals", () => {
  it("week 2's stored total gains week 1's hours once week 1 is approved", async () => {
    const eightHourDays = Array.from({ length: 5 }, () => ({
      creditedHours: 8,
      actualHours: 8,
      scheduledHours: 8,
      attendanceStatus: "PRESENT",
    }));
    prismaMock.weeklyReport.update.mockResolvedValue({
      id: "wr-1",
      status: WeeklyReportStatus.APPROVED,
      studentProfileId: "profile-1",
      weekStart: new Date("2026-09-28T00:00:00Z"),
    } as never);
    prismaMock.weeklyReport.findUniqueOrThrow.mockResolvedValue({
      status: WeeklyReportStatus.PENDING,
      revisionHistory: [{ type: "SUBMITTED" }],
    } as never);
    // One read of the student's weeks, oldest first; week 1 is now approved.
    prismaMock.weeklyReport.findMany.mockResolvedValue([
      {
        id: "wr-1",
        status: WeeklyReportStatus.APPROVED,
        weekStart: new Date("2026-09-28T00:00:00Z"),
        weekEnd: new Date("2026-10-04T00:00:00Z"),
        dailyEntries: eightHourDays,
      },
      {
        id: "wr-2",
        status: WeeklyReportStatus.PENDING,
        weekStart: new Date("2026-10-05T00:00:00Z"),
        weekEnd: new Date("2026-10-11T00:00:00Z"),
        dailyEntries: eightHourDays,
      },
    ] as never);
    prismaMock.conductRecord.findMany.mockResolvedValue([
      { date: new Date("2026-10-06T00:00:00Z"), hoursDeducted: 2 },
    ] as never);
    prismaMock.studentProfile.findUniqueOrThrow.mockResolvedValue({ requiredHours: 486 } as never);
    prismaMock.studentProfile.update.mockResolvedValue({} as never);
    prismaMock.workPlan.findFirst.mockResolvedValue(null);

    await reviewWeeklyReport_Approve("wr-1", "faculty-1");

    // Worked 80; the 2-hour deduction dated in week 2 comes off remaining only.
    expect(prismaMock.weeklyReport.update).toHaveBeenCalledWith({
      where: { id: "wr-2" },
      data: { runningTotal: 80, remainingHours: 408 },
    });
    // Week 1 itself isn't rewritten, and the approval is audited.
    expect(prismaMock.weeklyReport.update).not.toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "wr-1" },
        data: expect.objectContaining({ runningTotal: expect.anything() }),
      })
    );
    expect(prismaMock.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: "WEEKLY_REPORT_APPROVED" }),
      })
    );
  });
});

describe("reviewWeeklyReport_Approve", () => {
  it("sets the report APPROVED and records the reviewing faculty in facultyAction", async () => {
    prismaMock.weeklyReport.update.mockResolvedValue({
      id: "wr-1",
      status: WeeklyReportStatus.APPROVED,
      studentProfileId: "profile-1",
    } as never);
    // reviewWeeklyReport_Approve also calls attendanceService's
    // computeTotalHoursRendered/computeProjectedCompletionDate (both real
    // implementations as of #52/#53) — mocked just enough for those calls
    // to resolve without throwing; their own behavior is covered by
    // attendanceService.test.ts.
    prismaMock.weeklyReport.findMany.mockResolvedValue([] as never);
    prismaMock.studentProfile.update.mockResolvedValue({} as never);
    prismaMock.workPlan.findFirst.mockResolvedValue(null);

    const result = await reviewWeeklyReport_Approve("wr-1", "faculty-1");

    expect(result).toEqual({ id: "wr-1", status: WeeklyReportStatus.APPROVED });
    expect(prismaMock.weeklyReport.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "wr-1" },
        data: {
          status: WeeklyReportStatus.APPROVED,
          facultyAction: "APPROVED by faculty-1",
        },
      })
    );
  });
});
describe("review lifecycle", () => {
  const actingUser = { id: "student-1", role: Role.STUDENT_INTERN };

  it("ignores non-lifecycle history entries when deciding the lock", () => {
    const awaiting = {
      status: WeeklyReportStatus.PENDING,
      revisionHistory: [
        { type: "SUBMITTED", timestamp: "t1" },
        { type: "NOTE", timestamp: "t2" },
      ],
    };
    expect(isAwaitingReview(awaiting)).toBe(true);
    expect(isWeeklyReportEditable(awaiting)).toBe(false);

    expect(
      isWeeklyReportEditable({
        status: WeeklyReportStatus.RETURNED,
        revisionHistory: [
          { type: "SUBMITTED", timestamp: "t1" },
          { type: "RETURNED", timestamp: "t2" },
          { type: "NOTE", timestamp: "t3" },
        ],
      })
    ).toBe(true);
  });

  it("still blocks submitting a PRESENT day with hours but a blank description", async () => {
    prismaMock.weeklyReport.findUniqueOrThrow.mockResolvedValue({
      status: WeeklyReportStatus.PENDING,
      weekEnd: new Date("2026-10-11T00:00:00Z"),
      revisionHistory: [],
      dailyEntries: [{ actualHours: 8, accomplishments: "  ", attendanceStatus: "PRESENT" }],
    } as never);
    await expect(
      recordWeeklyReportSubmission(
        "wr-1",
        { referenceCode: "x", timestamp: new Date() },
        actingUser
      )
    ).rejects.toThrow(WeeklyReportIncompleteError);
  });
});
