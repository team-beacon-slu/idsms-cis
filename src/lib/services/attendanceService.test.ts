import { DeviationType, Program, Role, ValidationStatus, WeeklyReportStatus } from "@prisma/client";
import { prismaMock, resetPrismaMock } from "@/testUtils/prismaMock";
import {
  applyScheduleChangeProspectively,
  approveScheduleChangeCoordinator,
  computeProjectedCompletionDate,
  computeTotalHoursRendered,
  configureWorkSchedule,
  exportAttendanceLogCsv,
  getDeviationReportStudentProfileId,
  getHolidayCalendarForStudent,
  getRequiredHoursConfig,
  getWorkPlanStudentProfileId,
  InvalidScheduleChangeCoordinatorStateError,
  InvalidScheduleChangeStateError,
  listDeviationReportsForStudent,
  logScheduleChangeHistory,
  markHolidayApplicable,
  MissingScheduleChangeRequestError,
  requestScheduleChange,
  setRequiredHoursConfig,
  submitDeviationReport,
  validateDeviationReport,
  validateScheduleChangeFaculty,
} from "@/lib/services/attendanceService";

const studentUser = { id: "student-1", role: Role.STUDENT_INTERN };

beforeEach(() => {
  resetPrismaMock();
  prismaMock.studentProfile.findUnique.mockResolvedValue({
    userId: "student-1",
    classGroupId: "cg-1",
    semesterId: "sem-1",
  } as never);
});

describe("attendanceService stubs — reachable and wired correctly", () => {
  // TODO(JayPing23): replace each of these placeholder-return assertions
  // once the real logic behind it lands (see PHASE3_TASKS.md for owners).
  it("configureWorkSchedule resolves without throwing", async () => {
    const result = await configureWorkSchedule(
      "profile-1",
      { daysOfWeek: [1, 2, 3], hoursPerDay: 8 },
      studentUser
    );
    expect(result.studentProfileId).toBe("profile-1");
  });

  it("getHolidayCalendarForStudent resolves an array", async () => {
    await expect(getHolidayCalendarForStudent("profile-1")).resolves.toEqual([]);
  });

  it("markHolidayApplicable resolves without throwing", async () => {
    const result = await markHolidayApplicable("profile-1", "holiday-1", true, studentUser);
    expect(result.applicable).toBe(true);
  });

  it("submitDeviationReport resolves a PENDING placeholder", async () => {
    const result = await submitDeviationReport(
      "profile-1",
      { date: new Date(), deviationType: DeviationType.ABSENCE, reason: "Sick" },
      studentUser
    );
    expect(result.validationStatus).toBe(ValidationStatus.PENDING);
  });

  it("listDeviationReportsForStudent calls prisma with the right filter", async () => {
    prismaMock.deviationReport.findMany.mockResolvedValue([] as never);
    await listDeviationReportsForStudent("profile-1");
    expect(prismaMock.deviationReport.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { studentProfileId: "profile-1" } })
    );
  });

  it("validateDeviationReport resolves without throwing", async () => {
    const result = await validateDeviationReport("dev-1", "faculty-1", "VALIDATE");
    expect(result.id).toBe("dev-1");
  });

  it("getDeviationReportStudentProfileId calls prisma with the right id", async () => {
    prismaMock.deviationReport.findUniqueOrThrow.mockResolvedValue({
      studentProfileId: "profile-1",
    } as never);
    await expect(getDeviationReportStudentProfileId("dev-1")).resolves.toBe("profile-1");
    expect(prismaMock.deviationReport.findUniqueOrThrow).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "dev-1" } })
    );
  });

  it("getWorkPlanStudentProfileId calls prisma with the right id", async () => {
    prismaMock.workPlan.findUniqueOrThrow.mockResolvedValue({
      studentProfileId: "profile-1",
    } as never);
    await expect(getWorkPlanStudentProfileId("wp-1")).resolves.toBe("profile-1");
    expect(prismaMock.workPlan.findUniqueOrThrow).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "wp-1" } })
    );
  });

  it("getRequiredHoursConfig resolves a number", async () => {
    await expect(getRequiredHoursConfig(Program.BSIT)).resolves.toBe(0);
  });

  it("setRequiredHoursConfig echoes its input", async () => {
    const result = await setRequiredHoursConfig(Program.BSIT, 600, "admin-1");
    expect(result.hours).toBe(600);
  });

  it("exportAttendanceLogCsv resolves a CSV header string", async () => {
    const csv = await exportAttendanceLogCsv("profile-1");
    expect(csv).toContain("date,scheduledHours,actualHours,status");
  });

  it("requestScheduleChange resolves a pending status", async () => {
    const result = await requestScheduleChange(
      "profile-1",
      { reason: "New shift", newScheduleConfig: { daysOfWeek: [1], hoursPerDay: 6 } },
      studentUser
    );
    expect(result.status).toBe("PENDING_FACULTY");
  });

  it("logScheduleChangeHistory resolves without throwing", async () => {
    await expect(
      logScheduleChangeHistory("wp-1", {
        timestamp: new Date().toISOString(),
        approverId: null,
        action: "REQUESTED",
      })
    ).resolves.toBeUndefined();
  });
});

