import { Role, WeeklyReportStatus } from "@prisma/client";
import { prismaMock, resetPrismaMock } from "@/testUtils/prismaMock";
import { ScheduleNotConfiguredError } from "@/lib/services/attendanceService";
import { ForbiddenError } from "@/lib/services/userService";
import {
  attachSignedCopy,
  getLatestSignedCopy,
  isAwaitingReview,
  isWeeklyReportEditable,
  SignedCopyNotAllowedError,
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
} from "@/lib/services/weeklyReportService";

beforeEach(() => resetPrismaMock());

describe("reviewWeeklyReport_Return", () => {
  it.each([[], [{ type: "SUBMITTED", timestamp: "2026-10-10", referenceCode: "WR-1" }], null])(
    "preserves history %p and appends revision notes without recalculating hours",
    async (history) => {
      prismaMock.weeklyReport.findUniqueOrThrow.mockResolvedValue({
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

describe("weeklyReportService stubs — reachable and wired correctly", () => {
  // TODO(JayPing23): replace each of these placeholder-return assertions
  // once the real logic behind it lands (see PHASE3_TASKS.md for owners).
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

  it("creates one entry per scheduled weekday, skipping applicable holidays", async () => {
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

    expect(result).toEqual({ runningTotal: 56, remainingHours: 430 });
    expect(prismaMock.weeklyReport.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: { in: [WeeklyReportStatus.APPROVED, WeeklyReportStatus.REGARDED] },
        }),
      })
    );
  });
});

describe("saveDailyAccomplishment", () => {
  function mockEntry(
    status: WeeklyReportStatus,
    revisionHistory: unknown[] = [],
    userId = "student-1"
  ) {
    prismaMock.dailyReportEntry.findUniqueOrThrow.mockResolvedValue({
      weeklyReport: { status, revisionHistory, studentProfile: { userId } },
    } as never);
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
      data: { status: WeeklyReportStatus.PENDING, revisionHistory: [entry] },
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
    // Deliberately no audit-log assertion: this contract never says "Log via
    // logEvent" (see the comment above reviewWeeklyReport_Disregard).
    expect(prismaMock.auditLog.create).not.toHaveBeenCalled();
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
describe("signed copies (D2)", () => {
  const actingUser = { id: "student-1", role: Role.STUDENT_INTERN };

  it("stays locked after a signed copy is attached while awaiting review", () => {
    const report = {
      status: WeeklyReportStatus.PENDING,
      revisionHistory: [
        { type: "SUBMITTED", timestamp: "t1" },
        { type: "SIGNED_COPY_UPLOADED", timestamp: "t2", path: "p", uploadedBy: "s" },
      ],
    };
    expect(isAwaitingReview(report)).toBe(true);
    expect(isWeeklyReportEditable(report)).toBe(false);
  });

  it("appends a SIGNED_COPY_UPLOADED entry without changing status", async () => {
    prismaMock.weeklyReport.findUniqueOrThrow.mockResolvedValue({
      status: WeeklyReportStatus.APPROVED,
      revisionHistory: [{ type: "SUBMITTED", timestamp: "t1", referenceCode: "WR-1" }],
    } as never);

    const entry = await attachSignedCopy("wr-1", "signed-copies/p-1/wr-1.pdf", actingUser);

    expect(entry).toEqual(
      expect.objectContaining({ type: "SIGNED_COPY_UPLOADED", path: "signed-copies/p-1/wr-1.pdf" })
    );
    const updateArg = prismaMock.weeklyReport.update.mock.calls[0][0] as {
      data: Record<string, unknown>;
    };
    expect(updateArg.data).not.toHaveProperty("status");
    expect(prismaMock.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ action: "SIGNED_COPY_UPLOADED" }) })
    );
  });

  it("refuses a report that was never submitted", async () => {
    prismaMock.weeklyReport.findUniqueOrThrow.mockResolvedValue({
      status: WeeklyReportStatus.PENDING,
      revisionHistory: [],
    } as never);
    await expect(attachSignedCopy("wr-1", "x.pdf", actingUser)).rejects.toThrow(
      SignedCopyNotAllowedError
    );
  });

  it("getLatestSignedCopy returns the most recent upload", () => {
    expect(
      getLatestSignedCopy([
        { type: "SIGNED_COPY_UPLOADED", timestamp: "t1", path: "old" },
        { type: "SIGNED_COPY_UPLOADED", timestamp: "t2", path: "new" },
      ])?.path
    ).toBe("new");
  });
});
