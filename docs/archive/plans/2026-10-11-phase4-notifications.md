# Notification Backbone Implementation Plan (Phase 4 · Workstream C)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver FR-NT-01's 12 notification triggers:

- An **in-app inbox** (the `notifications` table, with a bell in the sidebar) that always works.
- **Resend email** where a sending domain is verified (D4).
- **One daily Vercel Cron** for 48h/24h deadline reminders and MOA expiry.
- Reminder intervals **configurable by the Super Admin** (FR-NT-02).

**Architecture:**

- **One entry point.** `notify({ userIds, trigger, title, body, link, email? })` writes one IN_APP row per recipient, and optionally sends email through a shared `sendEmail()` wrapper.
- **Fire-and-forget.** Triggers call `notify` _after_ their own transaction commits. A notification failure never fails the business action, matching the existing `sendReportStatusEmail` contract.
- **Daily cron.** A route at `/api/cron/daily`, protected by `CRON_SECRET`, runs the time-based triggers and is safe to re-run.

**Tech Stack:** Prisma 6 (`Notification` model + `readAt` from Workstream B Task 1) · Resend 6 + `@react-email/components` (already installed, as used by #70) · Vercel Cron (`vercel.json`) · Jest.

**Spec:** `PRD.md` FR-NT-01..05, FR-WR-07, FR-UM-10 (reset email); roadmap risks R6 (Resend domain), R2.
**Prerequisite:** Workstream B Task 1 merged (`Notification.readAt`).

## Decisions applied

- **D4, email domain undecided:**
  - Email sends only when both `RESEND_API_KEY` and `RESEND_FROM_EMAIL` are set (the existing guard), and failures are recorded as FAILED rows, never thrown.
  - In-app notifications ship regardless.
  - The README gets a "Verify a sending domain in Resend" step.
- **Hobby-tier cron:** one daily run at 00:00 UTC (08:00 Manila). The 48h and 24h checks are consolidated per FR-NT-05.

## The 12 triggers (FR-NT-01) → where they're wired

| #   | Trigger                             | Recipient                    | Wired in                                                                        | Channel                            |
| --- | ----------------------------------- | ---------------------------- | ------------------------------------------------------------------------------- | ---------------------------------- |
| 1   | Account creation                    | new user                     | `userService.createUser`, `bulkImportStudents` callers (routes)                 | email + in-app                     |
| 2   | Password reset                      | user                         | `api/auth/reset-password/request/route.ts` (closes its `TODO(Phase 4)`)         | email only (the user can't log in) |
| 3   | Report submission confirmation      | student + assigned faculty   | `api/weekly-reports/[id]/submit/route.ts`                                       | in-app (+ email)                   |
| 4   | Report returned with notes          | student                      | already emailed by #70; add in-app in `api/weekly-reports/[id]/review/route.ts` | in-app (+ existing email)          |
| 5   | Deadline reminder, 48h              | student                      | daily cron                                                                      | in-app + email                     |
| 6   | Deadline reminder, 24h              | student                      | daily cron                                                                      | in-app + email                     |
| 7   | Endorsement letter generated        | student                      | `api/students/[id]/endorsement-letter` POST (Workstream E)                      | in-app (+ email)                   |
| 8   | MOA expiry warning                  | coordinators/admins          | daily cron (reuses `getExpiringMoaRecords`)                                     | in-app + email                     |
| 9   | Checklist status change             | student                      | `api/checklist-items/[id]/review/route.ts`                                      | in-app                             |
| 10  | Work plan approval                  | student                      | `api/work-plans/[id]/review/route.ts`                                           | in-app (+ email)                   |
| 11  | Deviation report validated/rejected | student                      | `api/deviations/[id]/validate/route.ts`                                         | in-app                             |
| 12  | Scheduled deadline reminders        | covers 5/6 in the daily cron | daily cron                                                                      | —                                  |

## Global Constraints

- FR-NT-02: reminder hours (`[48, 24]`) and MOA warning days (`30`) come from SystemConfig keys `notification:deadline_reminder_hours` and `notification:moa_warning_days`, never hardcoded at the call site. Defaults live in exactly one function.
- FR-NT-04: emails use React Email components rendered by Resend (follow `src/components/emails/weekly-report-status-email.tsx`).
- FR-NT-05: scheduled work runs only from `/api/cron/daily`, which requires `Authorization: Bearer ${CRON_SECRET}`.
- Idempotency: the cron must not send the same reminder twice on a re-run. Dedupe on `(userId, triggerType, payload.dedupeKey)`.
- Notification failures never change the HTTP result of the action that triggered them.
- No raw secrets or reset tokens are stored in `notifications.payload`. The reset link is emailed only, and the in-app row is skipped for trigger 2.
- No Claude/Anthropic attribution in commits.

## Review Focus

1. **The cron runs twice in one day** (a Vercel retry or a manual run). Students must not get duplicate reminders. → Task 4 test `skips reminders already sent today`.
2. **Resend is down or has no domain.** The submit/review action still returns success, and the row is recorded with `channel EMAIL, status FAILED`. → Task 1 test `records FAILED email without throwing`.
3. **The cron is called without or with a wrong secret.** Must get 401 and do nothing. → Task 4 test `rejects a missing or wrong CRON_SECRET`.
4. **A student opens another user's notification id** (mark-read). Must get 404, never mark it. → Task 3 test `cannot mark someone else's notification`.
5. **A deactivated or deleted user.** No notification or email. → Task 1 test `skips inactive or deleted recipients`.

---

### Task 1: Core `notify()` with in-app rows and guarded email

**Files:**

- Create: `src/lib/services/notify.ts`, `src/components/emails/notification-email.tsx`
- Test: `src/lib/services/notify.test.ts`

**Interfaces:**

- Produces:
  - `type NotificationTrigger = "ACCOUNT_CREATED" | "PASSWORD_RESET" | "REPORT_SUBMITTED" | "REPORT_RETURNED" | "DEADLINE_REMINDER" | "ENDORSEMENT_LETTER_READY" | "MOA_EXPIRING" | "CHECKLIST_STATUS" | "WORK_PLAN_REVIEWED" | "DEVIATION_VALIDATED"`
  - `interface NotifyInput { userIds: string[]; trigger: NotificationTrigger; title: string; body: string; link?: string; email?: boolean; inApp?: boolean; dedupeKey?: string }`
  - `notify(input: NotifyInput): Promise<{ inApp: number; emailed: number; failed: number }>` (never throws)
  - `sendEmail(to: string, subject: string, react: React.ReactElement): Promise<boolean>`

- [ ] **Step 1: Write the failing tests**

```ts
import { prismaMock, resetPrismaMock } from "@/testUtils/prismaMock";

const send = jest.fn();
jest.mock("resend", () => ({ Resend: jest.fn(() => ({ emails: { send } })) }));

import { notify } from "@/lib/services/notify";

const ENV = { ...process.env };
beforeEach(() => {
  resetPrismaMock();
  send.mockReset();
  process.env = {
    ...ENV,
    RESEND_API_KEY: "re_test",
    RESEND_FROM_EMAIL: "IDSMS <noreply@example.edu>",
  };
  jest.spyOn(console, "error").mockImplementation(() => {});
});
afterAll(() => {
  process.env = ENV;
});

const active = { id: "u-1", email: "s@x", isActive: true, deletedAt: null };

it("writes one IN_APP row per active recipient and emails when asked", async () => {
  prismaMock.user.findMany.mockResolvedValue([active] as never);
  send.mockResolvedValue({ data: { id: "em-1" }, error: null });

  const result = await notify({
    userIds: ["u-1"],
    trigger: "REPORT_SUBMITTED",
    title: "Report submitted",
    body: "Ref WR-1",
    link: "/weekly-reports",
    email: true,
  });

  expect(result).toEqual({ inApp: 1, emailed: 1, failed: 0 });
  expect(prismaMock.notification.create).toHaveBeenCalledWith({
    data: expect.objectContaining({
      userId: "u-1",
      triggerType: "REPORT_SUBMITTED",
      channel: "IN_APP",
      status: "SENT",
    }),
  });
  expect(prismaMock.notification.create).toHaveBeenCalledWith({
    data: expect.objectContaining({ channel: "EMAIL", status: "SENT" }),
  });
});

it("records FAILED email without throwing", async () => {
  prismaMock.user.findMany.mockResolvedValue([active] as never);
  send.mockRejectedValue(new Error("Resend down"));

  await expect(
    notify({ userIds: ["u-1"], trigger: "REPORT_SUBMITTED", title: "t", body: "b", email: true })
  ).resolves.toEqual({ inApp: 1, emailed: 0, failed: 1 });
  expect(prismaMock.notification.create).toHaveBeenCalledWith({
    data: expect.objectContaining({ channel: "EMAIL", status: "FAILED" }),
  });
});

it("skips email entirely when Resend is not configured (D4 undecided)", async () => {
  delete process.env.RESEND_FROM_EMAIL;
  prismaMock.user.findMany.mockResolvedValue([active] as never);
  const result = await notify({
    userIds: ["u-1"],
    trigger: "REPORT_SUBMITTED",
    title: "t",
    body: "b",
    email: true,
  });
  expect(result).toEqual({ inApp: 1, emailed: 0, failed: 0 });
  expect(send).not.toHaveBeenCalled();
});

it("skips inactive or deleted recipients", async () => {
  prismaMock.user.findMany.mockResolvedValue([] as never); // query filters isActive/deletedAt
  const result = await notify({
    userIds: ["gone"],
    trigger: "CHECKLIST_STATUS",
    title: "t",
    body: "b",
  });
  expect(result).toEqual({ inApp: 0, emailed: 0, failed: 0 });
  expect(prismaMock.user.findMany).toHaveBeenCalledWith(
    expect.objectContaining({ where: expect.objectContaining({ isActive: true, deletedAt: null }) })
  );
});

it("never throws even if the database write fails", async () => {
  prismaMock.user.findMany.mockRejectedValue(new Error("db down"));
  await expect(
    notify({ userIds: ["u-1"], trigger: "CHECKLIST_STATUS", title: "t", body: "b" })
  ).resolves.toEqual({ inApp: 0, emailed: 0, failed: 0 });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx jest src/lib/services/notify.test.ts`
Expected: FAIL. Module not found.

- [ ] **Step 3: Implement**

`src/components/emails/notification-email.tsx`:

```tsx
import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Html,
  Preview,
  Text,
} from "@react-email/components";

// FR-NT-04 generic template for every trigger except the weekly-report
// status email (#70), which keeps its own richer template.
export function NotificationEmail({
  title,
  body,
  link,
}: {
  title: string;
  body: string;
  link?: string;
}) {
  const appUrl = process.env.NEXTAUTH_URL ?? "";
  return (
    <Html>
      <Head />
      <Preview>{title}</Preview>
      <Body style={{ fontFamily: "Arial, sans-serif", backgroundColor: "#f6f7f9" }}>
        <Container style={{ backgroundColor: "#ffffff", padding: 24, borderRadius: 8 }}>
          <Heading as="h2" style={{ color: "#1e3a5f" }}>
            {title}
          </Heading>
          <Text>{body}</Text>
          {link && (
            <Button
              href={`${appUrl}${link}`}
              style={{
                backgroundColor: "#2563eb",
                color: "#fff",
                padding: "10px 16px",
                borderRadius: 6,
              }}
            >
              Open IDSMS
            </Button>
          )}
          <Text style={{ color: "#888", fontSize: 12 }}>
            Saint Louis University · SAMCIS · IDSMS-CIS
          </Text>
        </Container>
      </Body>
    </Html>
  );
}
```

`src/lib/services/notify.ts`:

```ts
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

export async function sendEmail(
  to: string,
  subject: string,
  react: ReactElement
): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM_EMAIL;
  if (!apiKey || !from) return false;
  const result = await new Resend(apiKey).emails.send({ from, to, subject, react });
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
          await sendEmail(user.email, input.title, react);
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
```

- [ ] **Step 4: Run tests**

Run: `npx jest src/lib/services/notify.test.ts && npx tsc --noEmit`
Expected: PASS (5), tsc clean.

- [ ] **Step 5: Commit**

```bash
git add src/lib/services/notify.ts src/lib/services/notify.test.ts src/components/emails/notification-email.tsx
git commit -m "Add notification backbone with in-app rows and guarded Resend email"
```

---

### Task 2: Wire the event-driven triggers (1, 2, 3, 4, 7, 9, 10, 11)

**Files:**

- Modify the routes listed in the trigger table:
  - `src/app/api/users/route.ts` (POST create) and `src/app/api/users/bulk-import/route.ts`
  - `src/app/api/auth/reset-password/request/route.ts`
  - `src/app/api/weekly-reports/[id]/submit/route.ts`, `src/app/api/weekly-reports/[id]/review/route.ts`
  - `src/app/api/students/[studentProfileId]/endorsement-letter/route.ts` (if E is merged)
  - `src/app/api/checklist-items/[id]/review/route.ts`, `src/app/api/work-plans/[id]/review/route.ts`, `src/app/api/deviations/[id]/validate/route.ts`
- Create: `src/lib/services/notificationRecipients.ts`
- Test: `src/lib/services/notificationRecipients.test.ts`

**Interfaces:**

- Produces:
  - `getStudentUserId(studentProfileId: string): Promise<string | null>`
  - `getAssignedFacultyIds(studentProfileId: string): Promise<string[]>` (FacultyClassGroup join, same rule as `assertCanAccessStudent`)
  - `getDepartmentStaffIds(): Promise<string[]>` (active DEPARTMENT_COORDINATOR + SUPER_ADMIN)

- [ ] **Step 1: Write the failing tests**

```ts
import { prismaMock, resetPrismaMock } from "@/testUtils/prismaMock";
import {
  getAssignedFacultyIds,
  getDepartmentStaffIds,
  getStudentUserId,
} from "@/lib/services/notificationRecipients";

beforeEach(() => resetPrismaMock());

it("getStudentUserId resolves the owning user", async () => {
  prismaMock.studentProfile.findUnique.mockResolvedValue({ userId: "u-1" } as never);
  await expect(getStudentUserId("p-1")).resolves.toBe("u-1");
});

it("getAssignedFacultyIds uses the student's class group and semester", async () => {
  prismaMock.studentProfile.findUnique.mockResolvedValue({
    classGroupId: "cg",
    semesterId: "sem",
  } as never);
  prismaMock.facultyClassGroup.findMany.mockResolvedValue([
    { facultyId: "f-1" },
    { facultyId: "f-1" },
  ] as never);
  await expect(getAssignedFacultyIds("p-1")).resolves.toEqual(["f-1"]);
  expect(prismaMock.facultyClassGroup.findMany).toHaveBeenCalledWith(
    expect.objectContaining({ where: { classGroupId: "cg", semesterId: "sem" } })
  );
});

it("getDepartmentStaffIds returns active coordinators and admins", async () => {
  prismaMock.user.findMany.mockResolvedValue([{ id: "c-1" }, { id: "a-1" }] as never);
  await expect(getDepartmentStaffIds()).resolves.toEqual(["c-1", "a-1"]);
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx jest notificationRecipients`
Expected: FAIL. Module not found.

- [ ] **Step 3: Implement** `src/lib/services/notificationRecipients.ts`

```ts
import { Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export async function getStudentUserId(studentProfileId: string): Promise<string | null> {
  const profile = await prisma.studentProfile.findUnique({
    where: { id: studentProfileId },
    select: { userId: true },
  });
  return profile?.userId ?? null;
}

export async function getAssignedFacultyIds(studentProfileId: string): Promise<string[]> {
  const profile = await prisma.studentProfile.findUnique({
    where: { id: studentProfileId },
    select: { classGroupId: true, semesterId: true },
  });
  if (!profile) return [];
  const links = await prisma.facultyClassGroup.findMany({
    where: { classGroupId: profile.classGroupId, semesterId: profile.semesterId },
    select: { facultyId: true },
  });
  return Array.from(new Set(links.map((l) => l.facultyId)));
}

export async function getDepartmentStaffIds(): Promise<string[]> {
  const staff = await prisma.user.findMany({
    where: {
      role: { in: [Role.DEPARTMENT_COORDINATOR, Role.SUPER_ADMIN] },
      isActive: true,
      deletedAt: null,
    },
    select: { id: true },
  });
  return staff.map((s) => s.id);
}
```

- [ ] **Step 4: Wire each route.** Add the call **after** the service call succeeds and before `return`. Don't `await` it inside the try in a way that can fail the response: use `void notify(...)` because `notify` never throws.

**Submit** (`weekly-reports/[id]/submit/route.ts`), after `recordWeeklyReportSubmission`:

```ts
void (async () => {
  const facultyIds = await getAssignedFacultyIds(report.studentProfileId);
  await notify({
    userIds: [user.id, ...facultyIds],
    trigger: "REPORT_SUBMITTED",
    title: `Weekly report submitted (${referenceCode})`,
    body: submission.late ? "Submitted late — reason for delay included." : "Submitted on time.",
    link: `/students/${report.studentProfileId}/weekly-reports`,
    email: true,
  });
})();
```

**Review** (`weekly-reports/[id]/review/route.ts`): when `action === "RETURN"`, add an in-app notification. Email is already sent by #70's `sendReportStatusEmail`, so don't duplicate it:

```ts
if (action === "RETURN") {
  const studentUserId = await getStudentUserId(report.studentProfileId);
  if (studentUserId) {
    void notify({
      userIds: [studentUserId],
      trigger: "REPORT_RETURNED",
      title: "Weekly report returned for revision",
      body: notes ?? "",
      link: `/students/${report.studentProfileId}/weekly-reports`,
    });
  }
}
```

**Checklist review / work plan review / deviation validate:** use the same shape, with recipient = `getStudentUserId(...)`.

- Checklist: trigger `CHECKLIST_STATUS`, title `` `Checklist item ${action === "APPROVE" ? "approved" : "returned"}` ``.
- Work plan: trigger `WORK_PLAN_REVIEWED`, `email: true`.
- Deviation: trigger `DEVIATION_VALIDATED`.

**Account creation:** in `users/route.ts` POST and `bulk-import/route.ts`, after each successful creation, send `notify({ userIds: [newUserId], trigger: "ACCOUNT_CREATED", title: "Your IDSMS account is ready", body: "Sign in with your SLU email. You'll be asked to change your password on first login.", link: "/login", email: true })`. **Never include the generated password in the notification.** It's already surfaced once to the admin (FR-UM-03).

**Password reset** (`reset-password/request/route.ts`): replace the dev-only `TODO(Phase 4)` branch. When the request produced a token, send:

```ts
void notify({
  userIds: [result.userId],
  trigger: "PASSWORD_RESET",
  title: "Reset your IDSMS password",
  body: "This link expires in 1 hour.",
  inApp: false,
  email: true,
  emailOverrides: {
    [result.userId]: NotificationEmail({
      title: "Reset your IDSMS password",
      body: "This link expires in 1 hour. If you didn't request it, ignore this email.",
      link: `/auth/reset-password/${result.token}`,
    }),
  },
});
```

Keep the existing dev console log **only** when Resend isn't configured, so local testing still works. Check `requestPasswordReset`'s actual return shape first and adapt `result.userId`/`result.token`. The route must keep its non-enumerating response: the same 200 body whether or not the email exists.

**Endorsement letter** (if E is merged): after `generateEndorsementLetterPdf` returns GENERATED, notify the student (`ENDORSEMENT_LETTER_READY`, `email: true`).

- [ ] **Step 5: Run everything**

Run: `npx jest && npx tsc --noEmit && npx next lint`
Expected: green. If existing route tests mock their dependencies tightly, add `jest.mock("@/lib/services/notify", () => ({ notify: jest.fn() }))` there.

- [ ] **Step 6: Commit**

```bash
git add src/lib/services/notificationRecipients.ts src/lib/services/notificationRecipients.test.ts src/app/api
git commit -m "Send in-app and email notifications for review, submission, and account events"
```

---

### Task 3: In-app inbox (bell, list, mark read) and FR-NT-03 indicators

**Files:**

- Create: `src/app/api/notifications/route.ts`, `src/app/api/notifications/[id]/read/route.ts`, `src/app/(dashboard)/notification-bell.tsx`, `src/app/(dashboard)/notifications/page.tsx`
- Modify: `src/app/(dashboard)/dashboard-nav.tsx`, `src/app/(dashboard)/layout.tsx`
- Create: `src/lib/services/inbox.ts`
- Test: `src/lib/services/inbox.test.ts`

**Interfaces:**

- Produces:
  - `listNotifications(userId, { limit = 20 })`: IN_APP rows, newest first, with `unreadCount`.
  - `markNotificationRead(userId, notificationId): Promise<boolean>` (false if not found or not owned).
  - `markAllRead(userId)`.
  - Routes: `GET /api/notifications`, `PATCH /api/notifications/[id]/read`, `PATCH /api/notifications` (mark all read).

- [ ] **Step 1: Write the failing tests**

```ts
import { prismaMock, resetPrismaMock } from "@/testUtils/prismaMock";
import { listNotifications, markAllRead, markNotificationRead } from "@/lib/services/inbox";

beforeEach(() => resetPrismaMock());

it("lists the user's IN_APP notifications with an unread count", async () => {
  prismaMock.notification.findMany.mockResolvedValue([{ id: "n-1" }] as never);
  prismaMock.notification.count.mockResolvedValue(3);
  await expect(listNotifications("u-1")).resolves.toEqual({
    items: [{ id: "n-1" }],
    unreadCount: 3,
  });
  expect(prismaMock.notification.findMany).toHaveBeenCalledWith(
    expect.objectContaining({
      where: { userId: "u-1", channel: "IN_APP" },
      orderBy: { sentAt: "desc" },
      take: 20,
    })
  );
});

it("cannot mark someone else's notification", async () => {
  prismaMock.notification.updateMany.mockResolvedValue({ count: 0 } as never);
  await expect(markNotificationRead("u-1", "n-other")).resolves.toBe(false);
  expect(prismaMock.notification.updateMany).toHaveBeenCalledWith({
    where: { id: "n-other", userId: "u-1", readAt: null },
    data: { readAt: expect.any(Date) },
  });
});

it("markAllRead only touches the caller's unread rows", async () => {
  prismaMock.notification.updateMany.mockResolvedValue({ count: 2 } as never);
  await markAllRead("u-1");
  expect(prismaMock.notification.updateMany).toHaveBeenCalledWith({
    where: { userId: "u-1", channel: "IN_APP", readAt: null },
    data: { readAt: expect.any(Date) },
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx jest src/lib/services/inbox.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement** `src/lib/services/inbox.ts`

```ts
import { NotificationChannel } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export async function listNotifications(userId: string, { limit = 20 }: { limit?: number } = {}) {
  const [items, unreadCount] = await Promise.all([
    prisma.notification.findMany({
      where: { userId, channel: NotificationChannel.IN_APP },
      orderBy: { sentAt: "desc" },
      take: limit,
      select: { id: true, triggerType: true, payload: true, sentAt: true, readAt: true },
    }),
    prisma.notification.count({
      where: { userId, channel: NotificationChannel.IN_APP, readAt: null },
    }),
  ]);
  return { items, unreadCount };
}

// updateMany scoped by userId: a foreign id simply matches 0 rows (→ 404),
// so ownership is enforced by the query itself.
export async function markNotificationRead(
  userId: string,
  notificationId: string
): Promise<boolean> {
  const { count } = await prisma.notification.updateMany({
    where: { id: notificationId, userId, readAt: null },
    data: { readAt: new Date() },
  });
  return count > 0;
}

export async function markAllRead(userId: string) {
  return prisma.notification.updateMany({
    where: { userId, channel: NotificationChannel.IN_APP, readAt: null },
    data: { readAt: new Date() },
  });
}
```

Routes (each starts with `const user = await requireUserApi();` and uses only `user.id`, never a body-supplied user id):

- `GET /api/notifications` → `listNotifications(user.id)`.
- `PATCH /api/notifications` → `markAllRead(user.id)`.
- `PATCH /api/notifications/[id]/read` → `markNotificationRead`. Return 404 `{ error: "Not found" }` when it returns false.

`notification-bell.tsx` (client component in the sidebar):

- Fetches `GET /api/notifications` on mount and when the route changes, and shows an unread badge.
- A popover/dropdown lists the 10 newest items (title, body, relative time).
- Clicking an item marks it read and `router.push(payload.link)`. "Mark all read" calls PATCH.
- Add it to `dashboard-nav.tsx` next to the user email, plus a "Notifications" nav item → `/notifications` for the full list page.

FR-NT-03 indicators: on the student dashboard (`(dashboard)/page.tsx`), add a compact "Needs attention" list:

- Returned weekly reports (count of RETURNED).
- Pending deviation validations (count of PENDING).
- Reports due within 48h and not yet submitted.
- Incomplete checklist items.

Each links to its page. Data comes from simple Prisma counts; there are no new services.

- [ ] **Step 4: Verify and commit**

Run: `npx jest && npx tsc --noEmit && npx next lint && npx next build`
Expected: green.

```bash
git add src/lib/services/inbox.ts src/lib/services/inbox.test.ts src/app/api/notifications "src/app/(dashboard)"
git commit -m "Add in-app notification inbox and dashboard attention indicators"
```

---

### Task 4: Daily cron — deadline reminders and MOA expiry, configurable (FR-NT-02/05)

**Files:**

- Create: `src/lib/services/scheduledNotifications.ts`, `src/app/api/cron/daily/route.ts`, `vercel.json`
- Modify: `.env.example` (`CRON_SECRET`), `src/app/api/config/required-hours/…` sibling: create `src/app/api/config/notifications/route.ts` (Super Admin GET/PATCH), and add a small form to the admin Users or Settings page.
- Test: `src/lib/services/scheduledNotifications.test.ts`, `src/app/api/cron/daily/route.test.ts`

**Interfaces:**

- Produces:
  - `getNotificationSettings(): Promise<{ deadlineReminderHours: number[]; moaWarningDays: number }>` (defaults `[48, 24]`, `30`)
  - `setNotificationSettings(input, actingUserId)`: Super Admin, audit-logged, validated (`deadlineReminderHours`: 1–3 distinct ints in 1..168; `moaWarningDays` 1..180)
  - `runDailyNotifications(now: Date): Promise<{ deadlineReminders: number; moaWarnings: number }>`

- [ ] **Step 1: Write the failing service tests**

```ts
import { prismaMock, resetPrismaMock } from "@/testUtils/prismaMock";

jest.mock("@/lib/services/notify", () => ({
  notify: jest.fn().mockResolvedValue({ inApp: 1, emailed: 0, failed: 0 }),
}));
jest.mock("@/lib/services/companyService", () => ({
  getExpiringMoaRecords: jest.fn().mockResolvedValue([]),
}));
jest.mock("@/lib/services/notificationRecipients", () => ({
  getDepartmentStaffIds: jest.fn().mockResolvedValue(["c-1"]),
}));

import { notify } from "@/lib/services/notify";
import {
  getNotificationSettings,
  runDailyNotifications,
} from "@/lib/services/scheduledNotifications";

beforeEach(() => {
  resetPrismaMock();
  (notify as jest.Mock).mockClear();
});

it("defaults to 48h and 24h reminders and a 30-day MOA warning", async () => {
  prismaMock.systemConfig.findUnique.mockResolvedValue(null);
  await expect(getNotificationSettings()).resolves.toEqual({
    deadlineReminderHours: [48, 24],
    moaWarningDays: 30,
  });
});

it("reminds students whose open report is due within the window, once", async () => {
  prismaMock.systemConfig.findUnique.mockResolvedValue(null);
  // now = Mon 2026-10-12 08:00 Manila; week ending Sun 10-11 is due Tue 10-13 23:59 Manila (~40h away)
  prismaMock.weeklyReport.findMany.mockResolvedValue([
    {
      id: "wr-1",
      weekStart: new Date("2026-10-05T00:00:00Z"),
      weekEnd: new Date("2026-10-11T00:00:00Z"),
      status: "PENDING",
      revisionHistory: [],
      studentProfile: { id: "p-1", userId: "u-1" },
    },
  ] as never);
  prismaMock.notification.findFirst.mockResolvedValue(null);

  const result = await runDailyNotifications(new Date("2026-10-12T00:00:00Z"));

  expect(result.deadlineReminders).toBe(1);
  expect(notify).toHaveBeenCalledWith(
    expect.objectContaining({
      userIds: ["u-1"],
      trigger: "DEADLINE_REMINDER",
      dedupeKey: "deadline:wr-1:48",
      email: true,
    })
  );
});

it("skips reminders already sent today", async () => {
  prismaMock.systemConfig.findUnique.mockResolvedValue(null);
  prismaMock.weeklyReport.findMany.mockResolvedValue([
    {
      id: "wr-1",
      weekStart: new Date("2026-10-05T00:00:00Z"),
      weekEnd: new Date("2026-10-11T00:00:00Z"),
      status: "PENDING",
      revisionHistory: [],
      studentProfile: { id: "p-1", userId: "u-1" },
    },
  ] as never);
  prismaMock.notification.findFirst.mockResolvedValue({ id: "already" } as never);

  const result = await runDailyNotifications(new Date("2026-10-12T00:00:00Z"));
  expect(result.deadlineReminders).toBe(0);
  expect(notify).not.toHaveBeenCalled();
});

it("does not remind for reports already submitted", async () => {
  prismaMock.systemConfig.findUnique.mockResolvedValue(null);
  prismaMock.weeklyReport.findMany.mockResolvedValue([
    {
      id: "wr-1",
      weekStart: new Date("2026-10-05T00:00:00Z"),
      weekEnd: new Date("2026-10-11T00:00:00Z"),
      status: "PENDING",
      revisionHistory: [{ type: "SUBMITTED", timestamp: "t" }],
      studentProfile: { id: "p-1", userId: "u-1" },
    },
  ] as never);
  const result = await runDailyNotifications(new Date("2026-10-12T00:00:00Z"));
  expect(result.deadlineReminders).toBe(0);
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx jest scheduledNotifications`
Expected: FAIL.

- [ ] **Step 3: Implement** `src/lib/services/scheduledNotifications.ts`

```ts
import { Prisma, WeeklyReportStatus } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { logEvent } from "@/lib/services/auditService";
import { notify } from "@/lib/services/notify";
import { getDepartmentStaffIds } from "@/lib/services/notificationRecipients";
import { getExpiringMoaRecords } from "@/lib/services/companyService";
import { getLatestSubmission } from "@/lib/services/weeklyReportService";
import { getWeeklyReportDueInstant } from "@/lib/utils/reportDeadline";

const HOURS_KEY = "notification:deadline_reminder_hours";
const MOA_KEY = "notification:moa_warning_days";
const DEFAULTS = { deadlineReminderHours: [48, 24], moaWarningDays: 30 };

export const notificationSettingsSchema = z.object({
  deadlineReminderHours: z
    .array(z.number().int().min(1).max(168))
    .min(1)
    .max(3)
    .refine((a) => new Set(a).size === a.length, "Reminder hours must be distinct"),
  moaWarningDays: z.number().int().min(1).max(180),
});

// FR-NT-02: the only place defaults live.
export async function getNotificationSettings() {
  const [hours, moa] = await Promise.all([
    prisma.systemConfig.findUnique({
      where: { configKey: HOURS_KEY },
      select: { configValue: true },
    }),
    prisma.systemConfig.findUnique({
      where: { configKey: MOA_KEY },
      select: { configValue: true },
    }),
  ]);
  const parsed = notificationSettingsSchema.safeParse({
    deadlineReminderHours: hours?.configValue ?? DEFAULTS.deadlineReminderHours,
    moaWarningDays: moa?.configValue ?? DEFAULTS.moaWarningDays,
  });
  return parsed.success ? parsed.data : DEFAULTS;
}

export async function setNotificationSettings(input: unknown, actingUserId: string) {
  const settings = notificationSettingsSchema.parse(input);
  await prisma.$transaction(async (tx) => {
    for (const [configKey, configValue] of [
      [HOURS_KEY, settings.deadlineReminderHours],
      [MOA_KEY, settings.moaWarningDays],
    ] as const) {
      await tx.systemConfig.upsert({
        where: { configKey },
        create: {
          configKey,
          configValue: configValue as Prisma.InputJsonValue,
          updatedBy: actingUserId,
        },
        update: { configValue: configValue as Prisma.InputJsonValue, updatedBy: actingUserId },
      });
    }
    await logEvent(
      {
        userId: actingUserId,
        action: "NOTIFICATION_SETTINGS_UPDATED",
        entityType: "SystemConfig",
        detail: settings,
      },
      tx
    );
  });
  return settings;
}

async function alreadySent(userId: string, dedupeKey: string) {
  return prisma.notification.findFirst({
    where: {
      userId,
      triggerType: "DEADLINE_REMINDER",
      payload: { path: ["dedupeKey"], equals: dedupeKey },
    },
    select: { id: true },
  });
}

// FR-NT-05: one daily run (Hobby tier). Each configured window (e.g. 48h,
// 24h) is evaluated as "due within the next N hours"; the reminder for the
// largest matching window is sent once per report per window.
export async function runDailyNotifications(now: Date) {
  const settings = await getNotificationSettings();
  // Ascending: the first window that still contains `hoursLeft` is the
  // tightest one (e.g. [24, 48]: due in 40h → 48, due in 20h → 24).
  const windows = [...settings.deadlineReminderHours].sort((a, b) => a - b);
  const result = { deadlineReminders: 0, moaWarnings: 0 };

  const openReports = await prisma.weeklyReport.findMany({
    where: { status: { in: [WeeklyReportStatus.PENDING, WeeklyReportStatus.RETURNED] } },
    select: {
      id: true,
      weekStart: true,
      weekEnd: true,
      status: true,
      revisionHistory: true,
      studentProfile: { select: { id: true, userId: true } },
    },
  });

  for (const report of openReports) {
    const submitted =
      report.status === WeeklyReportStatus.PENDING && getLatestSubmission(report.revisionHistory);
    if (submitted) continue;
    const hoursLeft =
      (getWeeklyReportDueInstant(report.weekEnd).getTime() - now.getTime()) / 3_600_000;
    if (hoursLeft <= 0) continue;
    const window = windows.find((w) => hoursLeft <= w);
    if (window === undefined) continue;

    const dedupeKey = `deadline:${report.id}:${window}`;
    if (await alreadySent(report.studentProfile.userId, dedupeKey)) continue;

    await notify({
      userIds: [report.studentProfile.userId],
      trigger: "DEADLINE_REMINDER",
      title: `Weekly report due in about ${Math.ceil(hoursLeft)} hours`,
      body: "Submit your weekly report by Tuesday 11:59 PM to avoid a late flag.",
      link: `/students/${report.studentProfile.id}/weekly-reports`,
      email: true,
      dedupeKey,
    });
    result.deadlineReminders += 1;
  }

  const expiring = await getExpiringMoaRecords(settings.moaWarningDays);
  if (expiring.length > 0) {
    await notify({
      userIds: await getDepartmentStaffIds(),
      trigger: "MOA_EXPIRING",
      title: `${expiring.length} MOA(s) expiring within ${settings.moaWarningDays} days`,
      body: "Review the companies list to start renewals.",
      link: "/companies",
      email: true,
      dedupeKey: `moa:${now.toISOString().slice(0, 10)}`,
    });
    result.moaWarnings = expiring.length;
  }

  return result;
}
```

The `window` choice picks the **smallest configured window that still contains `hoursLeft`**. With `[48, 24]`, a report due in 40h gets the 48 reminder and one due in 20h gets the 24 reminder, each exactly once (the test above pins the 48 case).

`src/app/api/cron/daily/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server";
import { runDailyNotifications } from "@/lib/services/scheduledNotifications";

export const runtime = "nodejs";
export const maxDuration = 300;

// Vercel Cron sends `Authorization: Bearer <CRON_SECRET>` automatically when
// CRON_SECRET is set in the project's environment variables.
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const result = await runDailyNotifications(new Date());
  return NextResponse.json(result);
}
```

`vercel.json` (Hobby: once per day; 00:00 UTC = 08:00 Manila):

```json
{
  "crons": [{ "path": "/api/cron/daily", "schedule": "0 0 * * *" }]
}
```

Append to `.env.example`: `CRON_SECRET=""  # random 32+ char string; also set in Vercel project env`.

Route test `src/app/api/cron/daily/route.test.ts`:

```ts
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
```

Settings API `src/app/api/config/notifications/route.ts`: GET (any staff) → `getNotificationSettings()`. PATCH is `requireRole([SUPER_ADMIN])` → `setNotificationSettings(await req.json(), user.id)`. Add a small form on the Super Admin page with two inputs ("Reminder hours before deadline, comma-separated" and "MOA warning days").

- [ ] **Step 4: Run everything**

Run: `npx jest && npx tsc --noEmit && npx next lint && npx next build`
Expected: green.

- [ ] **Step 5: Manual check**

Set `CRON_SECRET` in `.env`, then run:

```
curl -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/cron/daily
```

Expect JSON counts. Run it again: counts go to 0 because of dedupe.

- [ ] **Step 6: Commit**

```bash
git add src/lib/services/scheduledNotifications.ts src/lib/services/scheduledNotifications.test.ts src/app/api/cron src/app/api/config/notifications vercel.json .env.example "src/app/(dashboard)"
git commit -m "Add daily cron for configurable deadline reminders and MOA expiry warnings"
```

---

## Self-review (completed)

- **Spec coverage:**
  - FR-NT-01: all 12 triggers are mapped in the table and wired in Tasks 2/4.
  - FR-NT-02: configurable intervals (Task 4).
  - FR-NT-03: indicators (Task 3).
  - FR-NT-04: React Email (Task 1).
  - FR-NT-05: daily cron (Task 4).
  - FR-UM-10: the reset email closes the route's `TODO(Phase 4)` (Task 2).
- **Placeholders:**
  - The bell and settings-form UIs are described rather than written out. They're thin clients over fully specified routes.
  - The wiring snippets are given for the two non-obvious routes (submit and reset). The other four follow the same snippet shape with the trigger names listed.
- **Types:** `NotificationTrigger` names are consistent across `notify`, the wiring and the cron; `dedupeKey` matches between cron and test.
- **Review Focus:** all five map to named tests (Tasks 1, 3 and 4).
