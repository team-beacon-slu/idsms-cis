import { prismaMock, resetPrismaMock } from "@/testUtils/prismaMock";
import { DeviationType, Role, ValidationStatus } from "@prisma/client";
import {
  colorCodeCalendarEvents,
  detectEndorsementLetterSpikes,
  detectHighVolumeSubmissionWeeks,
  getCoordinatorCalendarView,
  getFacultyCalendarView,
  getStudentCalendarView,
  getUnifiedCalendarEvents,
} from "@/lib/services/calendarService";
import {
  computeProjectedCompletionDate,
  getHolidayCalendarForStudent,
} from "@/lib/services/attendanceService";
import { listWeeklyReportsForStudent } from "@/lib/services/weeklyReportService";

jest.mock("@/lib/services/attendanceService");
jest.mock("@/lib/services/weeklyReportService");

const mockedComputeProjectedCompletionDate = computeProjectedCompletionDate as jest.MockedFunction<
  typeof computeProjectedCompletionDate
>;
const mockedGetHolidayCalendarForStudent = getHolidayCalendarForStudent as jest.MockedFunction<
  typeof getHolidayCalendarForStudent
>;
const mockedListWeeklyReportsForStudent = listWeeklyReportsForStudent as jest.MockedFunction<
  typeof listWeeklyReportsForStudent
>;

beforeEach(() => {
  resetPrismaMock();
  mockedComputeProjectedCompletionDate.mockReset().mockResolvedValue(null);
  mockedGetHolidayCalendarForStudent.mockReset().mockResolvedValue([]);
  mockedListWeeklyReportsForStudent.mockReset().mockResolvedValue([]);
  prismaMock.deviationReport.findMany.mockResolvedValue([]);
});

