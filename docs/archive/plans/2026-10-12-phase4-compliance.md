# Phase 4 Workstream G — Compliance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the Super Admin Export Center (6 re-authenticated, audited Excel exports), the DSAR "Request my data" workflow with a 15-day SLA, quarterly file-retention flagging with admin review before deletion, and database-enforced append-only `audit_logs`.

**Architecture:** Each concern has one service and thin route handlers:

- `adminExportService.ts`: six export builders.
- `dataRequestService.ts`: DSAR tickets and the personal-data workbook.
- `retentionService.ts`: the quarterly scan and the review actions.

One shared `confirmPassword()` helper handles NFR-SEC-05 re-authentication. The bulk-endorsement route already does this inline; it switches to the helper. Spreadsheets reuse `toSheetRows` / `buildWorkbook` / `xlsxResponse`. The audit log becomes tamper-proof through Postgres triggers in a manual migration, because the app's `postgres` role bypasses RLS.

**Tech Stack:** Next.js 14 App Router, Prisma 6, `xlsx` (already a dependency), zod, Jest with `@/testUtils/prismaMock`, Supabase Storage through `src/lib/storage.ts`, shadcn/ui, sonner toasts.

**Spec:** `docs/superpowers/specs/2026-10-12-phase4-compliance-design.md` (approved 2026-10-12). PRD NFR-DP-05..08, NFR-SEC-05/07/10.

## Global Constraints

- **Schema changes:** follow the repo rule: edit `schema.prisma` + `npx prisma generate`, and put DB DDL in `prisma/migrations_manual/007_compliance.sql`. Never run `prisma migrate dev`, `prisma db push` or any SQL against the shared DB. Applying 007 is a separate step that needs Jay's OK.
- **Role checks:** `requireUserApi()` + `requireRole()` in routes; `requireUserPage()` + `redirect("/")` in pages. Everything under `/admin` and `/api/admin` is `SUPER_ADMIN` only.
- **Re-authentication (NFR-SEC-05)** for every bulk export, every DSAR export and every retention delete goes through `confirmPassword()`:
  - 401 `"Password confirmation failed"`;
  - 423 `"Too many failed attempts — try again after <h:mm AM/PM Manila>"`;
  - nothing is queried or exported before the password passes.
- **Every Excel cell goes through `toSheetRows`** (formula-safe). Filenames are `idsms-<what>-<YYYY-MM-DD>.xlsx` via `xlsxResponse`.
- **Never export these:** `hashedPassword`, session or reset tokens, storage object paths. The DSAR Account sheet also leaves out `failedLoginAttempts`.
- **Audit:** every export, DSAR state change and retention action calls `logEvent`. State changes log inside the same `prisma.$transaction` as the change. Actions:
  - `DATA_EXPORTED`
  - `DSAR_REQUESTED`, `DSAR_EXPORTED`, `DSAR_FULFILLED`
  - `RETENTION_SCAN`, `RETENTION_KEPT`, `FILE_DELETED`
- **Retention:** the scan only flags (never calls `deleteObject`). Database rows are never deleted. Storage is touched only through `src/lib/storage.ts`.
- **Notifications** go through `notify()` (never throws, so a failure never fails the action), called after the transaction commits.
- **No new dependencies; `package.json` / `package-lock.json` untouched.** D2: nothing accepts uploads.
- **No Claude/Anthropic attribution** in commits or PR text.

## Review Focus

1. **Wrong password or locked account on any re-auth route:** nothing is queried or exported and no `DATA_EXPORTED` / `DSAR_EXPORTED` / `FILE_DELETED` row is written; the response is 401 or 423. Tested in Task 2 (helper) and in Tasks 3, 5 and 7 (each route).
2. **Free text in a DSAR export** (an accomplishment like `=HYPERLINK("http://x","click")`) must come out as text. Tested in Task 5.
3. **A DSAR from a non-student** (faculty adviser, coordinator, admin) has no student profile. The export still works, with only the Account, Notifications and Activity sheets filled. Tested in Task 5.
4. **Deleting a flagged file whose storage object is already gone** succeeds: the flag becomes DELETED and the path is nulled, not a 502. Tested in Task 7.
5. **The retention scan runs twice** (cron re-run, or two overlapping runs): no duplicate flags, and KEPT/DELETED flags are never reset to PENDING. Tested in Task 7 (upsert with `update: {}` on `@@unique([sourceType, sourceId])`).

---

## File map

