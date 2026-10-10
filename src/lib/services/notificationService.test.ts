/** @jest-environment node */
import { renderToStaticMarkup } from "react-dom/server";
import { prismaMock, resetPrismaMock } from "@/testUtils/prismaMock";
import { sendReportStatusEmail } from "@/lib/services/notificationService";

const mockSend = jest.fn();
jest.mock("resend", () => ({ Resend: jest.fn(() => ({ emails: { send: mockSend } })) }));
const originalEnv = { ...process.env };
const report = {
  weekStart: new Date("2026-10-05"),
  weekEnd: new Date("2026-10-11"),
  studentProfileId: "student-1",
  revisionHistory: [
    { type: "RETURNED", notes: "Earlier feedback" },
    { type: "RETURNED", notes: "Revise <script>alert(1)</script>" },
  ],
  studentProfile: {
    deletedAt: null,
    classGroupId: "group-1",
    semesterId: "semester-1",
    user: { email: "student@example.com", isActive: true, deletedAt: null },
  },
};
beforeEach(() => {
  resetPrismaMock();
  mockSend.mockReset();
  process.env.RESEND_API_KEY = "test-key";
  process.env.RESEND_FROM_EMAIL = "reports@example.com";
  process.env.NEXTAUTH_URL = "https://idsms.example.com";
  prismaMock.weeklyReport.findUnique.mockResolvedValue(report as never);
  prismaMock.facultyClassGroup.findMany.mockResolvedValue([
    { faculty: { email: "faculty@example.com", isActive: true, deletedAt: null } },
  ] as never);
  mockSend.mockResolvedValue({ data: { id: "email-1" }, error: null });
});
afterEach(() => {
  process.env = { ...originalEnv };
});
it.each(["APPROVE", "RETURN", "REGARD"] as const)(
  "notifies student and assigned faculty for %s",
  async (action) => {
    await expect(sendReportStatusEmail("report-1", action)).resolves.toEqual({ sent: true });
    expect(prismaMock.facultyClassGroup.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { classGroupId: "group-1", semesterId: "semester-1" } })
    );
    expect(mockSend).toHaveBeenCalledTimes(2);
    expect(mockSend.mock.calls.map(([payload]) => payload.to)).toEqual([
      "student@example.com",
      "faculty@example.com",
    ]);
    const html = renderToStaticMarkup(mockSend.mock.calls[0][0].react);
    expect(html).toContain("https://idsms.example.com/students/student-1/weekly-reports/report-1");
    if (action === "RETURN") {
      expect(html).toContain("Revise &lt;script&gt;");
      expect(html).not.toContain("Earlier feedback");
    } else expect(html).not.toContain("Revise &lt;script&gt;");
  }
);
it("skips a deleted disregard report without querying it", async () => {
  expect(await sendReportStatusEmail("report-1", "DISREGARD")).toEqual({ sent: false });
  expect(prismaMock.weeklyReport.findUnique).not.toHaveBeenCalled();
});
it.each(["RESEND_API_KEY", "RESEND_FROM_EMAIL"])("does not send without %s", async (key) => {
  delete process.env[key];
  expect(await sendReportStatusEmail("report-1", "APPROVE")).toEqual({ sent: false });
  expect(mockSend).not.toHaveBeenCalled();
});
it("handles a missing report", async () => {
  prismaMock.weeklyReport.findUnique.mockResolvedValue(null);
  expect(await sendReportStatusEmail("missing", "APPROVE")).toEqual({ sent: false });
});
it("deduplicates recipients and skips inactive or deleted accounts", async () => {
  prismaMock.facultyClassGroup.findMany.mockResolvedValue([
    { faculty: report.studentProfile.user },
    { faculty: { email: "inactive@example.com", isActive: false, deletedAt: null } },
    { faculty: { email: "deleted@example.com", isActive: true, deletedAt: new Date() } },
  ] as never);
  expect(await sendReportStatusEmail("report-1", "APPROVE")).toEqual({ sent: true });
  expect(mockSend).toHaveBeenCalledTimes(1);
});
it.each(["provider", "network", "database"])("keeps %s failures nonfatal", async (failure) => {
  if (failure === "provider")
    mockSend.mockResolvedValue({ data: null, error: { message: "Rejected" } });
  if (failure === "network") mockSend.mockRejectedValue(new Error("Unavailable"));
  if (failure === "database")
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
  expect(renderToStaticMarkup(mockSend.mock.calls[0][0].react)).not.toContain("View report");
});
