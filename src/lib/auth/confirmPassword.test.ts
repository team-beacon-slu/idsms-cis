/** @jest-environment node */
jest.mock("@/lib/services/userService", () => ({ verifyCredentials: jest.fn() }));

import { verifyCredentials } from "@/lib/services/userService";
import { confirmPassword } from "@/lib/auth/confirmPassword";

const user = { email: "f@x" };

beforeEach(() => {
  jest.clearAllMocks();
});

it("returns null when the password is correct", async () => {
  (verifyCredentials as jest.Mock).mockResolvedValue({ ok: true });
  await expect(confirmPassword(user, "right", "1.2.3.4")).resolves.toBeNull();
  expect(verifyCredentials).toHaveBeenCalledWith("f@x", "right", "1.2.3.4");
});

it("returns 401 for a wrong password", async () => {
  (verifyCredentials as jest.Mock).mockResolvedValue({ ok: false, reason: "INVALID_CREDENTIALS" });
  const res = await confirmPassword(user, "nope", null);
  expect(res?.status).toBe(401);
  await expect(res?.json()).resolves.toEqual({ error: "Password confirmation failed" });
});

it("returns 423 naming the Manila time when the account is locked", async () => {
  (verifyCredentials as jest.Mock).mockResolvedValue({
    ok: false,
    reason: "ACCOUNT_LOCKED",
    lockedUntil: new Date("2026-10-12T05:30:00Z"),
  });
  const res = await confirmPassword(user, "right", null);
  expect(res?.status).toBe(423);
  await expect(res?.json()).resolves.toEqual({
    error: expect.stringContaining("1:30 PM"),
  });
});

it.each([undefined, null, "", 42])(
  "returns 400 and never checks credentials when the password is %p",
  async (password) => {
    const res = await confirmPassword(user, password, null);
    expect(res?.status).toBe(400);
    await expect(res?.json()).resolves.toEqual({ error: "Password is required" });
    expect(verifyCredentials).not.toHaveBeenCalled();
  }
);