describe("validateScheduleChangeFaculty", () => {
  it("throws InvalidScheduleChangeStateError when the request isn't PENDING_FACULTY", async () => {
    prismaMock.workPlan.findUniqueOrThrow.mockResolvedValue({
      scheduleChangeHistory: [],
    } as never);

    await expect(validateScheduleChangeFaculty("wp-1", "faculty-1", "APPROVE")).rejects.toThrow(
      InvalidScheduleChangeStateError
    );
  });

  it("throws when the last logged status is something other than PENDING_FACULTY", async () => {
    prismaMock.workPlan.findUniqueOrThrow.mockResolvedValue({
      scheduleChangeHistory: [{ status: "PENDING_COORDINATOR" }],
    } as never);

    await expect(validateScheduleChangeFaculty("wp-1", "faculty-1", "APPROVE")).rejects.toThrow(
      InvalidScheduleChangeStateError
    );
  });

  // `logScheduleChangeHistory` (bottom of this file) is B15 — a separate,
  // still-stubbed issue owned by Kenneth — so it's a no-op here. This test
  // only verifies validateScheduleChangeFaculty's own state-gate and return
  // value, not that the history entry actually lands in the DB.
  it("on APPROVE, advances to PENDING_COORDINATOR", async () => {
    prismaMock.workPlan.findUniqueOrThrow.mockResolvedValue({
      scheduleChangeHistory: [{ status: "PENDING_FACULTY" }],
    } as never);

    const result = await validateScheduleChangeFaculty("wp-1", "faculty-1", "APPROVE");

    expect(result).toEqual({ workPlanId: "wp-1", status: "PENDING_COORDINATOR" });
  });

  it("on REJECT, terminates the request as REJECTED", async () => {
    prismaMock.workPlan.findUniqueOrThrow.mockResolvedValue({
      scheduleChangeHistory: [{ status: "PENDING_FACULTY" }],
    } as never);

    const result = await validateScheduleChangeFaculty("wp-1", "faculty-1", "REJECT");

    expect(result).toEqual({ workPlanId: "wp-1", status: "REJECTED" });
  });
});

describe("computeTotalHoursRendered", () => {
  it("sums actualHours across APPROVED/REGARDED weekly reports and persists it", async () => {
    prismaMock.weeklyReport.findMany.mockResolvedValue([
      { dailyEntries: [{ actualHours: 8 }, { actualHours: 4.5 }] },
      { dailyEntries: [{ actualHours: 7.25 }] },
    ] as never);
    prismaMock.studentProfile.update.mockResolvedValue({} as never);

    const result = await computeTotalHoursRendered("profile-1");

    expect(result).toBe(19.75);
    expect(prismaMock.weeklyReport.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          studentProfileId: "profile-1",
          status: { in: [WeeklyReportStatus.APPROVED, WeeklyReportStatus.REGARDED] },
        },
      })
    );
    expect(prismaMock.studentProfile.update).toHaveBeenCalledWith({
      where: { id: "profile-1" },
      data: { renderedHours: 19.75 },
    });
    // Deliberately no audit-log assertion: this contract never says "Log via
    // logEvent" and the function runs on every GET read, so it must not
    // write to auditLog (see the comment above computeTotalHoursRendered).
    expect(prismaMock.auditLog.create).not.toHaveBeenCalled();
  });

  it("treats a null actualHours (unrecorded day) as 0", async () => {
    prismaMock.weeklyReport.findMany.mockResolvedValue([
      { dailyEntries: [{ actualHours: null }, { actualHours: 3 }] },
    ] as never);
    prismaMock.studentProfile.update.mockResolvedValue({} as never);

    await expect(computeTotalHoursRendered("profile-1")).resolves.toBe(3);
  });

  it("resolves 0 when the student has no APPROVED/REGARDED weekly reports yet", async () => {
    prismaMock.weeklyReport.findMany.mockResolvedValue([] as never);
    prismaMock.studentProfile.update.mockResolvedValue({} as never);

    await expect(computeTotalHoursRendered("profile-1")).resolves.toBe(0);
  });
});

