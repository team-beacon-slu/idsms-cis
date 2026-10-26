/** @jest-environment node */
import { prismaMock, resetPrismaMock } from "@/testUtils/prismaMock";

const sendMail = jest.fn();
const createTransport = jest.fn(() => ({ sendMail }));
jest.mock("nodemailer", () => ({ __esModule: true, default: { createTransport } }));
const resendSend = jest.fn();
jest.mock("resend", () => ({ Resend: jest.fn(() => ({ emails: { send: resendSend } })) }));

import { isEmailConfigured, notify } from "@/lib/services/notifications/notify";

const ENV = { ...process.env };
beforeEach(() => {
  resetPrismaMock();
  jest.clearAllMocks();
  process.env = { ...ENV, SMTP_USER: "idsms.team@gmail.com", SMTP_PASS: "app-password" };
  delete process.env.RESEND_API_KEY;
  delete process.env.RESEND_FROM_EMAIL;
});
afterAll(() => {
  process.env = ENV;
});

it("sends through Gmail SMTP when an SMTP account is set (no domain needed)", async () => {
  prismaMock.user.findMany.mockResolvedValue([{ id: "u-1", email: "s@slu.edu.ph" }] as never);
  sendMail.mockResolvedValue({ messageId: "m-1" });

  const result = await notify({
    userIds: ["u-1"],
    trigger: "REPORT_RETURNED",
    title: "Report returned",
    body: "Fix Tuesday",
    link: "/weekly-reports",
    email: true,
  });

  expect(result.emailed).toBe(1);
  expect(createTransport).toHaveBeenCalledWith(
    expect.objectContaining({
      host: "smtp.gmail.com",
      port: 465,
      secure: true,
      auth: { user: "idsms.team@gmail.com", pass: "app-password" },
    })
  );
  const mail = sendMail.mock.calls[0][0];
  expect(mail).toMatchObject({
    from: "IDSMS <idsms.team@gmail.com>",
    to: "s@slu.edu.ph",
    subject: "Report returned",
  });
  expect(mail.html).toMatch(/^<!doctype html>/);
  expect(mail.html).toContain("Fix Tuesday");
  expect(resendSend).not.toHaveBeenCalled();
});

it("counts email as configured with either SMTP or Resend, and not with neither", () => {
  expect(isEmailConfigured()).toBe(true);
  delete process.env.SMTP_PASS;
  expect(isEmailConfigured()).toBe(false);
  process.env.RESEND_API_KEY = "re_x";
  process.env.RESEND_FROM_EMAIL = "IDSMS <a@b.c>";
  expect(isEmailConfigured()).toBe(true);
});
