// FR-NT-01 event-driven triggers (1, 2, 3, 4, 7, 9, 10, 11). Each function
// resolves its recipients and builds the message in one place, so routes make
// a single call after their own action succeeds. Like notify(), these never
// throw — a notification problem must not fail the action that caused it.
import { NotificationEmail } from "@/components/emails/notification-email";
import { prisma } from "@/lib/prisma";
import { notify } from "@/lib/services/notifications/notify";
import {
  getAssignedFacultyIds,
  getDepartmentStaffIds,
  getStudentUserId,
} from "@/lib/services/notifications/notificationRecipients";

const weeklyReportsLink = (studentProfileId: string) =>
  `/students/${studentProfileId}/weekly-reports`;

async function toStudent(
  studentProfileId: string,
  message: Omit<Parameters<typeof notify>[0], "userIds">
) {
  try {
    const userId = await getStudentUserId(studentProfileId);
    if (userId) await notify({ userIds: [userId], ...message });
  } catch (error) {
    console.error("Notification recipient lookup failed", { trigger: message.trigger, error });
  }
}

// 1 — never include the generated password; it's shown once to the admin (FR-UM-03).
export async function notifyAccountCreated(userId: string) {
  await notifyAccountCreatedMany([userId]);
}

// 1 (bulk import) — the import result identifies rows by email.
export async function notifyAccountsCreatedByEmail(emails: string[]) {
  if (emails.length === 0) return;
  try {
    const users = await prisma.user.findMany({
      where: { email: { in: emails } },
      select: { id: true },
    });
    if (users.length > 0) await notifyAccountCreatedMany(users.map((u) => u.id));
  } catch (error) {
    console.error("Notification recipient lookup failed", { trigger: "ACCOUNT_CREATED", error });
  }
}

function notifyAccountCreatedMany(userIds: string[]) {
  return notify({
    userIds,
    trigger: "ACCOUNT_CREATED",
    title: "Your IDSMS account is ready",
    body: "Sign in with your SLU email. You'll be asked to change your password on first login.",
    link: "/login",
    email: true,
  });
}

// 2 — email only (the user can't sign in), and the token lives only in the
// per-recipient email body: notify() never persists emailOverrides.
export async function notifyPasswordReset(userId: string, token: string) {
  const title = "Reset your IDSMS password";
  const link = `/auth/reset-password/${token}`;
  const text = [
    title,
    "This link expires in 1 hour. If you didn't request it, ignore this email.",
    `${process.env.NEXTAUTH_URL ?? ""}${link}`,
  ].join("\n\n");
  await notify({
    userIds: [userId],
    trigger: "PASSWORD_RESET",
    title,
    body: "This link expires in 1 hour.",
    inApp: false,
    email: true,
    emailOverrides: {
      [userId]: NotificationEmail({
        title,
        body: "This link expires in 1 hour. If you didn't request it, ignore this email.",
        link,
      }),
    },
    textOverrides: { [userId]: text },
  });
}

// 3 — the student and their assigned faculty.
export async function notifyReportSubmitted(args: {
  studentUserId: string;
  studentProfileId: string;
  referenceCode: string;
  late: boolean;
}) {
  try {
    const facultyIds = await getAssignedFacultyIds(args.studentProfileId);
    await notify({
      userIds: [args.studentUserId, ...facultyIds],
      trigger: "REPORT_SUBMITTED",
      title: `Weekly report submitted (${args.referenceCode})`,
      body: args.late ? "Submitted late — reason for delay included." : "Submitted on time.",
      link: weeklyReportsLink(args.studentProfileId),
      email: true,
    });
  } catch (error) {
    console.error("Notification recipient lookup failed", { trigger: "REPORT_SUBMITTED", error });
  }
}

// 7
export async function notifyEndorsementReady(studentProfileId: string) {
  await toStudent(studentProfileId, {
    trigger: "ENDORSEMENT_LETTER_READY",
    title: "Your endorsement letter is ready",
    body: "Download it from your pre-deployment checklist page.",
    link: `/students/${studentProfileId}/checklist`,
    email: true,
  });
}

// 9
export async function notifyChecklistReviewed(
  studentProfileId: string,
  action: "APPROVE" | "RETURN"
) {
  await toStudent(studentProfileId, {
    trigger: "CHECKLIST_STATUS",
    title: `Checklist item ${action === "APPROVE" ? "approved" : "returned"}`,
    body:
      action === "APPROVE"
        ? "A pre-deployment requirement was approved."
        : "A pre-deployment requirement was returned — check the reviewer's comments.",
    link: `/students/${studentProfileId}/checklist`,
  });
}

// 10
export async function notifyWorkPlanReviewed(
  studentProfileId: string,
  action: "APPROVE" | "RETURN"
) {
  await toStudent(studentProfileId, {
    trigger: "WORK_PLAN_REVIEWED",
    title: `Work plan ${action === "APPROVE" ? "approved" : "returned for revision"}`,
    body:
      action === "APPROVE"
        ? "Your work plan was approved. You can now set your deployment schedule."
        : "Your work plan was returned — check the reviewer's comments.",
    link: `/students/${studentProfileId}/work-plan`,
    email: true,
  });
}