describe("computeProjectedCompletionDate", () => {
  it("returns null when the student has no APPROVED work plan yet", async () => {
    prismaMock.workPlan.findFirst.mockResolvedValue(null);

    await expect(computeProjectedCompletionDate("profile-1")).resolves.toBeNull();
  });

  it("returns null when the approved work plan has no schedule configured", async () => {
    prismaMock.workPlan.findFirst.mockResolvedValue({ scheduleConfig: null } as never);

    await expect(computeProjectedCompletionDate("profile-1")).resolves.toBeNull();
  });

  it("returns today when required hours are already met", async () => {
    prismaMock.workPlan.findFirst.mockResolvedValue({
      scheduleConfig: { daysOfWeek: [1, 2, 3, 4, 5], hoursPerDay: 8 },
    } as never);
    prismaMock.weeklyReport.findMany.mockResolvedValue([
      { dailyEntries: [{ actualHours: 600 }] },
    ] as never);
    prismaMock.studentProfile.findUniqueOrThrow.mockResolvedValue({ requiredHours: 500 } as never);

    const result = await computeProjectedCompletionDate("profile-1");

    expect(result).toBeInstanceOf(Date);
  });

  it("projects forward using Manila-local weekdays, not raw UTC", async () => {
    // 2026-09-10T20:00:00Z = 2026-09-11T04:00 Manila-local, a Friday.
    // Plain getUTCDay() on the raw UTC instant would read Thursday instead —
    // exactly the off-by-one this test guards against.
    jest.useFakeTimers().setSystemTime(new Date("2026-09-10T20:00:00Z"));

    try {
      prismaMock.workPlan.findFirst.mockResolvedValue({
        // Only Monday(1)/Wednesday(3) are working days.
        scheduleConfig: { daysOfWeek: [1, 3], hoursPerDay: 8 },
      } as never);
      prismaMock.weeklyReport.findMany.mockResolvedValue([] as never);
      prismaMock.studentProfile.findUniqueOrThrow.mockResolvedValue({
        requiredHours: 16,
      } as never);

      const result = await computeProjectedCompletionDate("profile-1");

      // 16 required hours / 8 per day = 2 working days needed. From a
      // Manila Friday, the next two Mon/Wed working days are the following
      // Monday and Wednesday — 2026-09-16 Manila-local.
      expect(result).toEqual(new Date("2026-09-15T20:00:00.000Z"));
    } finally {
      jest.useRealTimers();
    }
  });

  it("does not itself persist renderedHours (no double-write alongside computeTotalHoursRendered)", async () => {
    prismaMock.workPlan.findFirst.mockResolvedValue({
      scheduleConfig: { daysOfWeek: [1, 2, 3, 4, 5], hoursPerDay: 8 },
    } as never);
    prismaMock.weeklyReport.findMany.mockResolvedValue([] as never);
    prismaMock.studentProfile.findUniqueOrThrow.mockResolvedValue({ requiredHours: 40 } as never);

    await computeProjectedCompletionDate("profile-1");

    expect(prismaMock.studentProfile.update).not.toHaveBeenCalled();
  });
});

