import { prismaMock, resetPrismaMock } from "@/testUtils/prismaMock";

jest.mock("@/lib/services/notifications/notify", () => ({
  notify: jest.fn().mockResolvedValue({ inApp: 1, emailed: 0, failed: 0 }),
}));
jest.mock("@/lib/services/privacy/retentionService", () => ({
  runRetentionScan: jest.fn().mockResolvedValue({ ran: false, flagged: 0 }),
}));
jest.mock("@/lib/services/predeployment/companyService", () => ({
  getExpiringMoaRecords: jest.fn().mockResolvedValue([]),
}));
jest.mock("@/lib/services/notifications/notificationRecipients", () => ({
  getDepartmentStaffIds: jest.fn().mockResolvedValue(["c-1"]),
  getSuperAdminIds: jest.fn().mockResolvedValue(["sa-1"]),
}));

import { notify } from "@/lib/services/notifications/notify";
import { runRetentionScan } from "@/lib/services/privacy/retentionService";
import {
  getNotificationSettings,
  notificationSettingsSchema,
  remindDueDataRequests,
  runDailyNotifications,
} from "@/lib/services/notifications/scheduledNotifications";

beforeEach(() => {
  resetPrismaMock();
  (notify as jest.Mock).mockClear();
  jest
    .spyOn(console, "error")
    .mockImplementation(() => {})
    .mockClear();
  // Deployed students without a report row for the week: none unless a test says so.
  prismaMock.studentProfile.findMany.mockResolvedValue([] as never);
  // No open data requests unless a test says so.
  prismaMock.dataRequest.findMany.mockResolvedValue([] as never);
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

it("does not remind former interns: archived semesters or hours already complete", async () => {
  prismaMock.systemConfig.findUnique.mockResolvedValue(null);
  prismaMock.weeklyReport.findMany.mockResolvedValue([] as never);
  prismaMock.studentProfile.findMany.mockResolvedValue([
    { id: "p-done", userId: "u-done", renderedHours: 486, requiredHours: 486 },
    { id: "p-active", userId: "u-active", renderedHours: 120, requiredHours: 486 },
  ] as never);
  prismaMock.notification.findFirst.mockResolvedValue(null);

  await runDailyNotifications(NOW);

  expect(notify).toHaveBeenCalledTimes(1);
  expect(notify).toHaveBeenCalledWith(expect.objectContaining({ userIds: ["u-active"] }));
  expect(prismaMock.studentProfile.findMany).toHaveBeenCalledWith(
    expect.objectContaining({
      where: expect.objectContaining({ semester: { archivedAt: null } }),
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
  const { getExpiringMoaRecords } = jest.requireMock("@/lib/services/predeployment/companyService");
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
  const { getExpiringMoaRecords } = jest.requireMock("@/lib/services/predeployment/companyService");
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

describe("remindDueDataRequests", () => {
  const DAY = 24 * 60 * 60 * 1000;
  const request = (id: string, dueAt: Date) => ({ id, dueAt, user: { email: `${id}@x.edu` } });

  it("selects only OPEN requests due within 3 days (overdue included)", async () => {
    prismaMock.dataRequest.findMany.mockResolvedValue([] as never);
    await remindDueDataRequests(NOW);
    expect(prismaMock.dataRequest.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { status: "OPEN", dueAt: { lte: new Date(NOW.getTime() + 3 * DAY) } },
      })
    );
  });

  it("sends a 'due soon' notice to super admins for a request due in 2 days", async () => {
    prismaMock.dataRequest.findMany.mockResolvedValue([
      request("r1", new Date(NOW.getTime() + 2 * DAY)),
    ] as never);
    const count = await remindDueDataRequests(NOW);
    expect(count).toBe(1);
    expect(notify).toHaveBeenCalledWith(
      expect.objectContaining({
        userIds: ["sa-1"],
        trigger: "DSAR_DUE",
        title: "Data request due soon",
        body: "r1@x.edu's request is due 2026-10-14.",
        link: "/admin/export-center#data-requests",
        dedupeKey: "dsar:r1:2026-10-12",
      })
    );
  });

  it("sends an 'overdue' notice for a request due 5 days ago", async () => {
    prismaMock.dataRequest.findMany.mockResolvedValue([
      request("r2", new Date(NOW.getTime() - 5 * DAY)),
    ] as never);
    await remindDueDataRequests(NOW);
    expect(notify).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Data request overdue",
        body: "r2@x.edu's request was due 2026-10-07.",
      })
    );
  });

  it("words the due date in Manila calendar days", async () => {
    prismaMock.dataRequest.findMany.mockResolvedValue([
      request("r5", new Date("2026-10-14T18:00:00Z")),
    ] as never);
    await remindDueDataRequests(NOW);
    expect(notify).toHaveBeenCalledWith(
      expect.objectContaining({ body: "r5@x.edu's request is due 2026-10-15." })
    );
  });

  it("does not re-send when the day's reminder already exists", async () => {
    prismaMock.dataRequest.findMany.mockResolvedValue([
      request("r3", new Date(NOW.getTime() + DAY)),
    ] as never);
    prismaMock.notification.findFirst.mockResolvedValue({ id: "n" } as never);
    expect(await remindDueDataRequests(NOW)).toBe(0);
    expect(notify).not.toHaveBeenCalled();
  });

  it("runDailyNotifications runs it and isolates a thrown error", async () => {
    prismaMock.systemConfig.findUnique.mockResolvedValue(null);
    prismaMock.weeklyReport.findMany.mockResolvedValue([] as never);
    prismaMock.dataRequest.findMany.mockRejectedValue(new Error("boom"));
    const result = await runDailyNotifications(NOW);
    expect(result.errors).toContain("dsar");
    expect(result.dsarReminders).toBe(0);
  });

  it("runDailyNotifications runs the retention scan with now", async () => {
    prismaMock.systemConfig.findUnique.mockResolvedValue(null);
    prismaMock.weeklyReport.findMany.mockResolvedValue([] as never);
    (runRetentionScan as jest.Mock).mockResolvedValueOnce({ ran: true, flagged: 4 });
    const result = await runDailyNotifications(NOW);
    expect(runRetentionScan).toHaveBeenCalledWith(NOW);
    expect(result.retention).toEqual({ ran: true, flagged: 4 });
  });

  it("runDailyNotifications isolates a retention scan failure", async () => {
    prismaMock.systemConfig.findUnique.mockResolvedValue(null);
    prismaMock.weeklyReport.findMany.mockResolvedValue([] as never);
    (runRetentionScan as jest.Mock).mockRejectedValueOnce(new Error("boom"));
    const result = await runDailyNotifications(NOW);
    expect(result.errors).toContain("retention");
    expect(result.errors).not.toContain("dsar");
    expect(result.retention).toBeNull();
  });

  it("runDailyNotifications reports the reminder count", async () => {
    prismaMock.systemConfig.findUnique.mockResolvedValue(null);
    prismaMock.weeklyReport.findMany.mockResolvedValue([] as never);
    prismaMock.dataRequest.findMany.mockResolvedValue([
      request("r4", new Date(NOW.getTime() + DAY)),
    ] as never);
    const result = await runDailyNotifications(NOW);
    expect(result.dsarReminders).toBe(1);
    expect(result.errors).toEqual([]);
  });
});
