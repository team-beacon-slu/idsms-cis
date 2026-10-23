/** @jest-environment node */
jest.mock("@vercel/functions", () => ({ waitUntil: jest.fn() }));
jest.mock("@/lib/services/accounts/userService", () => ({
  ...jest.requireActual("@/lib/services/accounts/userService"), // apiError needs its error classes
  requestPasswordReset: jest.fn(),
}));
jest.mock("@/lib/services/notifications/notificationEvents", () => ({
  notifyPasswordReset: jest.fn(),
}));

import { NextRequest } from "next/server";
import { waitUntil } from "@vercel/functions";
import { requestPasswordReset } from "@/lib/services/accounts/userService";
import { notifyPasswordReset } from "@/lib/services/notifications/notificationEvents";
import { POST } from "@/app/api/auth/reset-password/request/route";

const post = (body: unknown = { email: "student@slu.edu.ph" }) =>
  new NextRequest("http://localhost/api/auth/reset-password/request", {
    method: "POST",
    body: JSON.stringify(body),
  });
const backgroundWork = () => (waitUntil as jest.Mock).mock.calls[0][0] as Promise<void>;
const SAME_ANSWER = {
  message: "If an account with that email exists, a reset link has been sent.",
};

beforeEach(() => jest.clearAllMocks());

it("answers before the account lookup finishes, so timing can't reveal the account", async () => {
  (requestPasswordReset as jest.Mock).mockReturnValue(new Promise(() => {})); // never settles

  const res = await POST(post());

  expect(res.status).toBe(200);
  await expect(res.json()).resolves.toEqual(SAME_ANSWER);
  expect(waitUntil).toHaveBeenCalledTimes(1);
});

it("emails the token in the background when the account exists", async () => {
  (requestPasswordReset as jest.Mock).mockResolvedValue({ userId: "u-1", token: "tok" });

  await POST(post());
  await backgroundWork();

  expect(notifyPasswordReset).toHaveBeenCalledWith("u-1", "tok");
});

it("gives the same answer and sends nothing when no account exists", async () => {
  (requestPasswordReset as jest.Mock).mockResolvedValue(null);

  const res = await POST(post());
  await backgroundWork();

  await expect(res.json()).resolves.toEqual(SAME_ANSWER);
  expect(notifyPasswordReset).not.toHaveBeenCalled();
});

it("logs a background failure instead of crashing", async () => {
  const spy = jest.spyOn(console, "error").mockImplementation(() => {});
  (requestPasswordReset as jest.Mock).mockRejectedValue(new Error("db down"));

  const res = await POST(post());
  await backgroundWork();

  expect(res.status).toBe(200);
  expect(spy).toHaveBeenCalled();
  spy.mockRestore();
});

it("still rejects a malformed email up front", async () => {
  const res = await POST(post({ email: "not-an-email" }));

  expect(res.status).toBe(400);
  expect(waitUntil).not.toHaveBeenCalled();
});