describe("getUnifiedCalendarEvents", () => {
  it("STUDENT_INTERN: aggregates all four event types for their own profile only", async () => {
    prismaMock.studentProfile.findUnique.mockResolvedValue({ id: "profile-1" } as never);
    mockedListWeeklyReportsForStudent.mockResolvedValue([
      {
        weekStart: new Date("2026-03-02T00:00:00.000Z"), // Monday
        weekEnd: new Date("2026-03-08T00:00:00.000Z"), // Sunday
      },
    ] as never);
    mockedGetHolidayCalendarForStudent.mockResolvedValue([
      {
        id: "h-1",
        date: new Date("2026-04-09T00:00:00.000Z"),
        name: "Araw ng Kagitingan",
        applicable: true,
      },
      {
        id: "h-2",
        date: new Date("2026-05-01T00:00:00.000Z"),
        name: "Labor Day",
        applicable: false,
      },
    ]);
    prismaMock.deviationReport.findMany.mockResolvedValue([
      {
        id: "d-1",
        date: new Date("2026-03-05T00:00:00.000Z"),
        deviationType: DeviationType.OVERTIME,
        reason: "Client emergency",
      },
    ] as never);
    const completionDate = new Date("2026-06-15T00:00:00.000Z");
    mockedComputeProjectedCompletionDate.mockResolvedValue(completionDate);

    const events = await getUnifiedCalendarEvents("user-1", Role.STUDENT_INTERN);

    expect(prismaMock.studentProfile.findUnique).toHaveBeenCalledWith({
      where: { userId: "user-1" },
      select: { id: true },
    });
    expect(prismaMock.deviationReport.findMany).toHaveBeenCalledWith({
      where: { studentProfileId: "profile-1", validationStatus: ValidationStatus.VALIDATED },
    });
    expect(events).toHaveLength(4);
    expect(events).toContainEqual({
      type: "DEADLINE",
      date: new Date("2026-03-10T00:00:00.000Z"), // Tuesday after weekEnd
      label: "Weekly report due — week of 2026-03-02",
      studentProfileId: "profile-1",
    });
    expect(events).toContainEqual({
      type: "HOLIDAY",
      date: new Date("2026-04-09T00:00:00.000Z"),
      label: "Araw ng Kagitingan",
      studentProfileId: "profile-1",
    });
    expect(events.some((e) => e.label === "Labor Day")).toBe(false);
    expect(events).toContainEqual({
      type: "DEVIATION",
      date: new Date("2026-03-05T00:00:00.000Z"),
      label: "OVERTIME — Client emergency",
      studentProfileId: "profile-1",
    });
    expect(events).toContainEqual({
      type: "COMPLETION",
      date: completionDate,
      label: "Projected OJT Completion Date",
      studentProfileId: "profile-1",
    });
  });

  it("STUDENT_INTERN: resolves an empty array when no profile exists for the user", async () => {
    prismaMock.studentProfile.findUnique.mockResolvedValue(null);

    await expect(getUnifiedCalendarEvents("user-404", Role.STUDENT_INTERN)).resolves.toEqual([]);
    expect(prismaMock.deviationReport.findMany).not.toHaveBeenCalled();
  });

  it("FACULTY_ADVISER: resolves an empty array without querying students when no class groups are assigned", async () => {
    prismaMock.facultyClassGroup.findMany.mockResolvedValue([]);

    await expect(getUnifiedCalendarEvents("faculty-1", Role.FACULTY_ADVISER)).resolves.toEqual([]);
    expect(prismaMock.studentProfile.findMany).not.toHaveBeenCalled();
  });

  it("FACULTY_ADVISER: aggregates events across every student in their assigned class groups", async () => {
    prismaMock.facultyClassGroup.findMany.mockResolvedValue([
      { classGroupId: "cg-1", semesterId: "sem-1" },
    ] as never);
    prismaMock.studentProfile.findMany.mockResolvedValue([
      { id: "profile-1" },
      { id: "profile-2" },
    ] as never);

    const events = await getUnifiedCalendarEvents("faculty-1", Role.FACULTY_ADVISER);

    expect(prismaMock.studentProfile.findMany).toHaveBeenCalledWith({
      where: { deletedAt: null, OR: [{ classGroupId: "cg-1", semesterId: "sem-1" }] },
      select: { id: true },
    });
    // Both students' (empty) event sets got aggregated — two calls, one per id.
    expect(mockedListWeeklyReportsForStudent).toHaveBeenCalledWith("profile-1");
    expect(mockedListWeeklyReportsForStudent).toHaveBeenCalledWith("profile-2");
    expect(events).toEqual([]);
  });

  it("DEPARTMENT_COORDINATOR: scopes to every non-deleted student department-wide", async () => {
    prismaMock.studentProfile.findMany.mockResolvedValue([{ id: "profile-9" }] as never);

    await getUnifiedCalendarEvents("coordinator-1", Role.DEPARTMENT_COORDINATOR);

    expect(prismaMock.studentProfile.findMany).toHaveBeenCalledWith({
      where: { deletedAt: null },
      select: { id: true },
    });
    expect(mockedListWeeklyReportsForStudent).toHaveBeenCalledWith("profile-9");
  });

  it("rolls a deadline that would otherwise land on weekEnd's own Tuesday to the following week", async () => {
    prismaMock.studentProfile.findUnique.mockResolvedValue({ id: "profile-1" } as never);
    mockedListWeeklyReportsForStudent.mockResolvedValue([
      {
        weekStart: new Date("2026-03-03T00:00:00.000Z"),
        weekEnd: new Date("2026-03-10T00:00:00.000Z"), // Tuesday
      },
    ] as never);

    const events = await getUnifiedCalendarEvents("user-1", Role.STUDENT_INTERN);

    expect(events).toContainEqual(
      expect.objectContaining({ type: "DEADLINE", date: new Date("2026-03-17T00:00:00.000Z") })
    );
  });
});

