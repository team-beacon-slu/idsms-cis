import { prismaMock, resetPrismaMock } from "@/testUtils/prismaMock";

jest.mock("@/lib/services/notify", () => ({
  notify: jest.fn().mockResolvedValue({ inApp: 1, emailed: 0, failed: 0 }),
}));
jest.mock("@/lib/services/companyService", () => ({
  getExpiringMoaRecords: jest.fn().mockResolvedValue([]),
}));
jest.mock("@/lib/services/notificationRecipients", () => ({
  getDepartmentStaffIds: jest.fn().mockResolvedValue(["c-1"]),
}));

import { notify } from "@/lib/services/notify";
import {
  getNotificationSettings,
  notificationSettingsSchema,
  runDailyNotifications,
} from "@/lib/services/scheduledNotifications";

beforeEach(() => {
  resetPrismaMock();
  (notify as jest.Mock).mockClear();
  jest
    .spyOn(console, "error")
    .mockImplementation(() => {})
    .mockClear();
  // Deployed students without a report row for the week: none unless a test says so.
  prismaMock.studentProfile.findMany.mockResolvedValue([] as never);
});

const NOW = new Date("2026-10-12T00:00:00Z"); // Mon 08:00 Manila
const openReport = (id: string, profileId: string, userId: string) => ({
  id,
  weekStart: new Date("2026-10-05T00:00:00Z"),
  weekEnd: new Date("2026-10-11T00:00:00Z"),
  status: "PENDING",
  revisionHistory: [],
  studentProfile: { id: profileId, userId },
});

it("keeps reminding other students when one report fails, and reports the error", async () => {
  prismaMock.systemConfig.findUnique.mockResolvedValue(null);
  prismaMock.weeklyReport.findMany.mockResolvedValue([
    openReport("wr-1", "p-1", "u-1"),
    openReport("wr-2", "p-2", "u-2"),
  ] as never);
  prismaMock.notification.findFirst
    .mockRejectedValueOnce(new Error("db blip"))
    .mockResolvedValue(null);

  const result = await runDailyNotifications(NOW);

  expect(result.deadlineReminders).toBe(1);
  expect(result.errors).toHaveLength(1);
  expect(notify).toHaveBeenCalledWith(expect.objectContaining({ userIds: ["u-2"] }));
});

it("counts only reminders notify actually delivered", async () => {
  prismaMock.systemConfig.findUnique.mockResolvedValue(null);
  prismaMock.weeklyReport.findMany.mockResolvedValue([openReport("wr-1", "p-1", "u-1")] as never);
  prismaMock.notification.findFirst.mockResolvedValue(null);
  (notify as jest.Mock).mockResolvedValueOnce({ inApp: 0, emailed: 0, failed: 0 });

  const result = await runDailyNotifications(NOW);
  expect(result.deadlineReminders).toBe(0);
});

it("only scans reports from recent weeks", async () => {
  prismaMock.systemConfig.findUnique.mockResolvedValue(null);
  prismaMock.weeklyReport.findMany.mockResolvedValue([] as never);
  await runDailyNotifications(NOW);
  expect(prismaMock.weeklyReport.findMany).toHaveBeenCalledWith(
    expect.objectContaining({
      where: expect.objectContaining({ weekEnd: { gte: new Date("2026-10-02T00:00:00Z") } }),
    })
  );
});

it("reminds deployed students who have not started last week's report", async () => {
  prismaMock.systemConfig.findUnique.mockResolvedValue(null);
  prismaMock.weeklyReport.findMany.mockResolvedValue([] as never);
  prismaMock.studentProfile.findMany.mockResolvedValue([{ id: "p-9", userId: "u-9" }] as never);
  prismaMock.notification.findFirst.mockResolvedValue(null);

  const result = await runDailyNotifications(NOW);

  expect(result.deadlineReminders).toBe(1);
  expect(notify).toHaveBeenCalledWith(
    expect.objectContaining({ userIds: ["u-9"], dedupeKey: "deadline:p-9:2026-10-05:48" })
  );
  expect(prismaMock.studentProfile.findMany).toHaveBeenCalledWith(
    expect.objectContaining({
      where: expect.objectContaining({
        companyId: { not: null },
        weeklyReports: { none: { weekStart: new Date("2026-10-05T00:00:00Z") } },
      }),
    })
  );
});

it("logs when stored settings are invalid and falls back to defaults", async () => {
  prismaMock.systemConfig.findUnique.mockResolvedValue({ configValue: "garbage" } as never);
  await expect(getNotificationSettings()).resolves.toEqual({
    deadlineReminderHours: [48, 24],
    moaWarningDays: 30,
  });
  expect(console.error).toHaveBeenCalled();
});

it("rejects reminder windows a once-a-day job can never hit", () => {
  // Runs at 08:00 Manila; the closest run to Tue 23:59 is ~16h before it.
  expect(
    notificationSettingsSchema.safeParse({ deadlineReminderHours: [12], moaWarningDays: 30 })
      .success
  ).toBe(false);
  expect(
    notificationSettingsSchema.safeParse({ deadlineReminderHours: [16], moaWarningDays: 30 })
      .success
  ).toBe(true);
});