| File                                                                                          | Responsibility                                                                                                                |
| --------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `prisma/schema.prisma`                                                                        | `DataRequest`, `RetentionFlag` models; `DataRequestStatus`, `RetentionStatus`, `RetentionSource` enums; `User` back-relations |
| `prisma/migrations_manual/007_compliance.sql`                                                 | audit-log triggers, both tables, indexes, default-deny RLS                                                                    |
| `src/lib/auth/confirmPassword.ts` (+test)                                                     | shared NFR-SEC-05 password re-auth returning `NextResponse \| null`                                                           |
| `src/lib/storage.ts` (+test)                                                                  | adds `deleteObject(bucket, path)`                                                                                             |
| `src/lib/errors/compliance.ts`                                                                | `DataRequestStateError` (409), `RetentionStateError` (409), `ComplianceNotFoundError` (404)                                   |
| `src/lib/utils/apiError.ts`                                                                   | maps the three errors                                                                                                         |
| `src/lib/services/adminExportService.ts` (+test)                                              | `EXPORT_KINDS`, `buildAdminExport(kind, semesterId?)`                                                                         |
| `src/app/api/admin/exports/[kind]/route.ts` (+test)                                           | re-auth → build → log → stream                                                                                                |
| `src/app/(dashboard)/admin/export-center/page.tsx`                                            | Export Center page (cards, DSAR queue, retention list, recent exports)                                                        |
| `src/app/(dashboard)/admin/export-center/export-card.tsx`                                     | client card: inline password, POST, blob download                                                                             |
| `src/app/(dashboard)/admin/export-center/password-action.tsx`                                 | reusable client "confirm with password" inline form used by cards, DSAR export, retention delete                              |
| `src/lib/services/dataRequestService.ts` (+test)                                              | create / list / fulfil tickets, `buildPersonalDataWorkbook(userId)`                                                           |
| `src/app/api/data-requests/route.ts` (+test)                                                  | POST create (any signed-in user)                                                                                              |
| `src/app/api/admin/data-requests/[id]/export/route.ts` (+test), `.../fulfil/route.ts` (+test) | admin actions                                                                                                                 |
| `src/app/(dashboard)/profile/data-request-card.tsx`                                           | "Request my data" card                                                                                                        |
| `src/app/(dashboard)/admin/export-center/data-request-actions.tsx`                            | client: Generate export / Mark fulfilled                                                                                      |
| `src/lib/services/retentionService.ts` (+test)                                                | `runRetentionScan(now)`, `keepFlag`, `deleteFlaggedFile`                                                                      |
| `src/app/api/admin/retention/[id]/keep/route.ts`, `.../delete/route.ts` (+tests)              | admin actions                                                                                                                 |
| `src/app/(dashboard)/admin/export-center/retention-actions.tsx`                               | client: Keep / Delete permanently                                                                                             |
| `src/lib/services/scheduledNotifications.ts` (+test)                                          | DSAR due reminders + quarterly retention call in the daily run                                                                |
| `src/lib/services/notify.ts`, `notificationRecipients.ts`                                     | new triggers; `getSuperAdminIds()`                                                                                            |
| `src/app/(dashboard)/dashboard-nav.tsx`                                                       | "Export Center" (Super Admin only)                                                                                            |

---

### Task 1: Schema, migration 007 and compliance errors

**Files:**

- Modify: `prisma/schema.prisma`, `src/lib/utils/apiError.ts`, `prisma/migrations_manual/001_vector_extension_and_audit_rls.sql` (comment only: point to 007)
- Create: `prisma/migrations_manual/007_compliance.sql`, `src/lib/errors/compliance.ts`, `src/lib/utils/apiError.test.ts` additions (or create if absent)

**Interfaces:**

- Produces (Prisma):

```prisma
enum DataRequestStatus { OPEN FULFILLED }
enum RetentionStatus { PENDING KEPT DELETED }
enum RetentionSource { CHECKLIST DEVIATION_PROOF GENERATED_DOCUMENT }

model DataRequest {
  id          String            @id @default(uuid()) @db.Uuid
  userId      String            @map("user_id") @db.Uuid
  status      DataRequestStatus @default(OPEN)
  requestedAt DateTime          @default(now()) @map("requested_at") @db.Timestamptz(3)
  dueAt       DateTime          @map("due_at") @db.Timestamptz(3)
  fulfilledAt DateTime?         @map("fulfilled_at") @db.Timestamptz(3)
  fulfilledBy String?           @map("fulfilled_by") @db.Uuid

  user        User              @relation("DataRequestRequester", fields: [userId], references: [id])
  fulfiller   User?             @relation("DataRequestFulfiller", fields: [fulfilledBy], references: [id])

  @@index([status, dueAt])
  @@index([userId])
  @@map("data_requests")
}

model RetentionFlag {
  id               String          @id @default(uuid()) @db.Uuid
  bucket           String
  objectPath       String          @map("object_path")
  sourceType       RetentionSource @map("source_type")
  sourceId         String          @map("source_id") @db.Uuid
  studentProfileId String          @map("student_profile_id") @db.Uuid
  semesterEndDate  DateTime        @map("semester_end_date")
  flaggedAt        DateTime        @default(now()) @map("flagged_at") @db.Timestamptz(3)
  status           RetentionStatus @default(PENDING)
  reviewedAt       DateTime?       @map("reviewed_at") @db.Timestamptz(3)
  reviewedBy       String?         @map("reviewed_by") @db.Uuid

  @@unique([sourceType, sourceId])
  @@index([status])
  @@map("retention_flags")
}
```

Add to `User`: `dataRequests DataRequest[] @relation("DataRequestRequester")` and `fulfilledDataRequests DataRequest[] @relation("DataRequestFulfiller")`.

- Produces (TS):

```ts
// src/lib/errors/compliance.ts
export class DataRequestStateError extends Error {
  name = "DataRequestStateError";
} // → 409
export class RetentionStateError extends Error {
  name = "RetentionStateError";
} // → 409
export class ComplianceNotFoundError extends Error {
  name = "ComplianceNotFoundError";
} // → 404
```

