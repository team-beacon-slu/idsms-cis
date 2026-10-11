// FR-NT-01 event-driven triggers (1, 2, 3, 4, 7, 9, 10, 11). Each function
// resolves its recipients and builds the message in one place, so routes make
// a single call after their own action succeeds. Like notify(), these never
// throw — a notification problem must not fail the action that caused it.
import { NotificationEmail } from "@/components/emails/notification-email";
import { prisma } from "@/lib/prisma";
import { notify } from "@/lib/services/notify";
import { getAssignedFacultyIds, getStudentUserId } from "@/lib/services/notificationRecipients";

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

// 4 — in-app only: the #70 sendReportStatusEmail already emails the student.
export async function notifyReportReturned(studentProfileId: string, notes: string) {
  await toStudent(studentProfileId, {
    trigger: "REPORT_RETURNED",
    title: "Weekly report returned for revision",
    body: notes,
    link: weeklyReportsLink(studentProfileId),
  });
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

// 11
export async function notifyDeviationValidated(
  studentProfileId: string,
  action: "VALIDATE" | "REJECT"
) {
  await toStudent(studentProfileId, {
    trigger: "DEVIATION_VALIDATED",
    title: `Deviation report ${action === "VALIDATE" ? "validated" : "rejected"}`,
    body:
      action === "VALIDATE"
        ? "Your deviation report was validated."
        : "Your deviation report was rejected — contact your faculty adviser if needed.",
    link: `/students/${studentProfileId}/attendance`,
  });
}
