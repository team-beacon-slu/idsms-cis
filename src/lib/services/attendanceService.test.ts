import { DeviationType, Program, Role, ValidationStatus } from "@prisma/client";
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

  it("computeTotalHoursRendered resolves a number", async () => {
    await expect(computeTotalHoursRendered("profile-1")).resolves.toBe(0);
  });

  it("computeProjectedCompletionDate resolves null", async () => {
    await expect(computeProjectedCompletionDate("profile-1")).resolves.toBeNull();
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

  it("validateScheduleChangeFaculty resolves without throwing", async () => {
    const result = await validateScheduleChangeFaculty("wp-1", "faculty-1", "APPROVE");
    expect(result.workPlanId).toBe("wp-1");
  });

  it("approveScheduleChangeCoordinator resolves without throwing", async () => {
    const result = await approveScheduleChangeCoordinator("wp-1", "coord-1", "APPROVE");
    expect(result.workPlanId).toBe("wp-1");
  });

  it("applyScheduleChangeProspectively resolves an effective date", async () => {
    const result = await applyScheduleChangeProspectively("wp-1");
    expect(result.effectiveFrom).toBeInstanceOf(Date);
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
