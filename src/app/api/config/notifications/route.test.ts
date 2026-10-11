/** @jest-environment node */
jest.mock("@/lib/auth/session", () => ({
  ...jest.requireActual("@/lib/auth/session"),
  requireUserApi: jest.fn(),
}));
jest.mock("@/lib/services/scheduledNotifications", () => ({
  getNotificationSettings: jest
    .fn()
    .mockResolvedValue({ deadlineReminderHours: [48, 24], moaWarningDays: 30 }),
  setNotificationSettings: jest
    .fn()
    .mockResolvedValue({ deadlineReminderHours: [72], moaWarningDays: 45 }),
}));
jest.mock("@supabase/supabase-js", () => ({ createClient: jest.fn(() => ({ storage: {} })) }));

import { NextRequest } from "next/server";
import { requireUserApi } from "@/lib/auth/session";
import { setNotificationSettings } from "@/lib/services/scheduledNotifications";
import { GET, PATCH } from "@/app/api/config/notifications/route";

const patch = (body: unknown) =>
  new NextRequest("http://localhost/api/config/notifications", {
    method: "PATCH",
    body: JSON.stringify(body),
  });

beforeEach(() => jest.clearAllMocks());

it("lets a Super Admin change the reminder settings (FR-NT-02)", async () => {
  (requireUserApi as jest.Mock).mockResolvedValue({ id: "admin-1", role: "SUPER_ADMIN" });
  const res = await PATCH(patch({ deadlineReminderHours: [72], moaWarningDays: 45 }));
  expect(res.status).toBe(200);
  expect(setNotificationSettings).toHaveBeenCalledWith(
    { deadlineReminderHours: [72], moaWarningDays: 45 },
    "admin-1"
  );
});

it("refuses anyone else", async () => {
  (requireUserApi as jest.Mock).mockResolvedValue({ id: "c-1", role: "DEPARTMENT_COORDINATOR" });
  const res = await PATCH(patch({ deadlineReminderHours: [72], moaWarningDays: 45 }));
  expect(res.status).toBe(401);
  expect(setNotificationSettings).not.toHaveBeenCalled();
});

it("lets staff read the current settings", async () => {
  (requireUserApi as jest.Mock).mockResolvedValue({ id: "c-1", role: "DEPARTMENT_COORDINATOR" });
  const res = await GET();
  expect(res.status).toBe(200);
  await expect(res.json()).resolves.toEqual({
    deadlineReminderHours: [48, 24],
    moaWarningDays: 30,
  });
});