describe("detectEndorsementLetterSpikes", () => {
  function studentIds(...ids: string[]) {
    prismaMock.studentProfile.findMany.mockResolvedValue(ids.map((id) => ({ id })) as never);
  }

  it("returns an empty array when there are no active students", async () => {
    studentIds();

    await expect(detectEndorsementLetterSpikes("coord-1")).resolves.toEqual([]);
    expect(prismaMock.studentProfile.findMany).toHaveBeenCalledWith({
      where: { deletedAt: null },
      select: { id: true },
    });
  });

  it("skips students with no projected completion date (no APPROVED schedule yet)", async () => {
    studentIds("s-1", "s-2");
    mockedComputeProjectedCompletionDate.mockResolvedValue(null);

    await expect(detectEndorsementLetterSpikes("coord-1")).resolves.toEqual([]);
  });

  it("clusters same-Manila-week completion dates into one bucket and only reports buckets at or above the spike threshold", async () => {
    studentIds("s-1", "s-2", "s-3", "s-4", "s-5");
    mockedComputeProjectedCompletionDate
      // Same Manila week (Mon 2026-03-02 – Sun 2026-03-08), different UTC
      // clock times — including one that's still Sunday in UTC but already
      // Monday in Manila, to prove the bucketing is Manila-local, not UTC.
      .mockResolvedValueOnce(new Date("2026-03-01T20:00:00.000Z"))
      .mockResolvedValueOnce(new Date("2026-03-04T10:00:00.000Z"))
      .mockResolvedValueOnce(new Date("2026-03-07T23:00:00.000Z"))
      // A different week, below threshold on its own.
      .mockResolvedValueOnce(new Date("2026-03-10T00:00:00.000Z"))
      // No schedule yet.
      .mockResolvedValueOnce(null);

    const spikes = await detectEndorsementLetterSpikes("coord-1");

    expect(spikes).toEqual([{ weekStart: new Date("2026-03-01T16:00:00.000Z"), expectedCount: 3 }]);
  });

  it("returns multiple spike weeks sorted ascending by weekStart", async () => {
    studentIds("s-1", "s-2", "s-3", "s-4", "s-5", "s-6");
    mockedComputeProjectedCompletionDate
      // Later week first, three students.
      .mockResolvedValueOnce(new Date("2026-04-06T01:00:00.000Z"))
      .mockResolvedValueOnce(new Date("2026-04-07T01:00:00.000Z"))
      .mockResolvedValueOnce(new Date("2026-04-08T01:00:00.000Z"))
      // Earlier week, three students.
      .mockResolvedValueOnce(new Date("2026-03-02T01:00:00.000Z"))
      .mockResolvedValueOnce(new Date("2026-03-03T01:00:00.000Z"))
      .mockResolvedValueOnce(new Date("2026-03-04T01:00:00.000Z"));

    const spikes = await detectEndorsementLetterSpikes("coord-1");

    expect(spikes.map((s) => s.weekStart.toISOString())).toEqual([
      new Date("2026-03-01T16:00:00.000Z").toISOString(),
      new Date("2026-04-05T16:00:00.000Z").toISOString(),
    ]);
    expect(spikes.every((s) => s.expectedCount === 3)).toBe(true);
  });
});

describe("calendarService stubs — reachable and wired correctly", () => {
  // TODO(JayPing23): replace each of these placeholder-return assertions
  // once the real logic behind it lands.
  it("colorCodeCalendarEvents is a pure passthrough placeholder", () => {
    const events = [{ type: "DEADLINE" as const, date: new Date(), label: "Week 1" }];
    expect(colorCodeCalendarEvents(events)).toBe(events);
  });

  it("getStudentCalendarView resolves an empty array", async () => {
    await expect(getStudentCalendarView("profile-1")).resolves.toEqual([]);
  });

  it("getFacultyCalendarView resolves an empty array", async () => {
    await expect(getFacultyCalendarView("faculty-1")).resolves.toEqual([]);
  });

  it("detectHighVolumeSubmissionWeeks resolves an empty array", async () => {
    await expect(detectHighVolumeSubmissionWeeks("faculty-1")).resolves.toEqual([]);
  });

  it("getCoordinatorCalendarView resolves an empty array", async () => {
    await expect(getCoordinatorCalendarView("coord-1")).resolves.toEqual([]);
  });
});