- [ ] **Step 1:** Add the enums, the two models and the `User` back-relations exactly as above. Run `npx prisma format` and `npx prisma generate`; expect no errors. Update the `AuditLog` model comment: "Append-only: enforced by triggers in migrations_manual/007 (the app's postgres role bypasses RLS); RLS policies from 001 remain as defense in depth."
- [ ] **Step 2:** Write `007_compliance.sql`:

```sql
-- Manual migration 007 — Phase 4 Workstream G. Run once in the Supabase SQL
-- editor AFTER `prisma db push`. Idempotent.

-- 1. NFR-SEC-10: audit_logs append-only for EVERY role. The app connects as
--    `postgres` (table owner, BYPASSRLS), so 001's RLS policies never apply to
--    it. Triggers fire regardless of RLS bypass.
CREATE OR REPLACE FUNCTION audit_logs_append_only() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'audit_logs is append-only (NFR-SEC-10)'
    USING ERRCODE = 'insufficient_privilege';
END;
$$;

DROP TRIGGER IF EXISTS audit_logs_no_update_delete ON audit_logs;
CREATE TRIGGER audit_logs_no_update_delete
  BEFORE UPDATE OR DELETE ON audit_logs
  FOR EACH ROW EXECUTE FUNCTION audit_logs_append_only();

DROP TRIGGER IF EXISTS audit_logs_no_truncate ON audit_logs;
CREATE TRIGGER audit_logs_no_truncate
  BEFORE TRUNCATE ON audit_logs
  FOR EACH STATEMENT EXECUTE FUNCTION audit_logs_append_only();

-- 2. Tables created by `prisma db push`; this block only guarantees indexes
--    and default-deny RLS (NFR-SEC-11) if they were created another way.
ALTER TABLE IF EXISTS data_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS retention_flags ENABLE ROW LEVEL SECURITY;

-- 3. Verification (run manually, expect both statements to fail):
-- BEGIN;
--   UPDATE audit_logs SET action = action WHERE id = (SELECT id FROM audit_logs LIMIT 1);
-- ROLLBACK;
-- BEGIN;
--   DELETE FROM audit_logs WHERE id = (SELECT id FROM audit_logs LIMIT 1);
-- ROLLBACK;
```

- [ ] **Step 3: Failing test.** In `src/lib/utils/apiError.test.ts`:
  - `handleApiError(new DataRequestStateError("x"))` returns 409 `{ error: "x" }`;
  - `RetentionStateError` returns 409;
  - `ComplianceNotFoundError("Not found")` returns 404.
    Run `npx jest src/lib/utils/apiError.test.ts` and expect it to FAIL (module not found).
- [ ] **Step 4:** Create `src/lib/errors/compliance.ts` and add the three `instanceof` mappings to `handleApiError`, next to the `SemesterStateError` mapping. Run again and expect it to PASS.
- [ ] **Step 5:** Run `npx tsc --noEmit`, then commit with `git commit -m "Add compliance schema, append-only audit trigger migration and compliance errors"`.

---

### Task 2: Password re-auth helper and storage delete

**Files:**

- Create: `src/lib/auth/confirmPassword.ts`, `src/lib/auth/confirmPassword.test.ts`
- Modify: `src/lib/storage.ts` (+ `src/lib/storage.test.ts`, create if absent), `src/app/api/class-groups/[classGroupId]/endorsement-letters/route.ts` (use the helper; its existing route test must stay green)

**Interfaces:**

- Consumes: `verifyCredentials(email, password, ip)` from `userService.ts`, which returns `{ ok: true } | { ok: false; reason: "ACCOUNT_LOCKED"; lockedUntil: Date } | { ok: false; reason: ... }`.
- Produces:

```ts
// Returns null when the password is right; otherwise the response to return.
export async function confirmPassword(
  user: { email: string },
  password: unknown,
  ip: string | null
): Promise<NextResponse | null>;

// storage.ts — idempotent: a missing object is success.
export async function deleteObject(bucket: string, path: string): Promise<void>;
export class StorageDeleteError extends Error {} // non-"not found" failures
```

- [ ] **Step 1: Failing tests** in `confirmPassword.test.ts`, with `verifyCredentials` mocked:
  - a correct password returns `null`;
  - a wrong password returns 401 `{ error: "Password confirmation failed" }`;
  - `ACCOUNT_LOCKED` with `lockedUntil = 2026-10-12T05:30:00Z` returns 423, with an error containing `"1:30 PM"` (Manila);
  - a missing or empty password returns 400 `{ error: "Password is required" }` and never calls `verifyCredentials`.
- [ ] **Step 2:** Run → FAIL. Implement by moving the endorsement route's inline block (parse → `verifyCredentials` → 423/401) into the helper verbatim, with zod `z.string().min(1)` for the password. Run → PASS.
- [ ] **Step 3:** Refactor the endorsement-letters route to `const denied = await confirmPassword(user, body.password, req.headers.get("x-forwarded-for")); if (denied) return denied;`. Run `npx jest src/app/api/class-groups` and expect it to PASS unchanged.
- [ ] **Step 4: Failing tests** for `deleteObject`, with `supabaseAdmin.storage.from().remove` mocked:
  - success resolves;
  - an error whose message matches `/not found/i` resolves (idempotent);
  - any other error throws `StorageDeleteError` with that message;
  - it calls `remove([path])` on the given bucket.
- [ ] **Step 5:** Implement:

