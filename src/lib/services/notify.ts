// FR-NT-01..05 notification backbone. In-app rows always; email only when
// Resend is configured (decision D4). Never throws — a notification failure
// must not undo or fail the action that triggered it.
import { Resend } from "resend";
import type { ReactElement } from "react";
import { NotificationChannel, NotificationStatus, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { NotificationEmail } from "@/components/emails/notification-email";

export type NotificationTrigger =
  | "ACCOUNT_CREATED"
  | "PASSWORD_RESET"
  | "REPORT_SUBMITTED"
  | "REPORT_RETURNED"
  | "DEADLINE_REMINDER"
  | "ENDORSEMENT_LETTER_READY"
  | "MOA_EXPIRING"
  | "CHECKLIST_STATUS"
  | "WORK_PLAN_REVIEWED"
  | "DEVIATION_VALIDATED";

export interface NotifyInput {
  userIds: string[];
  trigger: NotificationTrigger;
  title: string;
  body: string;
  link?: string;
  email?: boolean; // default false
  inApp?: boolean; // default true; false for PASSWORD_RESET
  dedupeKey?: string; // cron idempotency, stored in payload
  emailOverrides?: Record<string, ReactElement>; // per-recipient custom body (e.g. reset link)
}

// `text` is the plain-text alternative: it improves deliverability and is
// what text-only clients show (email-template-builder checklist).
export async function sendEmail(
  to: string,
  subject: string,
  react: ReactElement,
  text?: string
): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM_EMAIL;
  if (!apiKey || !from) return false;
  const result = await new Resend(apiKey).emails.send({ from, to, subject, react, text });
  if (result?.error) throw new Error(result.error.message);
  return true;
}

export async function notify(
  input: NotifyInput
): Promise<{ inApp: number; emailed: number; failed: number }> {
  const counts = { inApp: 0, emailed: 0, failed: 0 };
  try {
    const users = await prisma.user.findMany({
      where: { id: { in: Array.from(new Set(input.userIds)) }, isActive: true, deletedAt: null },
      select: { id: true, email: true },
    });
    const payload = {
      title: input.title,
      body: input.body,
      link: input.link ?? null,
      dedupeKey: input.dedupeKey ?? null,
    } satisfies Prisma.InputJsonValue;

    for (const user of users) {
      if (input.inApp !== false) {
        await prisma.notification.create({
          data: {
            userId: user.id,
            triggerType: input.trigger,
            channel: NotificationChannel.IN_APP,
            status: NotificationStatus.SENT,
            payload,
            sentAt: new Date(),
          },
        });
        counts.inApp += 1;
      }

      if (input.email && process.env.RESEND_API_KEY && process.env.RESEND_FROM_EMAIL) {
        let status: NotificationStatus = NotificationStatus.SENT;
        try {
          const react =
            input.emailOverrides?.[user.id] ??
            NotificationEmail({ title: input.title, body: input.body, link: input.link });
          const appUrl = process.env.NEXTAUTH_URL ?? "";
          const text = input.emailOverrides?.[user.id]
            ? undefined // custom bodies (e.g. a reset link) supply their own content
            : [input.title, input.body, input.link ? `${appUrl}${input.link}` : ""]
                .filter(Boolean)
                .join("\n\n");
          await sendEmail(user.email, input.title, react, text);
          counts.emailed += 1;
        } catch (error) {
          console.error("Notification email failed", {
            trigger: input.trigger,
            userId: user.id,
            error,
          });
          status = NotificationStatus.FAILED;
          counts.failed += 1;
        }
        await prisma.notification.create({
          data: {
            userId: user.id,
            triggerType: input.trigger,
            channel: NotificationChannel.EMAIL,
            status,
            // Never persist emailOverrides content — it may hold a reset link.
            payload: { title: input.title, dedupeKey: input.dedupeKey ?? null },
            sentAt: status === NotificationStatus.SENT ? new Date() : null,
          },
        });
      }
    }
  } catch (error) {
    console.error("notify() failed", { trigger: input.trigger, error });
  }
  return counts;
}
