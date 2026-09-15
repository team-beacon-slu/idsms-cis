import { prismaMock, resetPrismaMock } from "@/testUtils/prismaMock";
import { Role } from "@prisma/client";
import {
  colorCodeCalendarEvents,
  detectEndorsementLetterSpikes,
  detectHighVolumeSubmissionWeeks,
  getCoordinatorCalendarView,
  getFacultyCalendarView,
  getStudentCalendarView,
  getUnifiedCalendarEvents,
} from "@/lib/services/calendarService";
import { computeProjectedCompletionDate } from "@/lib/services/attendanceService";

jest.mock("@/lib/services/attendanceService");

const mockedComputeProjectedCompletionDate = computeProjectedCompletionDate as jest.MockedFunction<
  typeof computeProjectedCompletionDate
>;

beforeEach(() => {
  resetPrismaMock();
  mockedComputeProjectedCompletionDate.mockReset();
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
  it("getUnifiedCalendarEvents resolves an empty array", async () => {
    await expect(getUnifiedCalendarEvents("user-1", Role.STUDENT_INTERN)).resolves.toEqual([]);
  });

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
