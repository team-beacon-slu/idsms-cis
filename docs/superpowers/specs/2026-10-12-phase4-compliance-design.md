# Phase 4 Workstream G — Compliance (design)

Date: 2026-10-12 · Status: approved in chat by Jay (2026-10-12, "sure continue")
Roadmap row G: Super Admin Export Center, DSAR, quarterly file-retention flagging, append-only `audit_logs`.
PRD: NFR-DP-05..08, NFR-SEC-05, NFR-SEC-07, NFR-SEC-10; screen spec "Export Center (`/admin/export-center`)"; acceptance "A student can trigger a DSAR from Settings, which logs a ticket and notifies the Super Admin."

## Intent

Make IDSMS defensible on data privacy (RA 10173) before the pilot. A Super Admin can export institutional data in bulk only after re-entering their password, and every export is audited. Any user can ask for their own data and gets it within 15 days. Old files are flagged for a human decision, never auto-deleted. The audit trail can't be edited even by the app's own database connection.

Success: the four items below work end to end on the dev DB; tsc, lint, jest, build and CI are green; the manual check passes.

## Finding that shapes item 1

The app connects to Postgres as `postgres`. That role owns `audit_logs` and has `BYPASSRLS`. Migration 001's insert-only RLS policies never apply to it, so today the app can `UPDATE` or `DELETE` audit rows. NFR-SEC-10 requires blocking that "by any role, including the service role".

## 1. Audit-log immutability (NFR-SEC-10)

- New manual migration `prisma/migrations_manual/007_compliance.sql`:
  - a `BEFORE UPDATE OR DELETE ... FOR EACH ROW` trigger on `audit_logs`, which calls a function that raises `audit_logs is append-only (NFR-SEC-10)`;
  - a `BEFORE TRUNCATE ... FOR EACH STATEMENT` trigger, also raising.
- Triggers fire for every role, including owners and `BYPASSRLS` roles. Only `session_replication_role = replica` or `ALTER TABLE ... DISABLE TRIGGER` bypasses them, and both need deliberate DDL-level action.
- The existing RLS policies stay as defense in depth. Comments in `schema.prisma` and migration 001 point to 007.
- Verification in the PR: inside a transaction, `UPDATE audit_logs ...` and `DELETE FROM audit_logs ...` both fail with the trigger message; `INSERT` still works.
- Rejected alternative: a separate least-privilege DB role for the app. It's more correct, but it changes connection strings and pooling, so it's deferred to Phase 5 hosting.

## 2. Export Center (`/admin/export-center`, SUPER_ADMIN only)

- Page: `requireUserPage()` + Super Admin, otherwise `redirect("/")`. A banner says every export needs the admin's password and is recorded in the audit log. The page also holds the six export cards, the DSAR queue (item 3), the retention review list (item 4), and a "Recent exports" table of the latest 20 `DATA_EXPORTED` audit rows.
- One route: `POST /api/admin/exports/[kind]` with body `{ password, semesterId? }`.
  - Order of checks: `requireUserApi()` + `requireRole([SUPER_ADMIN])`, then password re-auth with `verifyCredentials`, the same as the bulk-endorsement route (401 "Password confirmation failed"; 423 with the time when locked).
  - It then builds the workbook with `toSheetRows` / `buildWorkbook` / `xlsxResponse`, where `what` = `export-<kind>`.
  - It writes `logEvent({ action: "DATA_EXPORTED", entityType: "Export", detail: { kind, semesterId, rowCount } })`.
  - An unknown `kind` returns 404.
- The six kinds, each optionally scoped to a semester (default: all semesters, archived included):
  1. `users`: email, role, active, locked-until, created, last-updated. Never `hashedPassword`.
  2. `students`: the compliance master list. It reuses `getComplianceRows` with the department scope for the chosen semester, or all semesters.
  3. `attendance`: one row per daily report entry, with student number, date, status, time in/out and hours.
  4. `reports`: one row per weekly report (student number, week, status, hours, submitted-at, reference code), plus one row per generated MONTHLY_REPORT document (period, status, reference code). There is no monthly-report table; monthly reports exist only as `GeneratedDocument` rows. It excludes narrative text, keeping the bulk file lean; the full content stays in the app and in DSAR.
  5. `checklist`: one row per checklist item, with student number, requirement, status, reviewer and reviewed-at. No file paths.
  6. `companies`: company, address, modality, supervisor, MOA status, MOA expiry.
- Client cards: each card opens an inline password field (not `window.confirm`), POSTs, and downloads the blob through an object URL. Failures show `toast.error(body.error)`.

## 3. Data subject access request (NFR-DP-07)

- New table `data_requests` (Prisma model `DataRequest`):
  - `id`, `userId`, `status` (`OPEN | FULFILLED`), `requestedAt`, `dueAt` (= `requestedAt` + 15 days), `fulfilledAt?`, `fulfilledBy?`;
  - `@@index([status, dueAt])`.
- `POST /api/data-requests` (any signed-in user):
  - It creates an OPEN ticket. If the user already has an OPEN ticket it returns 409 "You already have an open request (due <date>)".
  - In one transaction it writes `logEvent({ action: "DSAR_REQUESTED", entityType: "DataRequest" })`.
  - After commit it calls `notify` to every active Super Admin with the new trigger `DSAR_REQUESTED` and link `/admin/export-center#data-requests`.
