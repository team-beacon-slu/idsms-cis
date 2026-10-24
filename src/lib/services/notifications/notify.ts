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
  | "REPORT_APPROVED"
  | "DEADLINE_REMINDER"
  | "ENDORSEMENT_LETTER_READY"
  | "MOA_EXPIRING"
  | "CHECKLIST_STATUS"
  | "WORK_PLAN_REVIEWED"
  | "SCHEDULE_CHANGE"
  | "DEVIATION_VALIDATED"
  | "REQUEST_RETURNED"
  | "CONDUCT_RECORD_ISSUED"
  | "DEDUCTION_DISPUTED"
  | "DEDUCTION_DISPUTE_RESOLVED"
  | "COMPANY_DAY_ADDED"
  | "DSAR_REQUESTED"
  | "DSAR_FULFILLED"
  | "DSAR_DUE"
  | "RETENTION_REVIEW";

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
  textOverrides?: Record<string, string>; // plain-text twin of emailOverrides
}

function isResendConfigured(): boolean {
  return !!process.env.RESEND_API_KEY && !!process.env.RESEND_FROM_EMAIL;
}

// Migration 006 puts a unique index on (user, trigger, dedupeKey) for IN_APP
// rows, so a second concurrent cron run fails the insert instead of sending
// the same reminder twice.
function isDuplicateDedupe(error: unknown): boolean {
  return (error as { code?: string } | null)?.code === "P2002";
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
  let users: { id: string; email: string }[];
  try {
    users = await prisma.user.findMany({
      where: { id: { in: Array.from(new Set(input.userIds)) }, isActive: true, deletedAt: null },
      select: { id: true, email: true },
    });
  } catch (error) {
    console.error("notify() could not load recipients", { trigger: input.trigger, error });
    return counts;
  }

  const payload = {
    title: input.title,
    body: input.body,
    link: input.link ?? null,
    dedupeKey: input.dedupeKey ?? null,
  } satisfies Prisma.InputJsonValue;

  // Email is requested but cannot go out. In development that is the normal
  // D4 state; in production it means a password reset (email-only) would
  // vanish without trace, so record it as FAILED and say so in the logs.
  const emailUnavailable =
    !!input.email && !isResendConfigured() && process.env.NODE_ENV === "production";
  if (emailUnavailable) {
    console.error("Email requested but Resend is not configured", { trigger: input.trigger });
  }

  const appUrl = process.env.NEXTAUTH_URL;
  if (input.email && input.link && !appUrl && isResendConfigured()) {
    console.error("NEXTAUTH_URL is not set — emailed links will be relative", {
      trigger: input.trigger,
    });
  }

  // One recipient's failure must not cost the others their notification.
  for (const user of users) {
    try {
      if (input.inApp !== false) {
        try {
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
        } catch (error) {
          if (input.dedupeKey && isDuplicateDedupe(error)) continue; // already sent
          throw error;
        }
        counts.inApp += 1;
      }

      if (input.email && (isResendConfigured() || emailUnavailable)) {
        let status: NotificationStatus = NotificationStatus.SENT;
        if (emailUnavailable) {
          status = NotificationStatus.FAILED;
          counts.failed += 1;
        } else {
          try {
            const react =
              input.emailOverrides?.[user.id] ??
              NotificationEmail({ title: input.title, body: input.body, link: input.link });
            const text = input.emailOverrides?.[user.id]
              ? input.textOverrides?.[user.id] // custom bodies supply their own text
              : [input.title, input.body, input.link ? `${appUrl ?? ""}${input.link}` : ""]
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
    } catch (error) {
      console.error("Notification failed for recipient", {
        trigger: input.trigger,
        userId: user.id,
        error,
      });
      counts.failed += 1;
    }
  }
  return counts;
}
