import { attendancePattern, patternNote } from "./attendancePattern";

const now = new Date("2026-11-06T04:00:00Z");
const day = (d: string, status: string, timeIn: string | null = null, scheduledHours = 8) => ({
  reportDate: new Date(`${d}T00:00:00Z`),
  attendanceStatus: status,
  scheduledHours,
  timeIn,
});
const shift = { startMin: 8 * 60, endMin: 17 * 60, breakMinutes: 60, scheduledHours: 8 };

describe("attendancePattern", () => {
  it("counts absences and late arrivals on scheduled days of the last 4 weeks", () => {
    const p = attendancePattern(
      [
        day("2026-11-02", "ABSENT"),
        day("2026-11-03", "ABSENT"),
        day("2026-10-20", "ABSENT"),
        day("2026-10-01", "ABSENT"), // older than 28 days
        day("2026-11-01", "ABSENT", null, 0), // not a scheduled day
        day("2026-11-04", "PRESENT", "08:15"),
        day("2026-11-05", "PRESENT", "08:00"), // on time
        day("2026-11-12", "ABSENT"), // future
      ],
      shift,
      now
    );
    expect(p).toEqual({ absences: 3, lateArrivals: 1 });
  });

  it("counts no lateness without shift times (legacy schedules)", () => {
    expect(attendancePattern([day("2026-11-04", "PRESENT", "09:00")], null, now).lateArrivals).toBe(
      0
    );
  });
});

describe("patternNote", () => {
  it("names only what reaches 3", () => {
    expect(patternNote({ absences: 3, lateArrivals: 2 })).toBe("Absent 3× in 4 weeks");
    expect(patternNote({ absences: 4, lateArrivals: 5 })).toBe("Absent 4×, Late 5× in 4 weeks");
    expect(patternNote({ absences: 2, lateArrivals: 2 })).toBeNull();
  });
});
