/** @jest-environment node */
jest.mock("@/lib/ai/batch", () => ({
  processPendingAiReports: jest.fn().mockResolvedValue({ processed: 0, failed: 0, skipped: true }),
}));
jest.mock("@/lib/services/notifications/scheduledNotifications", () => ({
  runDailyNotifications: jest
    .fn()
    .mockResolvedValue({ deadlineReminders: 0, moaWarnings: 0, errors: [] }),
}));
import { NextRequest } from "next/server";
import { runDailyNotifications } from "@/lib/services/notifications/scheduledNotifications";
import { GET } from "@/app/api/cron/daily/route";

const ENV = process.env.CRON_SECRET;
afterEach(() => {
  process.env.CRON_SECRET = ENV;
  jest.clearAllMocks();
});

it("rejects a missing or wrong CRON_SECRET", async () => {
  process.env.CRON_SECRET = "s3cret";
  const noAuth = await GET(new NextRequest("http://localhost/api/cron/daily"));
  const wrong = await GET(
    new NextRequest("http://localhost/api/cron/daily", {
      headers: { authorization: "Bearer nope" },
    })
  );
  expect(noAuth.status).toBe(401);
  expect(wrong.status).toBe(401);
  expect(runDailyNotifications).not.toHaveBeenCalled();
});

it("runs with the right secret", async () => {
  process.env.CRON_SECRET = "s3cret";
  const res = await GET(
    new NextRequest("http://localhost/api/cron/daily", {
      headers: { authorization: "Bearer s3cret" },
    })
  );
  expect(res.status).toBe(200);
});

it("answers 500 when part of the run failed, so the scheduler sees it", async () => {
  process.env.CRON_SECRET = "s3cret";
  (runDailyNotifications as jest.Mock).mockResolvedValueOnce({
    deadlineReminders: 3,
    moaWarnings: 0,
    errors: ["deadline:p-1"],
  });
  const res = await GET(
    new NextRequest("http://localhost/api/cron/daily", {
      headers: { authorization: "Bearer s3cret" },
    })
  );
  expect(res.status).toBe(500);
  await expect(res.json()).resolves.toEqual(
    expect.objectContaining({ deadlineReminders: 3, errors: ["deadline:p-1"] })
  );
});

it("refuses to run when CRON_SECRET is not configured at all", async () => {
  delete process.env.CRON_SECRET;
  const res = await GET(
    new NextRequest("http://localhost/api/cron/daily", {
      headers: { authorization: "Bearer undefined" },
    })
  );
  expect(res.status).toBe(401);
});
