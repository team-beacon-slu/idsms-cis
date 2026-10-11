/** @jest-environment node */
jest.mock("@vercel/functions", () => ({ waitUntil: jest.fn() }));
jest.mock("@/lib/services/userService", () => ({ requestPasswordReset: jest.fn() }));
jest.mock("@/lib/services/notificationEvents", () => ({
  // Never settles: the response must not wait on the email send.
  notifyPasswordReset: jest.fn(() => new Promise(() => {})),
}));

import { NextRequest } from "next/server";
import { waitUntil } from "@vercel/functions";
import { requestPasswordReset } from "@/lib/services/userService";
import { notifyPasswordReset } from "@/lib/services/notificationEvents";
import { POST } from "@/app/api/auth/reset-password/request/route";

const post = () =>
  new NextRequest("http://localhost/api/auth/reset-password/request", {
    method: "POST",
    body: JSON.stringify({ email: "student@slu.edu.ph" }),
  });

beforeEach(() => jest.clearAllMocks());

it("answers without waiting for the email, so timing can't reveal the account", async () => {
  (requestPasswordReset as jest.Mock).mockResolvedValue({ userId: "u-1", token: "tok" });

  const res = await POST(post());

  expect(res.status).toBe(200);
  expect(notifyPasswordReset).toHaveBeenCalledWith("u-1", "tok");
  expect(waitUntil).toHaveBeenCalledTimes(1);
});

it("gives the same answer when no account exists", async () => {
  (requestPasswordReset as jest.Mock).mockResolvedValue(null);

  const res = await POST(post());

  expect(res.status).toBe(200);
  expect(notifyPasswordReset).not.toHaveBeenCalled();
  await expect(res.json()).resolves.toEqual({
    message: "If an account with that email exists, a reset link has been sent.",
  });
});