it("defaults to 48h and 24h reminders and a 30-day MOA warning", async () => {
  prismaMock.systemConfig.findUnique.mockResolvedValue(null);
  await expect(getNotificationSettings()).resolves.toEqual({
    deadlineReminderHours: [48, 24],
    moaWarningDays: 30,
  });
});

it("reminds students whose open report is due within the window, once", async () => {
  prismaMock.systemConfig.findUnique.mockResolvedValue(null);
  // now = Mon 2026-10-12 08:00 Manila; week ending Sun 10-11 is due Tue 10-13 23:59 Manila (~40h away)
  prismaMock.weeklyReport.findMany.mockResolvedValue([
    {
      id: "wr-1",
      weekStart: new Date("2026-10-05T00:00:00Z"),
      weekEnd: new Date("2026-10-11T00:00:00Z"),
      status: "PENDING",
      revisionHistory: [],
      studentProfile: { id: "p-1", userId: "u-1" },
    },
  ] as never);
  prismaMock.notification.findFirst.mockResolvedValue(null);

  const result = await runDailyNotifications(new Date("2026-10-12T00:00:00Z"));

  expect(result.deadlineReminders).toBe(1);
  expect(notify).toHaveBeenCalledWith(
    expect.objectContaining({
      userIds: ["u-1"],
      trigger: "DEADLINE_REMINDER",
      dedupeKey: "deadline:p-1:2026-10-05:48",
      email: true,
    })
  );
});

it("skips reminders already sent today", async () => {
  prismaMock.systemConfig.findUnique.mockResolvedValue(null);
  prismaMock.weeklyReport.findMany.mockResolvedValue([
    {
      id: "wr-1",
      weekStart: new Date("2026-10-05T00:00:00Z"),
      weekEnd: new Date("2026-10-11T00:00:00Z"),
      status: "PENDING",
      revisionHistory: [],
      studentProfile: { id: "p-1", userId: "u-1" },
    },
  ] as never);
  prismaMock.notification.findFirst.mockResolvedValue({ id: "already" } as never);

  const result = await runDailyNotifications(new Date("2026-10-12T00:00:00Z"));
  expect(result.deadlineReminders).toBe(0);
  expect(notify).not.toHaveBeenCalled();
});

it("does not remind for reports already submitted", async () => {
  prismaMock.systemConfig.findUnique.mockResolvedValue(null);
  prismaMock.weeklyReport.findMany.mockResolvedValue([
    {
      id: "wr-1",
      weekStart: new Date("2026-10-05T00:00:00Z"),
      weekEnd: new Date("2026-10-11T00:00:00Z"),
      status: "PENDING",
      revisionHistory: [{ type: "SUBMITTED", timestamp: "t" }],
      studentProfile: { id: "p-1", userId: "u-1" },
    },
  ] as never);
  const result = await runDailyNotifications(new Date("2026-10-12T00:00:00Z"));
  expect(result.deadlineReminders).toBe(0);
});

it("does not repeat the MOA warning on a same-day re-run", async () => {
  const { getExpiringMoaRecords } = jest.requireMock("@/lib/services/companyService");
  (getExpiringMoaRecords as jest.Mock).mockResolvedValue([{ id: "moa-1" }]);
  prismaMock.systemConfig.findUnique.mockResolvedValue(null);
  prismaMock.weeklyReport.findMany.mockResolvedValue([] as never);
  prismaMock.notification.findFirst.mockResolvedValue({ id: "sent-earlier-today" } as never);

  const result = await runDailyNotifications(new Date("2026-10-12T00:00:00Z"));

  expect(result.moaWarnings).toBe(0);
  expect(notify).not.toHaveBeenCalled();
  expect(prismaMock.notification.findFirst).toHaveBeenCalledWith(
    expect.objectContaining({
      where: expect.objectContaining({
        triggerType: "MOA_EXPIRING",
        payload: { path: ["dedupeKey"], equals: "moa:2026-10-12" },
      }),
    })
  );
});

it("warns department staff about expiring MOAs once per day", async () => {
  const { getExpiringMoaRecords } = jest.requireMock("@/lib/services/companyService");
  (getExpiringMoaRecords as jest.Mock).mockResolvedValue([{ id: "moa-1" }, { id: "moa-2" }]);
  prismaMock.systemConfig.findUnique.mockResolvedValue(null);
  prismaMock.weeklyReport.findMany.mockResolvedValue([] as never);
  prismaMock.notification.findFirst.mockResolvedValue(null);

  const result = await runDailyNotifications(new Date("2026-10-12T00:00:00Z"));

  expect(result.moaWarnings).toBe(2);
  expect(notify).toHaveBeenCalledWith(
    expect.objectContaining({
      userIds: ["c-1"],
      trigger: "MOA_EXPIRING",
      dedupeKey: "moa:2026-10-12",
    })
  );
});