```ts
export class StorageDeleteError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StorageDeleteError";
  }
}
export async function deleteObject(bucket: string, path: string): Promise<void> {
  const { error } = await supabaseAdmin.storage.from(bucket).remove([path]);
  if (error && !/not found/i.test(error.message)) throw new StorageDeleteError(error.message);
}
```

Run → PASS. `npx tsc --noEmit`. Commit with `"Extract password re-auth helper and add idempotent storage delete"`.

---

### Task 3: Admin export service and route

**Files:**

- Create: `src/lib/services/adminExportService.ts` (+test), `src/app/api/admin/exports/[kind]/route.ts` (+test)

**Interfaces:**

- Consumes:
  - `getComplianceRows(scope, now)` and `ComplianceScope` from `complianceService.ts`, with scope `{ kind: "department", semesterId }`;
  - `toSheetRows`, `buildWorkbook`, `xlsxResponse`, `formatManilaDateTime` from `src/lib/utils/excelExport.ts`;
  - `confirmPassword` (Task 2) and `ComplianceNotFoundError` (Task 1).
- Produces:

```ts
export const EXPORT_KINDS = [
  "users",
  "students",
  "attendance",
  "reports",
  "checklist",
  "companies",
] as const;
export type ExportKind = (typeof EXPORT_KINDS)[number];
export const EXPORT_LABELS: Record<ExportKind, { title: string; description: string }>;
export function isExportKind(value: string): value is ExportKind;
export async function buildAdminExport(
  kind: ExportKind,
  semesterId?: string
): Promise<{ sheets: Array<{ name: string; rows: Record<string, unknown>[] }>; rowCount: number }>;
```

