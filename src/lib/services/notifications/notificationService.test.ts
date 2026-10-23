/** @jest-environment node */
jest.mock("@/lib/services/notifications/notify", () => ({ notify: jest.fn() }));
jest.mock("@/lib/services/notifications/notificationRecipients", () => ({
  getAssignedFacultyIds: jest.fn(),
}));

import { renderToStaticMarkup } from "react-dom/server";
import type { ReactElement } from "react";
import { prismaMock, resetPrismaMock } from "@/testUtils/prismaMock";
import { notify } from "@/lib/services/notifications/notify";
import { getAssignedFacultyIds } from "@/lib/services/notifications/notificationRecipients";
import { sendReportStatusEmail } from "@/lib/services/notifications/notificationService";

const originalEnv = { ...process.env };
const report = {
  weekStart: new Date("2026-10-05"),
  weekEnd: new Date("2026-10-11"),
  studentProfileId: "student-1",
  revisionHistory: [
    { type: "RETURNED", notes: "Earlier feedback" },
    { type: "RETURNED", notes: "Revise <script>alert(1)</script>" },
  ],
  studentProfile: { deletedAt: null, userId: "stu-user" },
};
const lastCall = () => jest.mocked(notify).mock.calls.at(-1)![0];
const emailHtml = (userId: string) =>
  renderToStaticMarkup(lastCall().emailOverrides![userId] as ReactElement);

beforeEach(() => {
  resetPrismaMock();
  jest.mocked(notify).mockReset().mockResolvedValue({ inApp: 2, emailed: 2, failed: 0 });
  jest.mocked(getAssignedFacultyIds).mockReset().mockResolvedValue(["fac-1"]);
  process.env.NEXTAUTH_URL = "https://idsms.example.com";
  prismaMock.weeklyReport.findUnique.mockResolvedValue(report as never);
});
afterEach(() => {
  process.env = { ...originalEnv };
});

it.each(["APPROVE", "RETURN", "REGARD"] as const)(
  "notifies the student and assigned faculty in-app and by email for %s",
  async (action) => {
    await expect(sendReportStatusEmail("report-1", action)).resolves.toEqual({ sent: true });
    expect(lastCall()).toEqual(
      expect.objectContaining({
        userIds: ["stu-user", "fac-1"],
        trigger: action === "RETURN" ? "REPORT_RETURNED" : "REPORT_APPROVED",
        email: true,
        link: "/students/student-1/weekly-reports",
      })
    );
    const html = emailHtml("stu-user");
    expect(html).toContain("https://idsms.example.com/students/student-1/weekly-reports/report-1");
    if (action === "RETURN") {
      expect(html).toContain("Revise &lt;script&gt;");
      expect(html).not.toContain("Earlier feedback");
      expect(lastCall().body).toBe("Revise <script>alert(1)</script>");
    } else expect(html).not.toContain("Revise &lt;script&gt;");
  }
);

it("skips a deleted disregard report without querying it", async () => {
  expect(await sendReportStatusEmail("report-1", "DISREGARD")).toEqual({ sent: false });
  expect(prismaMock.weeklyReport.findUnique).not.toHaveBeenCalled();
  expect(notify).not.toHaveBeenCalled();
});

it("handles a missing report", async () => {
  prismaMock.weeklyReport.findUnique.mockResolvedValue(null);
  expect(await sendReportStatusEmail("missing", "APPROVE")).toEqual({ sent: false });
  expect(notify).not.toHaveBeenCalled();
});

it("reports sent: false when any email failed or none went out", async () => {
  jest.mocked(notify).mockResolvedValue({ inApp: 2, emailed: 1, failed: 1 });
  expect(await sendReportStatusEmail("report-1", "APPROVE")).toEqual({ sent: false });
  jest.mocked(notify).mockResolvedValue({ inApp: 2, emailed: 0, failed: 0 });
  expect(await sendReportStatusEmail("report-1", "APPROVE")).toEqual({ sent: false });
});

it("keeps a database failure nonfatal", async () => {
  prismaMock.weeklyReport.findUnique.mockRejectedValue(new Error("Unavailable"));
  await expect(sendReportStatusEmail("report-1", "APPROVE")).resolves.toEqual({ sent: false });
});

it("omits a missing system link and tolerates non-array revision history", async () => {
  delete process.env.NEXTAUTH_URL;
  prismaMock.weeklyReport.findUnique.mockResolvedValue({
    ...report,
    revisionHistory: null,
  } as never);
  expect(await sendReportStatusEmail("report-1", "RETURN")).toEqual({ sent: true });
  expect(emailHtml("stu-user")).not.toContain("View report");
});
