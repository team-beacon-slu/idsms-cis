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

  it("detectEndorsementLetterSpikes resolves an empty array", async () => {
    await expect(detectEndorsementLetterSpikes("coord-1")).resolves.toEqual([]);
  });
});