- Profile page: a "Your data" card with the "Request my data" button. It shows the current open ticket's due date, or the date of the last fulfilled one.
- Export Center queue: lists OPEN tickets (requester email, requested, due, days left; overdue shown in red with an "Overdue" label) and the last 10 FULFILLED tickets.
  - **Generate export:** `POST /api/admin/data-requests/[id]/export` with `{ password }`, re-auth as in item 2. It streams a multi-sheet workbook of the requester's personal data, one sheet per area. Every cell goes through `toSheetRows`. It writes `DSAR_EXPORTED`.
    - The sheets are Account, Student profile, Checklist, Work plan, Attendance, Weekly reports, Deviation reports, Generated documents (including monthly report PDFs), Notifications, and Activity (the user's own audit rows).
    - Only the sheets that apply to the user's role are included, and an empty area gets a header-only sheet.
  - **Mark fulfilled:** `POST /api/admin/data-requests/[id]/fulfil`. It sets FULFILLED, `fulfilledAt` and `fulfilledBy`, writes `DSAR_FULFILLED`, and notifies the requester. Fulfilling a ticket that isn't OPEN returns 409.
  - Format decision: XLSX, not the PRD's "CSV/PDF". One person's data spans ten tables, and the formula-safe Excel path already exists.
- Daily cron: `runDailyNotifications` gains a DSAR step. For each OPEN ticket with `dueAt` 3 days away or less, or already overdue, it notifies the Super Admins with trigger `DSAR_DUE`, deduped per ticket per day (`dsar:<id>:<YYYY-MM-DD>`).

## 4. File retention (NFR-DP-08, NFR-DP-06)

- New table `retention_flags` (Prisma model `RetentionFlag`):
  - `id`, `bucket`, `objectPath`, `sourceType` (`CHECKLIST | DEVIATION_PROOF | GENERATED_DOCUMENT`), `sourceId`, `studentProfileId`, `semesterEndDate`, `flaggedAt`, `status` (`PENDING | KEPT | DELETED`), `reviewedAt?`, `reviewedBy?`;
  - `@@unique([sourceType, sourceId])`.
- Rule: a stored file is due for review when its student's semester `endDate` is more than 3 years in the past. Sources:
  - `PreDeploymentChecklistItem.filePath` (checklist bucket)
  - `DeviationReport.proofUrl` (its bucket)
  - `GeneratedDocument.fileUrl` (generated-documents bucket)
  - MOA files are company-level with no semester, so they're out of scope.
- Quarterly gate: the daily cron calls `runRetentionScan(now)`. It runs only when SystemConfig `retention:last_scan_at` is missing or at least 90 days old, then records the new timestamp. The scan upserts PENDING flags. A KEPT flag is never reopened. It flags only and **never deletes**. It notifies Super Admins (`RETENTION_REVIEW`) when it creates any new flags.
- Export Center "Files due for review": PENDING flags with student number, source, semester end and flagged date. Two actions:
  - **Keep:** `POST /api/admin/retention/[id]/keep`. Sets KEPT and writes `RETENTION_KEPT`.
  - **Delete permanently:** `POST /api/admin/retention/[id]/delete` with `{ password }` re-auth. Removes the storage object through a new `deleteObject(bucket, path)` in `storage.ts` (portability rule: storage only via `storage.ts`). It nulls the source row's path column, sets the flag to DELETED, and writes `FILE_DELETED` with `{ bucket, objectPath, sourceType, sourceId }`. Database records are never deleted. A missing object is treated as already deleted.
- Today no file qualifies (all data is from 2026). Tests use fixtures.

## Schema and rollout

- `schema.prisma`: models `DataRequest` and `RetentionFlag` and enums `DataRequestStatus`, `RetentionStatus`, `RetentionSource`.
- `007_compliance.sql`: the audit triggers, plus `CREATE TABLE IF NOT EXISTS` for both tables. The repo rule is `prisma db push` + manual SQL; never `migrate dev`. RLS is enabled with no policies (default-deny) on both new tables, matching NFR-SEC-11.
- Applying 007 to the shared dev DB is a separate step that needs Jay's OK.
- No new dependencies, no lockfile change. D2 holds: nothing in G accepts uploads.

## Error handling

- All routes go through `handleApiError`.
- Re-auth failures: 401, or 423 for a locked account.
- State conflicts: 409 (open DSAR exists; ticket or flag not in the expected state).
- Unknown export kind, ticket or flag: 404.
- Retention delete: if the storage removal fails with anything but "not found", the flag stays PENDING and the route returns 502 with the message.
- Notifications never fail the action (`notify` never throws).

## Testing

TDD per task. Key cases:

- **Export Center:**
  - non-Super-Admin gets 401;
  - a wrong password gets 401 and runs no query;
  - no export contains `hashedPassword`;
  - formula text exports as text;
  - `DATA_EXPORTED` is logged with the row count.
- **DSAR:**
  - a second open request gets 409;
  - `dueAt` is +15 days;
  - Super Admins are notified;
  - the export contains only the requester's rows;
  - fulfil is idempotent-safe (409 when not OPEN);
  - the cron reminds at 3 days or less and when overdue, deduped.
- **Retention:**
  - the quarterly gate skips a scan within 90 days;
  - the 3-years-after-semester-end boundary is right;
  - KEPT flags are not reopened;
  - the scan never calls `deleteObject`;
  - delete needs the password, nulls the path, and logs.
- **Audit:** a SQL verification run against the dev DB after applying 007. The trigger is SQL, so this is not a Jest test.

## Out of scope

- A dedicated DB role (Phase 5).
- MFA (password re-entry satisfies NFR-SEC-05, as in E).
- MOA file retention.
- Anonymization tooling (NFR-DP-06 is "flag for review").
- Emailing DSAR exports (the admin hands over the file).