describe("applyScheduleChangeProspectively", () => {
  it("throws MissingScheduleChangeRequestError when no request entry is found", async () => {
    prismaMock.workPlan.findUniqueOrThrow.mockResolvedValue({
      scheduleChangeHistory: [{ status: "PENDING_COORDINATOR" }],
    } as never);

    await expect(applyScheduleChangeProspectively("wp-1")).rejects.toThrow(
      MissingScheduleChangeRequestError
    );
  });

  it("applies the requested schedule config and returns an effective date", async () => {
    const newScheduleConfig = { daysOfWeek: [1, 2, 3, 4, 5], hoursPerDay: 8 };
    prismaMock.workPlan.findUniqueOrThrow.mockResolvedValue({
      studentProfileId: "profile-1",
      scheduleChangeHistory: [
        { status: "PENDING_FACULTY", newScheduleConfig },
        { status: "PENDING_COORDINATOR" },
        { status: "APPROVED" },
      ],
    } as never);

    const result = await applyScheduleChangeProspectively("wp-1");

    expect(result.workPlanId).toBe("wp-1");
    expect(result.effectiveFrom).toBeInstanceOf(Date);
    expect(prismaMock.workPlan.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "wp-1" },
        data: { scheduleConfig: newScheduleConfig },
      })
    );
  });

  it("picks the most recent history entry carrying a newScheduleConfig", async () => {
    const olderConfig = { daysOfWeek: [1], hoursPerDay: 4 };
    const latestConfig = { daysOfWeek: [1, 2], hoursPerDay: 6 };
    prismaMock.workPlan.findUniqueOrThrow.mockResolvedValue({
      studentProfileId: "profile-1",
      scheduleChangeHistory: [
        { status: "PENDING_FACULTY", newScheduleConfig: olderConfig },
        { status: "APPLIED" },
        { status: "PENDING_FACULTY", newScheduleConfig: latestConfig },
        { status: "APPROVED" },
      ],
    } as never);

    await applyScheduleChangeProspectively("wp-1");

    expect(prismaMock.workPlan.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { scheduleConfig: latestConfig } })
    );
  });
});

describe("approveScheduleChangeCoordinator", () => {
  it("throws InvalidScheduleChangeCoordinatorStateError when the request isn't PENDING_COORDINATOR", async () => {
    prismaMock.workPlan.findUniqueOrThrow.mockResolvedValue({
      scheduleChangeHistory: [{ status: "PENDING_FACULTY" }],
    } as never);

    await expect(approveScheduleChangeCoordinator("wp-1", "coord-1", "APPROVE")).rejects.toThrow(
      InvalidScheduleChangeCoordinatorStateError
    );
  });

  it("throws when there is no schedule-change history at all", async () => {
    prismaMock.workPlan.findUniqueOrThrow.mockResolvedValue({
      scheduleChangeHistory: [],
    } as never);

    await expect(approveScheduleChangeCoordinator("wp-1", "coord-1", "APPROVE")).rejects.toThrow(
      InvalidScheduleChangeCoordinatorStateError
    );
  });

  it("on REJECT, terminates the request as REJECTED without applying the change", async () => {
    prismaMock.workPlan.findUniqueOrThrow.mockResolvedValue({
      scheduleChangeHistory: [{ status: "PENDING_COORDINATOR" }],
    } as never);

    const result = await approveScheduleChangeCoordinator("wp-1", "coord-1", "REJECT");

    expect(result).toEqual({ workPlanId: "wp-1", status: "REJECTED" });
    expect(prismaMock.workPlan.update).not.toHaveBeenCalled();
  });

  it("on APPROVE, advances to APPROVED and applies the schedule change prospectively", async () => {
    const newScheduleConfig = { daysOfWeek: [1, 2, 3], hoursPerDay: 8 };
    prismaMock.workPlan.findUniqueOrThrow.mockResolvedValue({
      studentProfileId: "profile-1",
      scheduleChangeHistory: [
        { status: "PENDING_FACULTY", newScheduleConfig },
        { status: "PENDING_COORDINATOR" },
      ],
    } as never);

    const result = await approveScheduleChangeCoordinator("wp-1", "coord-1", "APPROVE");

    expect(result).toEqual({ workPlanId: "wp-1", status: "APPROVED" });
    expect(prismaMock.workPlan.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { scheduleConfig: newScheduleConfig } })
    );
  });
});
