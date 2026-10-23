import { prismaMock, resetPrismaMock } from "@/testUtils/prismaMock";
import {
  bucketHighVolumeSubmissionWeeks,
  detectHighVolumeSubmissionWeeks,
  type CalendarEvent,
} from "@/lib/services/calendar/calendarService";
beforeEach(() => {
  resetPrismaMock();
  prismaMock.facultyClassGroup.findMany.mockResolvedValue([]);
});
const deadline = (date: string): CalendarEvent => ({
  type: "DEADLINE",
  date: new Date(date),
  label: "Report due",
});
it("counts only deadlines and flags strictly above the configured threshold", () => {
  const events: CalendarEvent[] = [
    deadline("2026-10-05"),
    deadline("2026-10-06"),
    { type: "HOLIDAY", date: new Date("2026-10-05"), label: "Holiday" },
  ];
  expect(bucketHighVolumeSubmissionWeeks(events, 2)).toEqual([]);
  expect(bucketHighVolumeSubmissionWeeks(events, 1)).toEqual([
    { weekStart: new Date("2026-10-04T16:00:00Z"), count: 2 },
  ]);
});
it("uses Manila Monday boundaries and sorts across a year boundary", () => {
  const events = [
    deadline("2027-01-04T16:00:00Z"),
    deadline("2027-01-03T16:00:00Z"),
    deadline("2027-01-03T15:59:59Z"),
    deadline("2026-12-28T00:00:00Z"),
  ];
  expect(bucketHighVolumeSubmissionWeeks(events, 1)).toEqual([
    { weekStart: new Date("2026-12-27T16:00:00Z"), count: 2 },
    { weekStart: new Date("2027-01-03T16:00:00Z"), count: 2 },
  ]);
});
it("handles an empty calendar", () => {
  expect(bucketHighVolumeSubmissionWeeks([], 20)).toEqual([]);
});
it.each([null, { configValue: 2 }])(
  "loads the optional configured threshold (%p)",
  async (config) => {
    prismaMock.systemConfig.findUnique.mockResolvedValue(config as never);
    expect(await detectHighVolumeSubmissionWeeks("faculty-1")).toEqual([]);
    expect(prismaMock.systemConfig.findUnique).toHaveBeenCalledWith({
      where: { configKey: "faculty_submission_threshold" },
      select: { configValue: true },
    });
  }
);
it.each([0, -1, 1.5, "20", {}, null])(
  "rejects corrupt stored thresholds (%p)",
  async (configValue) => {
    prismaMock.systemConfig.findUnique.mockResolvedValue({ configValue } as never);
    await expect(detectHighVolumeSubmissionWeeks("faculty-1")).rejects.toThrow(
      "Invalid faculty submission threshold"
    );
  }
);
it("propagates config lookup failures", async () => {
  prismaMock.systemConfig.findUnique.mockRejectedValue(new Error("Unavailable"));
  await expect(detectHighVolumeSubmissionWeeks("faculty-1")).rejects.toThrow("Unavailable");
});

it("reuses the events the page already loaded instead of rebuilding the faculty view", async () => {
  prismaMock.systemConfig.findUnique.mockResolvedValue(null);

  expect(await detectHighVolumeSubmissionWeeks("faculty-1", [])).toEqual([]);

  expect(prismaMock.facultyClassGroup.findMany).not.toHaveBeenCalled();
  expect(prismaMock.studentProfile.findMany).not.toHaveBeenCalled();
});
