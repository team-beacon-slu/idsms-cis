import { prismaMock, resetPrismaMock } from "@/testUtils/prismaMock";

const send = jest.fn();
jest.mock("resend", () => ({ Resend: jest.fn(() => ({ emails: { send } })) }));

import { notify } from "@/lib/services/notifications/notify";

const ENV = { ...process.env };
beforeEach(() => {
  resetPrismaMock();
  send.mockReset();
  process.env = {
    ...ENV,
    RESEND_API_KEY: "re_test",
    RESEND_FROM_EMAIL: "IDSMS <noreply@example.edu>",
  };
  jest
    .spyOn(console, "error")
    .mockImplementation(() => {})
    .mockClear();
});
afterAll(() => {
  process.env = ENV;
});

const active = { id: "u-1", email: "s@x", isActive: true, deletedAt: null };

it("writes one IN_APP row per active recipient and emails when asked", async () => {
  prismaMock.user.findMany.mockResolvedValue([active] as never);
  send.mockResolvedValue({ data: { id: "em-1" }, error: null });

  const result = await notify({
    userIds: ["u-1"],
    trigger: "REPORT_SUBMITTED",
    title: "Report submitted",
    body: "Ref WR-1",
    link: "/weekly-reports",
    email: true,
  });

  expect(result).toEqual({ inApp: 1, emailed: 1, failed: 0 });
  expect(prismaMock.notification.create).toHaveBeenCalledWith({
    data: expect.objectContaining({
      userId: "u-1",
      triggerType: "REPORT_SUBMITTED",
      channel: "IN_APP",
      status: "SENT",
    }),
  });
  expect(prismaMock.notification.create).toHaveBeenCalledWith({
    data: expect.objectContaining({ channel: "EMAIL", status: "SENT" }),
  });
});

it("records FAILED email without throwing", async () => {
  prismaMock.user.findMany.mockResolvedValue([active] as never);
  send.mockRejectedValue(new Error("Resend down"));

  await expect(
    notify({ userIds: ["u-1"], trigger: "REPORT_SUBMITTED", title: "t", body: "b", email: true })
  ).resolves.toEqual({ inApp: 1, emailed: 0, failed: 1 });
  expect(prismaMock.notification.create).toHaveBeenCalledWith({
    data: expect.objectContaining({ channel: "EMAIL", status: "FAILED" }),
  });
});

it("skips email entirely when Resend is not configured (D4 undecided)", async () => {
  delete process.env.RESEND_FROM_EMAIL;
  prismaMock.user.findMany.mockResolvedValue([active] as never);
  const result = await notify({
    userIds: ["u-1"],
    trigger: "REPORT_SUBMITTED",
    title: "t",
    body: "b",
    email: true,
  });
  expect(result).toEqual({ inApp: 1, emailed: 0, failed: 0 });
  expect(send).not.toHaveBeenCalled();
});

it("skips inactive or deleted recipients", async () => {
  prismaMock.user.findMany.mockResolvedValue([] as never); // query filters isActive/deletedAt
  const result = await notify({
    userIds: ["gone"],
    trigger: "CHECKLIST_STATUS",
    title: "t",
    body: "b",
  });
  expect(result).toEqual({ inApp: 0, emailed: 0, failed: 0 });
  expect(prismaMock.user.findMany).toHaveBeenCalledWith(
    expect.objectContaining({ where: expect.objectContaining({ isActive: true, deletedAt: null }) })
  );
});

it("never throws even if the database write fails", async () => {
  prismaMock.user.findMany.mockRejectedValue(new Error("db down"));
  await expect(
    notify({ userIds: ["u-1"], trigger: "CHECKLIST_STATUS", title: "t", body: "b" })
  ).resolves.toEqual({ inApp: 0, emailed: 0, failed: 0 });
});

it("sends a plain-text alternative alongside the HTML email", async () => {
  prismaMock.user.findMany.mockResolvedValue([active] as never);
  send.mockResolvedValue({ data: { id: "em-1" }, error: null });
  await notify({
    userIds: ["u-1"],
    trigger: "REPORT_SUBMITTED",
    title: "Report submitted",
    body: "Ref WR-1",
    link: "/weekly-reports",
    email: true,
  });
  expect(send).toHaveBeenCalledWith(
    expect.objectContaining({ text: expect.stringContaining("Ref WR-1") })
  );
});

it("keeps going for the other recipients when one recipient's write fails", async () => {
  prismaMock.user.findMany.mockResolvedValue([
    active,
    { id: "u-2", email: "t@x", isActive: true, deletedAt: null },
  ] as never);
  prismaMock.notification.create
    .mockRejectedValueOnce(new Error("row write failed"))
    .mockResolvedValue({} as never);

  const result = await notify({
    userIds: ["u-1", "u-2"],
    trigger: "CHECKLIST_STATUS",
    title: "t",
    body: "b",
  });

  expect(result).toEqual({ inApp: 1, emailed: 0, failed: 1 });
  expect(prismaMock.notification.create).toHaveBeenLastCalledWith({
    data: expect.objectContaining({ userId: "u-2", channel: "IN_APP" }),
  });
  expect(console.error).toHaveBeenCalledWith(
    "Notification failed for recipient",
    expect.objectContaining({ userId: "u-1" })
  );
});

it("records a FAILED email and logs when production has no Resend configured", async () => {
  delete process.env.RESEND_API_KEY;
  (process.env as Record<string, string>).NODE_ENV = "production";
  prismaMock.user.findMany.mockResolvedValue([active] as never);

  const result = await notify({
    userIds: ["u-1"],
    trigger: "PASSWORD_RESET",
    title: "t",
    body: "b",
    inApp: false,
    email: true,
  });

  expect(result).toEqual({ inApp: 0, emailed: 0, failed: 1 });
  expect(prismaMock.notification.create).toHaveBeenCalledWith({
    data: expect.objectContaining({ channel: "EMAIL", status: "FAILED" }),
  });
  expect(console.error).toHaveBeenCalledWith(
    expect.stringContaining("no email service is configured"),
    expect.anything()
  );
});

it("treats a duplicate dedupe key as already sent (concurrent cron runs)", async () => {
  prismaMock.user.findMany.mockResolvedValue([active] as never);
  prismaMock.notification.create.mockRejectedValueOnce(
    Object.assign(new Error("Unique constraint failed"), { code: "P2002" })
  );

  const result = await notify({
    userIds: ["u-1"],
    trigger: "DEADLINE_REMINDER",
    title: "t",
    body: "b",
    email: true,
    dedupeKey: "deadline:p-1:2026-10-05:48",
  });

  expect(result).toEqual({ inApp: 0, emailed: 0, failed: 0 });
  expect(send).not.toHaveBeenCalled();
  expect(console.error).not.toHaveBeenCalled();
});

it("logs when an emailed link cannot be made absolute", async () => {
  delete process.env.NEXTAUTH_URL;
  prismaMock.user.findMany.mockResolvedValue([active] as never);
  send.mockResolvedValue({ data: { id: "em-1" }, error: null });

  await notify({
    userIds: ["u-1"],
    trigger: "REPORT_SUBMITTED",
    title: "t",
    body: "b",
    link: "/weekly-reports",
    email: true,
  });

  expect(console.error).toHaveBeenCalledWith(
    expect.stringContaining("NEXTAUTH_URL"),
    expect.anything()
  );
});