// Schedule changes need two approvals; tell whoever acts next, then the intern.
export async function notifyScheduleChange(
  studentProfileId: string,
  stage: "REQUESTED" | "PENDING_COORDINATOR" | "APPROVED" | "REJECTED"
) {
  const link = `/students/${studentProfileId}/attendance`;
  if (stage === "APPROVED" || stage === "REJECTED") {
    await toStudent(studentProfileId, {
      trigger: "SCHEDULE_CHANGE",
      title: `Schedule change ${stage === "APPROVED" ? "approved" : "not approved"}`,
      body:
        stage === "APPROVED"
          ? "Your new schedule applies from today. Earlier days keep the old one."
          : "Your schedule change request was not approved. Your current schedule stays.",
      link,
      email: true,
    });
    return;
  }
  try {
    const userIds =
      stage === "REQUESTED"
        ? await getAssignedFacultyIds(studentProfileId)
        : await getDepartmentStaffIds();
    if (userIds.length === 0) return;
    await notify({
      userIds,
      trigger: "SCHEDULE_CHANGE",
      title:
        stage === "REQUESTED"
          ? "Schedule change awaiting your validation"
          : "Schedule change awaiting final approval",
      body: "An intern asked to change their work schedule. Review it on their Attendance page.",
      link,
      email: true,
    });
  } catch (error) {
    console.error("Notification recipient lookup failed", { trigger: "SCHEDULE_CHANGE", error });
  }
}

const REQUEST_LABEL: Record<string, string> = {
  ABSENCE: "leave",
  OVERTIME: "overtime",
  UNDERTIME: "undertime",
};

// Workstream H: a final technical report awaits the coordinator's review.
export async function notifyFinalReportSubmitted(studentProfileId: string) {
  try {
    const userIds = await getDepartmentStaffIds();
    if (userIds.length > 0) {
      await notify({
        userIds,
        trigger: "REPORT_SUBMITTED",
        title: "Final technical report submitted",
        body: "An intern submitted their final technical report for review.",
        link: `/students/${studentProfileId}/final-report`,
      });
    }
  } catch (error) {
    console.error("Notification recipient lookup failed", { trigger: "REPORT_SUBMITTED", error });
  }
}

// Workstream H: the coordinator approved or returned the final report.
export async function notifyFinalReportReviewed(
  studentProfileId: string,
  action: "APPROVE" | "RETURN",
  note?: string
) {
  await toStudent(studentProfileId, {
    trigger: action === "APPROVE" ? "REPORT_APPROVED" : "REPORT_RETURNED",
    title: `Your final technical report was ${action === "APPROVE" ? "approved" : "returned"}`,
    body:
      action === "APPROVE"
        ? "Your final technical report was approved. Download the PDF and submit it in Google Classroom."
        : `The coordinator returned your final technical report: ${note ?? ""}`,
    link: `/students/${studentProfileId}/final-report`,
  });
}

// 11 (Workstream L1): leave / OT / UT request approved or returned.
// Workstream L2: a warning, demerit, violation or suspension was recorded.
export async function notifyConductRecordIssued(
  studentProfileId: string,
  categoryLabel: string,
  reason: string
) {
  await toStudent(studentProfileId, {
    trigger: "CONDUCT_RECORD_ISSUED",
    title: `New conduct record: ${categoryLabel}`,
    body: `Your adviser recorded: ${reason}`,
    link: `/students/${studentProfileId}/attendance`,
  });
}

// Go-live item 5: the intern disputed a deduction; the assigned advisers decide.
export async function notifyDeductionDisputed(studentProfileId: string, itemDetail: string) {
  try {
    const facultyIds = await getAssignedFacultyIds(studentProfileId);
    if (facultyIds.length === 0) return;
    await notify({
      userIds: facultyIds,
      trigger: "DEDUCTION_DISPUTED",
      title: "An intern disputed a deduction",
      body: `Disputed: ${itemDetail}. Review it under Conduct & deductions.`,
      link: `/students/${studentProfileId}/attendance`,
      email: true,
    });
  } catch (error) {
    console.error("Notification recipient lookup failed", { trigger: "DEDUCTION_DISPUTED", error });
  }
}

export async function notifyDisputeResolved(
  studentProfileId: string,
  itemDetail: string,
  outcome: "ACCEPTED" | "DECLINED",
  note: string
) {
  await toStudent(studentProfileId, {
    trigger: "DEDUCTION_DISPUTE_RESOLVED",
    title:
      outcome === "ACCEPTED"
        ? "Your dispute was accepted: the deduction no longer counts"
        : "Your dispute was declined: the deduction stands",
    body: `${itemDetail}. Adviser's note: ${note}`,
    link: `/students/${studentProfileId}/attendance`,
  });
}

export async function notifyTimeRequestReviewed(
  studentProfileId: string,
  action: "APPROVE" | "RETURN",
  request: { deviationType: string; date: Date },
  note?: string
) {
  const kind = REQUEST_LABEL[request.deviationType] ?? "time";
  const day = request.date.toISOString().slice(0, 10);
  await toStudent(studentProfileId, {
    trigger: action === "APPROVE" ? "DEVIATION_VALIDATED" : "REQUEST_RETURNED",
    title: `Your ${kind} request for ${day} was ${action === "APPROVE" ? "approved" : "returned"}`,
    body:
      action === "APPROVE"
        ? `Your ${kind} request for ${day} was approved.`
        : `Your adviser returned your ${kind} request for ${day}: ${note ?? ""} Edit it and resubmit.`,
    link: `/students/${studentProfileId}/leave-requests`,
  });
}
