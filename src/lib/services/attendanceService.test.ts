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
  InvalidScheduleChangeStateError,
  listDeviationReportsForStudent,
  logScheduleChangeHistory,
  markHolidayApplicable,
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

  it("approveScheduleChangeCoordinator resolves without throwing", async () => {
    const result = await approveScheduleChangeCoordinator("wp-1", "coord-1", "APPROVE");
    expect(result.workPlanId).toBe("wp-1");
  });

  it("applyScheduleChangeProspectively resolves an effective date", async () => {
    const result = await applyScheduleChangeProspectively("wp-1");
    expect(result.effectiveFrom).toBeInstanceOf(Date);
  });
});

describe("logScheduleChangeHistory", () => {
  it("appends the entry to an existing scheduleChangeHistory array", async () => {
    const existingEntry = {
      timestamp: "2026-01-01T00:00:00.000Z",
      approverId: null,
      action: "REQUESTED",
      status: "PENDING_FACULTY",
    };
    prismaMock.workPlan.findUniqueOrThrow.mockResolvedValue({
      scheduleChangeHistory: [existingEntry],
    } as never);
    prismaMock.workPlan.update.mockResolvedValue({} as never);

    const newEntry = {
      timestamp: "2026-01-02T00:00:00.000Z",
      approverId: "faculty-1",
      action: "APPROVE",
      status: "PENDING_COORDINATOR",
    };
    await logScheduleChangeHistory("wp-1", newEntry);

    expect(prismaMock.workPlan.update).toHaveBeenCalledWith({
      where: { id: "wp-1" },
      data: { scheduleChangeHistory: [existingEntry, newEntry] },
    });
  });

  it("starts a fresh array when scheduleChangeHistory is empty", async () => {
    prismaMock.workPlan.findUniqueOrThrow.mockResolvedValue({
      scheduleChangeHistory: [],
    } as never);
    prismaMock.workPlan.update.mockResolvedValue({} as never);

    const entry = { timestamp: "2026-01-01T00:00:00.000Z", approverId: null, action: "REQUESTED" };
    await logScheduleChangeHistory("wp-1", entry);

    expect(prismaMock.workPlan.update).toHaveBeenCalledWith({
      where: { id: "wp-1" },
      data: { scheduleChangeHistory: [entry] },
    });
  });
});

describe("computeTotalHoursRendered", () => {
  it("sums actualHours only from APPROVED/REGARDED weekly reports, treating null as 0", async () => {
    prismaMock.weeklyReport.findMany.mockResolvedValue([
      { dailyEntries: [{ actualHours: 8 }, { actualHours: 4 }] },
      { dailyEntries: [{ actualHours: null }, { actualHours: 6 }] },
    ] as never);
    prismaMock.studentProfile.update.mockResolvedValue({} as never);

    const total = await computeTotalHoursRendered("profile-1");

    expect(prismaMock.weeklyReport.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          studentProfileId: "profile-1",
          status: { in: [WeeklyReportStatus.APPROVED, WeeklyReportStatus.REGARDED] },
        },
      })
    );
    expect(total).toBe(18);
  });

  it("writes the computed total to StudentProfile.renderedHours and returns it", async () => {
    prismaMock.weeklyReport.findMany.mockResolvedValue([
      { dailyEntries: [{ actualHours: 3.5 }] },
    ] as never);
    prismaMock.studentProfile.update.mockResolvedValue({} as never);

    const total = await computeTotalHoursRendered("profile-1");

    expect(prismaMock.studentProfile.update).toHaveBeenCalledWith({
      where: { id: "profile-1" },
      data: { renderedHours: 3.5 },
    });
    expect(total).toBe(3.5);
  });

  it("returns 0 when the student has no APPROVED/REGARDED weekly reports yet", async () => {
    prismaMock.weeklyReport.findMany.mockResolvedValue([] as never);
    prismaMock.studentProfile.update.mockResolvedValue({} as never);

    await expect(computeTotalHoursRendered("profile-1")).resolves.toBe(0);
  });
});

