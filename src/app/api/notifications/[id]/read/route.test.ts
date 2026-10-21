/** @jest-environment node */
jest.mock("@/lib/auth/session", () => ({ requireUserApi: jest.fn() }));
jest.mock("@/lib/services/inbox", () => ({ markNotificationRead: jest.fn() }));

import { NextRequest } from "next/server";
import { requireUserApi } from "@/lib/auth/session";
import { markNotificationRead } from "@/lib/services/inbox";
import { PATCH } from "@/app/api/notifications/[id]/read/route";

const req = () => new NextRequest("http://localhost/x", { method: "PATCH" });

beforeEach(() => {
  jest.clearAllMocks();
  (requireUserApi as jest.Mock).mockResolvedValue({ id: "u-1", role: "STUDENT_INTERN" });
});

it("marks the caller's own notification read, scoped to the session user", async () => {
  (markNotificationRead as jest.Mock).mockResolvedValue(true);
  const res = await PATCH(req(), { params: Promise.resolve({ id: "n-1" }) });
  expect(res.status).toBe(200);
  expect(markNotificationRead).toHaveBeenCalledWith("u-1", "n-1");
});

it("cannot mark someone else's notification (404, nothing changed)", async () => {
  (markNotificationRead as jest.Mock).mockResolvedValue(false);
  const res = await PATCH(req(), { params: Promise.resolve({ id: "n-other" }) });
  expect(res.status).toBe(404);
});
