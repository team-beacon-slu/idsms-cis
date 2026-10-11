/** @jest-environment node */
jest.mock("@/lib/services/scheduledNotifications", () => ({
  runDailyNotifications: jest.fn().mockResolvedValue({ deadlineReminders: 0, moaWarnings: 0 }),
}));
import { NextRequest } from "next/server";
import { runDailyNotifications } from "@/lib/services/scheduledNotifications";
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

it("refuses to run when CRON_SECRET is not configured at all", async () => {
  delete process.env.CRON_SECRET;
  const res = await GET(
    new NextRequest("http://localhost/api/cron/daily", {
      headers: { authorization: "Bearer undefined" },
    })
  );
  expect(res.status).toBe(401);
});