describe("computeProjectedCompletionDate", () => {
  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(new Date("2026-08-31T00:00:00.000Z")); // a Monday
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("returns null when the student has no APPROVED work plan yet", async () => {
    prismaMock.workPlan.findFirst.mockResolvedValue(null);

    await expect(computeProjectedCompletionDate("profile-1")).resolves.toBeNull();
  });

  it("returns null when the approved work plan has no scheduleConfig set", async () => {
    prismaMock.workPlan.findFirst.mockResolvedValue({ scheduleConfig: null } as never);

    await expect(computeProjectedCompletionDate("profile-1")).resolves.toBeNull();
  });

  it("returns null instead of throwing when scheduleConfig is malformed JSON", async () => {
    prismaMock.workPlan.findFirst.mockResolvedValue({
      scheduleConfig: { daysOfWeek: "not-an-array" },
    } as never);

    await expect(computeProjectedCompletionDate("profile-1")).resolves.toBeNull();
  });

  it("returns null instead of looping forever when daysOfWeek has an out-of-range day", async () => {
    prismaMock.workPlan.findFirst.mockResolvedValue({
      scheduleConfig: { daysOfWeek: [7], hoursPerDay: 8 }, // 7 never matches Date#getDay()'s 0-6
    } as never);

    await expect(computeProjectedCompletionDate("profile-1")).resolves.toBeNull();
  });

  it("projects forward only over configured working days until remaining hours are covered", async () => {
    prismaMock.workPlan.findFirst.mockResolvedValue({
      scheduleConfig: { daysOfWeek: [1], hoursPerDay: 8 }, // Mondays only
    } as never);
    prismaMock.weeklyReport.findMany.mockResolvedValue([
      { dailyEntries: [{ actualHours: 60 }] },
    ] as never);
    prismaMock.studentProfile.findUniqueOrThrow.mockResolvedValue({
      requiredHours: 76,
    } as never);

    // remainingHours = 76 - 60 = 16 -> 2 Mondays needed from 2026-08-31.
    const result = await computeProjectedCompletionDate("profile-1");

    expect(result?.toISOString().slice(0, 10)).toBe("2026-09-14");
    // Must not persist a second, competing renderedHours write of its own —
    // that's computeTotalHoursRendered's job, called separately by the route.
    expect(prismaMock.studentProfile.update).not.toHaveBeenCalled();
  });

  it("returns today once required hours are already met", async () => {
    prismaMock.workPlan.findFirst.mockResolvedValue({
      scheduleConfig: { daysOfWeek: [1], hoursPerDay: 8 },
    } as never);
    prismaMock.weeklyReport.findMany.mockResolvedValue([
      { dailyEntries: [{ actualHours: 80 }] },
    ] as never);
    prismaMock.studentProfile.findUniqueOrThrow.mockResolvedValue({
      requiredHours: 76,
    } as never);

    const result = await computeProjectedCompletionDate("profile-1");

    expect(result?.toISOString().slice(0, 10)).toBe("2026-08-31");
  });

  it("returns null instead of hanging when hoursPerDay is degenerately small", async () => {
    prismaMock.workPlan.findFirst.mockResolvedValue({
      scheduleConfig: { daysOfWeek: [1, 2, 3, 4, 5], hoursPerDay: 1e-10 },
    } as never);
    prismaMock.weeklyReport.findMany.mockResolvedValue([] as never);
    prismaMock.studentProfile.findUniqueOrThrow.mockResolvedValue({
      requiredHours: 600,
    } as never);

    await expect(computeProjectedCompletionDate("profile-1")).resolves.toBeNull();
  });
});

describe("validateScheduleChangeFaculty", () => {
  function workPlanWithHistoryStatus(status: string) {
    return {
      scheduleChangeHistory: [
        { timestamp: "2026-01-01T00:00:00.000Z", approverId: null, action: "REQUESTED", status },
      ],
    };
  }

  it("throws InvalidScheduleChangeStateError when there is no schedule-change history at all", async () => {
    prismaMock.workPlan.findUniqueOrThrow.mockResolvedValue({
      scheduleChangeHistory: [],
    } as never);

    await expect(validateScheduleChangeFaculty("wp-1", "faculty-1", "APPROVE")).rejects.toThrow(
      InvalidScheduleChangeStateError
    );
  });

  it("throws InvalidScheduleChangeStateError when the latest entry is not PENDING_FACULTY", async () => {
    prismaMock.workPlan.findUniqueOrThrow.mockResolvedValue(
      workPlanWithHistoryStatus("PENDING_COORDINATOR") as never
    );

    await expect(validateScheduleChangeFaculty("wp-1", "faculty-1", "APPROVE")).rejects.toThrow(
      InvalidScheduleChangeStateError
    );
  });

  it("advances a PENDING_FACULTY request to PENDING_COORDINATOR on APPROVE, persists it, and audit-logs it", async () => {
    prismaMock.workPlan.findUniqueOrThrow.mockResolvedValue(
      workPlanWithHistoryStatus("PENDING_FACULTY") as never
    );
    prismaMock.workPlan.update.mockResolvedValue({} as never);

    const result = await validateScheduleChangeFaculty("wp-1", "faculty-1", "APPROVE");

    expect(result).toEqual({ workPlanId: "wp-1", status: "PENDING_COORDINATOR" });
    expect(prismaMock.workPlan.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "wp-1" },
        data: expect.objectContaining({
          scheduleChangeHistory: expect.arrayContaining([
            expect.objectContaining({
              approverId: "faculty-1",
              action: "APPROVE",
              status: "PENDING_COORDINATOR",
            }),
          ]),
        }),
      })
    );
    expect(prismaMock.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: "SCHEDULE_CHANGE_FACULTY_APPROVED",
          entityType: "WorkPlan",
          entityId: "wp-1",
        }),
      })
    );
  });

  it("makes REJECT terminal instead of advancing to PENDING_COORDINATOR", async () => {
    prismaMock.workPlan.findUniqueOrThrow.mockResolvedValue(
      workPlanWithHistoryStatus("PENDING_FACULTY") as never
    );
    prismaMock.workPlan.update.mockResolvedValue({} as never);

    const result = await validateScheduleChangeFaculty("wp-1", "faculty-1", "REJECT");

    expect(result).toEqual({ workPlanId: "wp-1", status: "REJECTED_BY_FACULTY" });
    expect(prismaMock.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: "SCHEDULE_CHANGE_FACULTY_REJECTED" }),
      })
    );
  });
});