- Columns, each builder being one `findMany` with an explicit `select` (no N+1):
  - `users` (sheet `Users`): Email, Role, Active (`Yes`/`No`), Locked until (Manila or ""), Created (Manila), Updated (Manila). Filter `deletedAt: null`. No `semesterId` filter (users span semesters).
  - `students` (sheet `Students`): the same columns as the F compliance export, built from `getComplianceRows`. With no `semesterId`, it loops every semester (archived included) and adds a `Semester` column.
  - `attendance` (sheet `Attendance`): Student number, Date (`YYYY-MM-DD`), Status, Time in, Time out, Scheduled hours, Actual hours. Filter through `weeklyReport.studentProfile.semesterId` when given; order by student number, then date.
  - `reports` (sheets `Weekly reports` and `Monthly reports`):
    - Weekly reports: student number, week start, status, total hours, faculty action, submitted at (latest SUBMITTED entry of `revisionHistory`, Manila, or ""), reference code (the matching `GeneratedDocument` `WEEKLY_REPORT` row's `referenceCode` by `periodLabel` = week start, or "").
    - Monthly reports: `GeneratedDocument` rows with `documentType: MONTHLY_REPORT`, giving student number, period, status and reference code.
  - `checklist` (sheet `Checklist`): Student number, Requirement, Status, Reviewer email, Reviewed at (Manila), Comments. No `filePath`.
  - `companies` (sheet `Companies`): Company, Address, Work modality, Supervisor, Supervisor position, Verified, MOA status (latest non-archived `MoaRecord` by `validTo`), MOA valid to (`YYYY-MM-DD`). No `semesterId` filter.
- Route `POST /api/admin/exports/[kind]` with body `{ password: string, semesterId?: string (uuid) }`:
  - `requireUserApi` + `requireRole([SUPER_ADMIN])`;
  - an unknown kind throws `ComplianceNotFoundError("Unknown export")`, giving 404;
  - `confirmPassword`;
  - `buildAdminExport`;
  - `logEvent({ userId, action: "DATA_EXPORTED", entityType: "Export", ipAddress, detail: { kind, semesterId: semesterId ?? null, rowCount } })`;
  - `xlsxResponse(buildWorkbook(...), \`export-${kind}\`)`;
  - `export const runtime = "nodejs"; export const maxDuration = 60;`

- [ ] **Step 1: Failing service tests:**
  - the `users` builder's `select` never includes `hashedPassword` (assert on the `findMany` args), and no row key contains "password";
  - `students` with no semester calls `getComplianceRows` once per semester and adds `Semester`;
  - `attendance` with `semesterId` filters `weeklyReport: { studentProfile: { semesterId } }`;
  - `reports` derives submitted-at from `revisionHistory` and matches the reference code by week;
  - `checklist` rows have no `filePath` key;
  - `companies` picks the latest non-archived MOA;
  - `rowCount` equals the sum of rows across sheets.
- [ ] **Step 2:** Run `npx jest src/lib/services/adminExportService.test.ts` → FAIL. Implement. Run → PASS.
- [ ] **Step 3: Failing route tests:**
  - a coordinator gets 401 and `buildAdminExport` is not called;
  - a wrong password gets 401, `buildAdminExport` and `logEvent` are not called (Review Focus 1);
  - a locked account gets 423;
  - an unknown kind gets 404;
  - a non-uuid `semesterId` gets 400;
  - success gets 200 with the xlsx content type and filename `idsms-export-users-<date>.xlsx`, and `logEvent` is called with `DATA_EXPORTED` and `rowCount`;
  - a student name `=HYPERLINK("http://x")` in the `students` export reads back from the workbook as `'=HYPERLINK...`.
- [ ] **Step 4:** Implement the route. Run → PASS. `npx tsc --noEmit && npx next lint`. Commit with `"Add re-authenticated, audited admin bulk exports"`.

---

### Task 4: Export Center page and navigation

**Files:**

- Create: `src/app/(dashboard)/admin/export-center/page.tsx`, `export-card.tsx`, `password-action.tsx`
- Modify: `src/app/(dashboard)/dashboard-nav.tsx`

**Interfaces:**

- Consumes:
  - `EXPORT_KINDS` and `EXPORT_LABELS` (Task 3);
  - `listSemesters()` from `semesterService.ts`;
  - `queryAuditLogs({ action: "DATA_EXPORTED", page: 1 }, { pageSize: 20 })` from `auditLogQuery.ts`.
- Produces (client component, reused in Tasks 6 and 7):

```tsx
export function PasswordAction(props: {
  triggerLabel: string; // e.g. "Export", "Generate export", "Delete permanently"
  confirmLabel: string; // e.g. "Confirm and download"
  description?: string; // shown above the password field
  destructive?: boolean;
  onConfirm: (password: string) => Promise<void>; // throws Error(message) on failure
}): JSX.Element;
export async function downloadFromResponse(res: Response): Promise<void>; // reads filename from Content-Disposition, saves blob via object URL
```

- [ ] **Step 1:** Write `password-action.tsx`:
  - a button reveals an inline form: a labelled password input (`autoComplete="current-password"`, `autoFocus`), Confirm, and Cancel;
  - Escape cancels;
  - a pending state disables both buttons;
  - on error it calls `toast.error(message)` and keeps the form open with the password cleared;
  - on success it closes the form;
  - no `window.confirm`.
- [ ] **Step 2:** Write `export-card.tsx` (client):
  - props `{ kind, title, description, semesters: Array<{ id; label }>, semesterAware: boolean }`;
  - a semester `<select>` (default "All semesters"), shown only for semester-aware kinds (`students`, `attendance`, `reports`, `checklist`);
  - a `PasswordAction` whose `onConfirm` POSTs `/api/admin/exports/${kind}`, calls `downloadFromResponse` on 200 and then `router.refresh()`, and otherwise throws `new Error(body.error)`.
- [ ] **Step 3:** Write `page.tsx`:
  - `requireUserPage()`, and anything but `SUPER_ADMIN` gets `redirect("/")`;
  - heading "Export Center";
  - an `Alert`/banner: "Every export asks for your password and is recorded in the audit log.";
  - a 3-column grid of the 6 cards;
  - empty `<section id="data-requests">` and `<section id="retention">` placeholders with headings, filled in Tasks 6 and 7, each showing "Nothing here yet." until then;
  - a "Recent exports" table (When, By, Export, Semester, Rows) from the latest 20 `DATA_EXPORTED` rows. `detail.kind` maps to `EXPORT_LABELS[kind].title`; a missing detail shows "—".
- [ ] **Step 4:** Add `{ href: "/admin/export-center", label: "Export Center" }` to `dashboard-nav.tsx` for `SUPER_ADMIN` only, following the existing "Audit log" entry.
- [ ] **Step 5:** `npx tsc --noEmit && npx next lint && npx jest` → green. Commit with `"Add Super Admin Export Center page"`.

---

### Task 5: DSAR service, request and admin routes, profile card

**Files:**

- Create: `src/lib/services/dataRequestService.ts` (+test), `src/app/api/data-requests/route.ts` (+test), `src/app/api/admin/data-requests/[id]/export/route.ts` (+test), `src/app/api/admin/data-requests/[id]/fulfil/route.ts` (+test), `src/app/(dashboard)/profile/data-request-card.tsx`
- Modify: `src/app/(dashboard)/profile/page.tsx`, `src/lib/services/notify.ts` (triggers), `src/lib/services/notificationRecipients.ts`

**Interfaces:**

- Consumes:
  - `logEvent(input, tx)`;
  - `notify({ userIds, trigger, title, body, link, email: true })`;
  - `confirmPassword`;
  - `toSheetRows` / `buildWorkbook` / `xlsxResponse` / `formatManilaDateTime`;
  - `DataRequestStateError` and `ComplianceNotFoundError`.
- Produces:

```ts
export const DSAR_SLA_DAYS = 15;
export async function createDataRequest(
  userId: string,
  ip: string | null
): Promise<{ id: string; dueAt: Date }>;
export async function getMyDataRequestSummary(
  userId: string
): Promise<{ open: { dueAt: Date } | null; lastFulfilledAt: Date | null }>;
export async function listDataRequests(): Promise<{
  open: Array<{ id: string; email: string; requestedAt: Date; dueAt: Date }>;
  recentFulfilled: Array<{ id: string; email: string; requestedAt: Date; fulfilledAt: Date }>;
}>; // open ordered by dueAt asc; fulfilled: last 10 by fulfilledAt desc
export async function buildPersonalDataWorkbook(
  userId: string
): Promise<{ sheets: Array<{ name: string; rows: Record<string, unknown>[] }>; email: string }>;
export async function markDataRequestFulfilled(
  id: string,
  actingUserId: string
): Promise<{ userId: string }>;
// notify.ts NotificationTrigger union gains: "DSAR_REQUESTED" | "DSAR_FULFILLED" | "DSAR_DUE" | "RETENTION_REVIEW"
// notificationRecipients.ts:
export async function getSuperAdminIds(): Promise<string[]>; // role SUPER_ADMIN, isActive, deletedAt null
```

- Rules:
  - **`createDataRequest`:** inside `$transaction`, if an OPEN request exists for the user, throw `DataRequestStateError(\`You already have an open request (due ${Manila date})\`)`. Otherwise create it with `dueAt = requestedAt + 15 days`and`logEvent({ action: "DSAR_REQUESTED", entityType: "DataRequest", entityId, ipAddress })`.
  - **After commit, the route** notifies `getSuperAdminIds()`: `DSAR_REQUESTED`, title "New data request", body `"<email> asked for a copy of their personal data. Due <date>."`, link `/admin/export-center#data-requests`.
  - **`buildPersonalDataWorkbook`** produces one sheet per area, always in this order:
    - Account: Email, Role, Active, Created. No `hashedPassword` or `failedLoginAttempts`.
    - Student profile: student number, program, class group, semester, company, required hours, full name, position.
    - Checklist: requirement, status, reviewed at, comments.
    - Work plan: status, created, planned tasks as JSON text.
    - Attendance: date, status, time in/out, hours, accomplishments, tools.
    - Weekly reports: week, status, hours, faculty action.
    - Deviation reports: date, type, reason, validation status.
    - Generated documents: type, period, status, reference code, generated at.
    - Notifications: when, type, title (from `payload.title`), read.
    - Activity: the user's own audit rows, with timestamp, action, entity type and IP.
    - A user without a student profile gets header-only sheets for the six student areas (Review Focus 3). Every sheet goes through `toSheetRows`.
  - **`markDataRequestFulfilled`:** a request that isn't found throws `ComplianceNotFoundError("Request not found")`; one that isn't OPEN throws `DataRequestStateError("This request is already fulfilled")`. Otherwise, in one transaction, set FULFILLED, `fulfilledAt` and `fulfilledBy`, and log `DSAR_FULFILLED`.
  - **Routes:**
    - `POST /api/data-requests`: any signed-in user. Returns 201 `{ id, dueAt }`.
    - `POST /api/admin/data-requests/[id]/export` with `{ password }`: Super Admin. 404 if the request is not found. Then `confirmPassword`, then build, then log `DSAR_EXPORTED` (entityId = request id, `detail: { userId, sheets: n }`), then `xlsxResponse(..., "dsar-" + id.slice(0, 8))`.
    - `POST /api/admin/data-requests/[id]/fulfil`: Super Admin. After commit, notify the requester: `DSAR_FULFILLED`, title "Your data request is complete", body "The Super Admin has prepared your data. They will send you the file.", link `/profile`.

- [ ] **Step 1: Failing service tests:**
  - `dueAt` is exactly 15×24h after `requestedAt`;
  - a second open request throws `DataRequestStateError`;
  - `DSAR_REQUESTED` is logged with `tx`;
  - fulfil on a non-OPEN request throws;
  - fulfil logs `DSAR_FULFILLED`;
  - the workbook has the 10 sheets in order;
  - the Account sheet has no password field;
  - attendance rows come only from the requester's own weekly reports (assert the `where` uses their studentProfileId);
  - a faculty user (no profile) gets header-only student sheets (Review Focus 3);
  - an accomplishment `=HYPERLINK("http://x","click")` comes out as `'=HYPERLINK...` (Review Focus 2);
  - `getSuperAdminIds` filters active, non-deleted Super Admins.
- [ ] **Step 2:** Run → FAIL; implement; run → PASS.
- [ ] **Step 3: Failing route tests:**
  - an anonymous POST to `/api/data-requests` gets 401;
  - a student POST gets 201 and super admins are notified;
  - a duplicate gets 409;
  - an admin export as a coordinator gets 401;
  - an admin export with a wrong password gets 401 and no build or log (Review Focus 1);
  - an admin export for an unknown id gets 404;
  - an admin export success gets 200 xlsx and `DSAR_EXPORTED`;
  - fulfil success gets 200 and the requester is notified;
  - fulfilling twice gets 409.
- [ ] **Step 4:** Implement the routes. Run → PASS.
- [ ] **Step 5:** `data-request-card.tsx` (client; props `{ open: { dueAt: string } | null; lastFulfilledAt: string | null }`):
  - title "Your data";
  - text "You can ask for a copy of the personal data IDSMS holds about you. The Super Admin has 15 days to prepare it.";
  - when there's no open request, a button "Request my data" that POSTs, then `toast.success("Request sent — due <date>")` and `router.refresh()`, or `toast.error(body.error)`;
  - when one is open, the text "Request open — due <Manila date>" and no button;
  - when there's a last fulfilled date, the line "Last request completed <date>".
    Render it on `/profile` for every role, with data from `getMyDataRequestSummary`.
- [ ] **Step 6:** `npx tsc --noEmit && npx next lint && npx jest` → green. Commit with `"Add data subject access requests with 15-day SLA"`.

---

### Task 6: DSAR queue on the Export Center and due reminders

**Files:**

- Create: `src/app/(dashboard)/admin/export-center/data-request-actions.tsx`
- Modify: `src/app/(dashboard)/admin/export-center/page.tsx` (fill `#data-requests`), `src/lib/services/scheduledNotifications.ts` (+test)

**Interfaces:**

- Consumes: `listDataRequests()` and `getSuperAdminIds()` (Task 5), `PasswordAction` and `downloadFromResponse` (Task 4), `notify` with `dedupeKey`.
- Produces:

```ts
// scheduledNotifications.ts
export const DSAR_REMINDER_DAYS = 3;
export async function remindDueDataRequests(now: Date): Promise<number>; // count of reminders sent; called from runDailyNotifications
```

- Rules:
  - **Selection:** OPEN requests with `dueAt <= now + 3 days`, overdue included.
  - **Recipients:** one `notify` to `getSuperAdminIds()` per request, trigger `DSAR_DUE`, `dedupeKey: \`dsar:${id}:${<Manila YYYY-MM-DD of now>}\``. Build the date with the same Manila date-key helper the existing MOA-expiry step in `scheduledNotifications.ts` already uses for its dedupe key; don't add a new one.
  - **Wording:**
    - title "Data request due soon" or "Data request overdue";
    - body `"<email>'s request is due <date>."` or `"<email>'s request was due <date>."`;
    - link `/admin/export-center#data-requests`.
  - **Error handling:** wire it into `runDailyNotifications` the same way as the existing steps, so its errors land in `result.errors` and don't stop other steps.
- Queue UI (server-rendered in `#data-requests`):
  - **Open table:** Requester, Requested, Due, Days left. Days left is a red "Overdue by N days" badge when overdue, amber when 3 days or fewer.
  - **Actions** (`data-request-actions.tsx`): a `PasswordAction` "Generate export" that POSTs the export route then calls `downloadFromResponse`, and a "Mark fulfilled" button (no password; it's not an export) that POSTs fulfil, then toasts and refreshes.
  - **Below:** a "Recently fulfilled" list of the last 10.
  - **Empty state:** "No open data requests."

- [ ] **Step 1: Failing tests** in `scheduledNotifications.test.ts`:
  - a request due in 2 days notifies with the "due soon" title;
  - one due 5 days ago gets the "overdue" title;
  - one due in 10 days gets no notification;
  - FULFILLED requests are excluded (assert the `where`);
  - `dedupeKey` includes the Manila date;
  - `runDailyNotifications` calls it and a thrown error lands in `errors` without stopping the other steps.
- [ ] **Step 2:** Run → FAIL; implement; run → PASS.
- [ ] **Step 3:** Build the queue section and `data-request-actions.tsx`.
- [ ] **Step 4:** `npx tsc --noEmit && npx next lint && npx jest` → green. Commit with `"Add DSAR queue to the Export Center and daily due reminders"`.

---

### Task 7: Quarterly retention scan and review

**Files:**

- Create: `src/lib/services/retentionService.ts` (+test), `src/app/api/admin/retention/[id]/keep/route.ts` (+test), `src/app/api/admin/retention/[id]/delete/route.ts` (+test), `src/app/(dashboard)/admin/export-center/retention-actions.tsx`
- Modify: `src/lib/services/scheduledNotifications.ts` (+test; call the scan), `src/app/(dashboard)/admin/export-center/page.tsx` (fill `#retention`)

**Interfaces:**

- Consumes:
  - `CHECKLIST_BUCKET`, `GENERATED_DOCUMENTS_BUCKET` and `deleteObject` / `StorageDeleteError` (Task 2);
  - `isStoragePath` from `attendanceService.ts`;
  - `RetentionStateError` and `ComplianceNotFoundError`;
  - `getSuperAdminIds` and `notify`;
  - `prisma.systemConfig`.
- Produces:

```ts
export const RETENTION_YEARS = 3;
export const RETENTION_SCAN_INTERVAL_DAYS = 90;
export const RETENTION_LAST_SCAN_KEY = "retention:last_scan_at";
export async function runRetentionScan(now: Date): Promise<{ ran: boolean; flagged: number }>;
export async function listPendingRetentionFlags(): Promise<
  Array<{
    id: string;
    sourceType: RetentionSource;
    studentNumber: string;
    semesterEndDate: Date;
    flaggedAt: Date;
  }>
>;
export async function keepRetentionFlag(id: string, actingUserId: string): Promise<void>;
export async function deleteRetentionFlaggedFile(
  id: string,
  actingUserId: string,
  ip: string | null
): Promise<void>;
```

- Rules:
  - **`runRetentionScan`:** read SystemConfig `retention:last_scan_at` (an ISO string). If it's present and less than 90 days before `now`, return `{ ran: false, flagged: 0 }`.
  - **Cutoff:** `cutoff = now − 3 years`, by calendar year: `new Date(Date.UTC(y - 3, m, d))` from `now`'s UTC parts.
  - **Candidates:** query students whose `semester.endDate < cutoff`, and their:
    - checklist items with `filePath` not null → `CHECKLIST`, `CHECKLIST_BUCKET`;
    - deviation reports with `proofUrl` not null and `isStoragePath(proofUrl)` → `DEVIATION_PROOF`, `CHECKLIST_BUCKET`;
    - generated documents with `fileUrl` not null → `GENERATED_DOCUMENT`, `GENERATED_DOCUMENTS_BUCKET`.
  - **Flagging:** for each candidate, `retentionFlag.upsert({ where: { sourceType_sourceId }, create: {...PENDING}, update: {} })`. `update: {}` means a KEPT or DELETED flag is never reset (Review Focus 5). Count only the creates: compare `findMany` of existing keys first, or count the upserts whose `flaggedAt` equals this run's timestamp. Use the first approach, which is simpler to test.
  - **Wrap-up:** then upsert the SystemConfig key to `now.toISOString()` and `logEvent({ userId: null, action: "RETENTION_SCAN", entityType: "RetentionFlag", detail: { flagged } })`. If `flagged > 0`, notify the Super Admins: `RETENTION_REVIEW`, "Files due for retention review", `"<n> files are more than 3 years past their semester. Review them in the Export Center."`, link `/admin/export-center#retention`.
  - **Never** call `deleteObject` or any `delete`/`deleteMany`.
  - **`keepRetentionFlag`:** not found → 404 error; not PENDING → `RetentionStateError("This file was already reviewed")`. Otherwise, in one transaction, set KEPT, `reviewedAt` and `reviewedBy`, and log `RETENTION_KEPT`.
  - **`deleteRetentionFlaggedFile`:** not found → 404; not PENDING → 409.
    - First call `deleteObject(flag.bucket, flag.objectPath)`. On `StorageDeleteError`, rethrow; the route maps it to 502 `{ error: message }` and the flag stays PENDING. A missing object is already success (Task 2, Review Focus 4).
    - Then, in one transaction, null the source path column (`preDeploymentChecklistItem.filePath`, `deviationReport.proofUrl` or `generatedDocument.fileUrl`, using `updateMany({ where: { id: sourceId }, data: { <col>: null } })` so an already-removed row doesn't throw), set the flag to DELETED with reviewedAt/By, and `logEvent({ action: "FILE_DELETED", entityType: "RetentionFlag", entityId: id, ipAddress: ip, detail: { bucket, objectPath, sourceType, sourceId } })`.
  - **Cron:** `runDailyNotifications` calls `runRetentionScan(now)` as its own step (errors go to `result.errors`).
  - **Routes:** `keep` is Super Admin with no password; `delete` is Super Admin plus `confirmPassword`. `StorageDeleteError` → 502. Add that mapping in the route's catch, not in `apiError.ts`, since only this route deletes.
  - **UI `#retention`:** a table of pending flags (Student, File type with labels "Checklist document" / "Deviation proof" / "Generated PDF", Semester ended, Flagged). Actions (`retention-actions.tsx`): a "Keep" button, and a `PasswordAction` "Delete permanently" (destructive) with description "This permanently removes the file from storage. The record stays and the deletion is logged." Empty state: "No files are due for review."

- [ ] **Step 1: Failing service tests:**
  - the scan is skipped when the last scan was 30 days ago;
  - it runs when the key is missing or 91 days old;
  - the cutoff boundary: a semester ending exactly 3 years + 1 day before `now` is flagged, and one ending 3 years − 1 day before is not;
  - an external `https://` deviation proof is skipped;
  - the upsert is called with `update: {}` (Review Focus 5);
  - a second scan with all keys existing reports `flagged: 0` and sends no notification;
  - the scan never calls `deleteObject` or any `delete`/`deleteMany` (assert on the mocks);
  - it writes the SystemConfig key and `RETENTION_SCAN`;
  - keep: not PENDING → `RetentionStateError`;
  - delete: calls `deleteObject` with the flag's bucket and path, nulls the right column per sourceType, logs `FILE_DELETED`;
  - delete when `deleteObject` resolves for a missing object → DELETED (Review Focus 4);
  - delete when `deleteObject` throws `StorageDeleteError` → the flag is not updated and the error propagates.
- [ ] **Step 2:** Run → FAIL; implement; run → PASS.
- [ ] **Step 3: Failing route tests:**
  - keep as a coordinator → 401; keep success → 200;
  - delete with a wrong password → 401 and `deleteObject` not called (Review Focus 1);
  - delete with `StorageDeleteError` → 502 with its message;
  - delete success → 200;
  - an unknown id → 404.
- [ ] **Step 4:** Implement the routes, the cron hook (a `scheduledNotifications.test.ts` case: `runRetentionScan` is called with `now`, and its rejection lands in `errors`) and the UI section.
- [ ] **Step 5:** Full gate: `npx tsc --noEmit && npx next lint && npx jest && npx next build` → green. Commit with `"Add quarterly file-retention flagging with admin review before deletion"`.

---

## Acceptance

- The four spec items work on the dev DB after Jay approves applying migration 007 (`prisma db push` + run `007_compliance.sql`).
- The verification statements in 007 fail on `UPDATE` and `DELETE`, and `INSERT` still works.
- Manual check:
  - each of the 6 exports downloads and opens in Excel, needs the password, and appears in "Recent exports";
  - a student requests their data and the Super Admin sees it, exports it and marks it fulfilled;
  - the retention section shows its empty state.
- tsc, lint, jest, build and CI green. Vault MOC updated after merge.

## Deferred (documented, not built)

- A dedicated least-privilege DB role for the app (Phase 5 hosting).
- MFA. Password re-entry satisfies NFR-SEC-05, as in Workstream E.
- MOA file retention: company-level files with no semester.
- Anonymization tooling (NFR-DP-06 asks only to flag for review).
- Emailing the DSAR file to the requester. The admin hands it over; email attachments of personal data are a separate privacy decision.
