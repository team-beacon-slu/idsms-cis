import { prismaMock, resetPrismaMock } from "@/testUtils/prismaMock";

const send = jest.fn();
jest.mock("resend", () => ({ Resend: jest.fn(() => ({ emails: { send } })) }));

import { notify } from "@/lib/services/notify";

const ENV = { ...process.env };
beforeEach(() => {
  resetPrismaMock();
  send.mockReset();
  process.env = {
    ...ENV,
    RESEND_API_KEY: "re_test",
    RESEND_FROM_EMAIL: "IDSMS <noreply@example.edu>",
  };
  jest.spyOn(console, "error").mockImplementation(() => {});
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
