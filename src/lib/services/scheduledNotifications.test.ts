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
  runDailyNotifications,
} from "@/lib/services/scheduledNotifications";

beforeEach(() => {
  resetPrismaMock();
  (notify as jest.Mock).mockClear();
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
      dedupeKey: "deadline:wr-1:48",
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
