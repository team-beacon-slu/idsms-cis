jest.mock("@/lib/services/notify", () => ({ notify: jest.fn() }));
jest.mock("@/lib/services/notificationRecipients", () => ({
  getStudentUserId: jest.fn(),
  getAssignedFacultyIds: jest.fn(),
}));

import { prismaMock } from "@/testUtils/prismaMock";
import { notify } from "@/lib/services/notify";
import { getAssignedFacultyIds, getStudentUserId } from "@/lib/services/notificationRecipients";
import {
  notifyAccountCreated,
  notifyAccountsCreatedByEmail,
  notifyChecklistReviewed,
  notifyDeviationValidated,
  notifyEndorsementReady,
  notifyPasswordReset,
  notifyReportReturned,
  notifyReportSubmitted,
  notifyTimeRequestReviewed,
  notifyWorkPlanReviewed,
} from "@/lib/services/notificationEvents";

it("tells the student a returned time request needs fixing, with the note", async () => {
  await notifyTimeRequestReviewed(
    "p-1",
    "RETURN",
    { deviationType: "OVERTIME", date: new Date("2026-10-10T00:00:00Z") },
    "Get your supervisor's signature first."
  );
  expect(lastCall()).toEqual(
    expect.objectContaining({
      userIds: ["stu-1"],
      trigger: "REQUEST_RETURNED",
      title: "Your overtime request for 2026-10-10 was returned",
      body: expect.stringContaining("Get your supervisor's signature first."),
      link: "/students/p-1/leave-requests",
    })
  );
});

const notifyMock = notify as jest.Mock;
const lastCall = () => notifyMock.mock.calls.at(-1)![0];

beforeEach(() => {
  jest.clearAllMocks();
  (getStudentUserId as jest.Mock).mockResolvedValue("stu-1");
  (getAssignedFacultyIds as jest.Mock).mockResolvedValue(["fac-1"]);
});

it("report submitted → the student and their assigned faculty, by email too", async () => {
  await notifyReportSubmitted({
    studentUserId: "stu-1",
    studentProfileId: "p-1",
    referenceCode: "WR-1",
    late: true,
  });
  expect(lastCall()).toEqual(
    expect.objectContaining({
      userIds: ["stu-1", "fac-1"],
      trigger: "REPORT_SUBMITTED",
      email: true,
      title: expect.stringContaining("WR-1"),
      body: expect.stringMatching(/late/i),
    })
  );
});

it("report returned → in-app only (the #70 status email already covers email)", async () => {
  await notifyReportReturned("p-1", "Add more detail");
  expect(lastCall()).toEqual(
    expect.objectContaining({
      userIds: ["stu-1"],
      trigger: "REPORT_RETURNED",
      body: "Add more detail",
    })
  );
  expect(lastCall().email).toBeFalsy();
});

it("account created never carries a password", async () => {
  await notifyAccountCreated("new-1");
  const call = lastCall();
  expect(call).toEqual(
    expect.objectContaining({ userIds: ["new-1"], trigger: "ACCOUNT_CREATED", email: true })
  );
  expect(JSON.stringify(call)).not.toMatch(/password:/i);
});

it("bulk import notifies each created account, resolved by email, without passwords", async () => {
  prismaMock.user.findMany.mockResolvedValue([{ id: "n-1" }, { id: "n-2" }] as never);
  await notifyAccountsCreatedByEmail(["a@slu.edu.ph", "b@slu.edu.ph"]);
  expect(prismaMock.user.findMany).toHaveBeenCalledWith(
    expect.objectContaining({ where: { email: { in: ["a@slu.edu.ph", "b@slu.edu.ph"] } } })
  );
  expect(lastCall()).toEqual(
    expect.objectContaining({ userIds: ["n-1", "n-2"], trigger: "ACCOUNT_CREATED" })
  );
});

it("password reset is email-only and keeps the link out of the stored text", async () => {
  await notifyPasswordReset("u-1", "tok-secret");
  const call = lastCall();
  expect(call).toEqual(
    expect.objectContaining({
      userIds: ["u-1"],
      trigger: "PASSWORD_RESET",
      inApp: false,
      email: true,
    })
  );
  // The token may only live in the per-recipient email body, never in title/body/link.
  expect(`${call.title} ${call.body} ${call.link ?? ""}`).not.toContain("tok-secret");
  expect(call.emailOverrides["u-1"]).toBeDefined();
  // Plain-text twin for text-only clients carries the same link.
  expect(call.textOverrides["u-1"]).toContain("/auth/reset-password/tok-secret");
});

it.each([
  ["APPROVE", /approved/i],
  ["RETURN", /returned/i],
] as const)("checklist %s → the student", async (action, title) => {
  await notifyChecklistReviewed("p-1", action);
  expect(lastCall()).toEqual(
    expect.objectContaining({
      userIds: ["stu-1"],
      trigger: "CHECKLIST_STATUS",
      title: expect.stringMatching(title),
    })
  );
});

it("work plan reviewed → the student, by email too", async () => {
  await notifyWorkPlanReviewed("p-1", "APPROVE");
  expect(lastCall()).toEqual(
    expect.objectContaining({ userIds: ["stu-1"], trigger: "WORK_PLAN_REVIEWED", email: true })
  );
});

it("deviation validated → the student", async () => {
  await notifyDeviationValidated("p-1", "REJECT");
  expect(lastCall()).toEqual(
    expect.objectContaining({
      userIds: ["stu-1"],
      trigger: "DEVIATION_VALIDATED",
      title: expect.stringMatching(/rejected/i),
    })
  );
});

it("endorsement ready → the student, by email too", async () => {
  await notifyEndorsementReady("p-1");
  expect(lastCall()).toEqual(
    expect.objectContaining({
      userIds: ["stu-1"],
      trigger: "ENDORSEMENT_LETTER_READY",
      email: true,
    })
  );
});

it("does nothing when the student can't be resolved", async () => {
  (getStudentUserId as jest.Mock).mockResolvedValue(null);
  await notifyChecklistReviewed("missing", "APPROVE");
  expect(notifyMock).not.toHaveBeenCalled();
});
