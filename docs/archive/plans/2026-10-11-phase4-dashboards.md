# Phase 4 Workstream F — Role Dashboards & Excel Exports Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Finish FR-DB-01..08: every role dashboard shows its PRD fields, faculty/coordinator/admin data downloads as Excel, and Super Admin can activate and archive semesters without losing history.

**Architecture:** One tested read-model service (`complianceService.ts`) computes a per-student compliance row in a single bounded query (no N+1), and every dashboard table and Excel export reads from it, so the screen and the spreadsheet can never disagree. Excel files are built server-side with the `xlsx` package already used for imports, through one helper. Semester lifecycle lives in `semesterService.ts`; archiving only sets `archived_at` — nothing is deleted (FR-DB-07).

**Tech Stack:** Next.js 14 App Router (server components + route handlers), Prisma 6, `xlsx` (SheetJS 0.20.3, already a dependency), zod, Jest with `@/testUtils/prismaMock`, shadcn/ui (`Card`, `Table`, `Badge`), `StatCard`.

**Spec:** `PRD.md` Module 10 (FR-DB-01..08, lines 307–320) and UI notes (lines 703–721); roadmap `docs/superpowers/plans/2026-10-11-phase4-roadmap.md` row F and acceptance line 135.

## Global Constraints

- No schema migration: `semesters.is_active` / `archived_at` and `audit_logs` already exist.
- Portability rules (roadmap §5): no Supabase-only features; files are streamed from the route, never stored (no Storage writes in F).
- D2: nothing in F accepts uploads.
- AI flags (FR-DB-03) come from Workstream D, which has not shipped: render the column as "—" with `title="AI review not enabled"`; do not add a schema field.
- Every role check uses `requireUserApi()` + `requireRole()` in routes and `requireUserPage()` + `redirect("/")` in pages.
- Faculty only ever see students in their `(classGroupId, semesterId)` pairs from `facultyClassGroup` — zero pairs means zero students (never an empty `OR: []`).
- Every mutation (semester create/activate/archive) calls `logEvent` inside the same transaction.
- Excel filenames: `idsms-<what>-<YYYY-MM-DD>.xlsx`, Manila date; content type `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`.
- No Claude/Anthropic attribution in commits or PR text.

## Review Focus

1. **No active semester** (fresh install or between terms) — coordinator dashboard and exports must show an empty state that says "No active semester — activate one on the Semesters page", not crash or show every semester mixed together. Test in Task 1 (`resolveDepartmentSemester`) and Task 3.
2. **Archived semester viewed later** — picking an archived semester must still show its full rows (retention, FR-DB-07). Test in Task 1 (no `archivedAt` filter in the row query) and Task 5 (archive never deletes).
3. **Spreadsheet formula injection** — a student name or company like `=HYPERLINK(...)` must export as text. Test in Task 1 (`toSheetRows` prefixes `'`).
4. **Student with no reports / no checklist rows** — row shows 0 hours, `0/9`, `NOT_STARTED`, never `NaN%`. Test in Task 1.
5. **Activating while another is active** — exactly one active semester afterwards, even if two admins click at once (single transaction: deactivate all, then activate one). Test in Task 5.

---

## File map

| File                                                                                                         | Responsibility                                                                          |
| ------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------- |
| `src/lib/services/complianceService.ts` (+test)                                                              | Per-student compliance rows, KPI counts, program summaries, weekly summary rows         |
| `src/lib/utils/excelExport.ts` (+test)                                                                       | `buildWorkbook`, `toSheetRows` (formula-safe), `xlsxResponse`                           |
| `src/lib/services/semesterService.ts` (+test)                                                                | list/create/activate/archive + `getActiveSemester`                                      |
| `src/app/api/compliance/export/route.ts` (+test)                                                             | Faculty + staff compliance Excel                                                        |
| `src/app/api/compliance/weekly-summary/route.ts` (+test)                                                     | FR-DB-06 weekly summary Excel                                                           |
| `src/app/api/semesters/route.ts`, `[semesterId]/activate/route.ts`, `[semesterId]/archive/route.ts` (+tests) | Semester API (Super Admin)                                                              |
| `src/app/api/audit-logs/export/route.ts` (+test)                                                             | Audit log Excel (Super Admin)                                                           |
| `src/components/compliance-table.tsx`                                                                        | Shared table: progress bar, docs, WR status, AI flag, actions                           |
| `src/app/(dashboard)/page.tsx`                                                                               | Faculty KPI row + table; coordinator program cards, MOA banner, filters; student tables |
| `src/app/(dashboard)/semesters/page.tsx` + `semester-actions.tsx` + `create-semester-form.tsx`               | Super Admin semester management                                                         |
| `src/app/(dashboard)/audit-log/page.tsx`                                                                     | Super Admin audit log with filters                                                      |
| `src/app/(dashboard)/users/required-hours-form.tsx`                                                          | Super Admin required-hours form (API already exists)                                    |
| `src/app/(dashboard)/dashboard-nav.tsx`                                                                      | Nav links for Semesters and Audit log (Super Admin)                                     |

---

### Task 1: Compliance read model + Excel helper

**Files:**

- Create: `src/lib/services/complianceService.ts`, `src/lib/services/complianceService.test.ts`
- Create: `src/lib/utils/excelExport.ts`, `src/lib/utils/excelExport.test.ts`

**Interfaces:**

- Consumes: `prisma`, `isAwaitingReview` (`weeklyReportService`), `getWeekStartMonday`, `addDays`, `toDateKey` (`@/lib/utils/reportDeadline`).
- Produces:

```ts
export type ReportState =
  "NOT_STARTED" | "DRAFT" | "SUBMITTED" | "RETURNED" | "APPROVED" | "REGARDED" | "DISREGARDED";
export type ComplianceStatus = "NOT_DEPLOYED" | "NEEDS_ATTENTION" | "ON_TRACK" | "COMPLETED";
export type ComplianceScope =
  | { kind: "faculty"; facultyId: string }
  | { kind: "department"; semesterId: string; program?: Program };
export interface ComplianceRow {
  studentProfileId: string;
  studentNumber: string;
  fullName: string | null;
  email: string;
  program: Program;
  classGroupId: string;
  classGroup: string;
  company: string | null;
  confirmedHours: number;
  requiredHours: number;
  hoursPercent: number; // 0–100, integer
  checklistApproved: number;
  checklistTotal: number;
  dueWeekStart: string; // "YYYY-MM-DD" of the week whose report is due now
  dueWeekState: ReportState; // state of that week's report
  awaitingReview: number; // reports of any week waiting on faculty
  status: ComplianceStatus;
}
export function reportState(
  r: { status: WeeklyReportStatus; revisionHistory: unknown } | undefined
): ReportState;
export async function getComplianceRows(
  scope: ComplianceScope,
  now?: Date
): Promise<ComplianceRow[]>;
export function summarize(rows: ComplianceRow[]): {
  total: number;
  submittedThisWeek: number;
  pendingReview: number;
  notYetSubmitted: number;
};
export function summarizeByProgram(rows: ComplianceRow[]): Array<{
  program: Program;
  students: number;
  deployed: number;
  avgHoursPercent: number;
  checklistComplete: number;
  needsAttention: number;
}>;
export async function resolveDepartmentSemester(
  semesterId?: string | null
): Promise<{ id: string; name: string; archivedAt: Date | null } | null>;
// excelExport.ts
export function toSheetRows<T extends Record<string, unknown>>(
  rows: T[],
  columns: Array<{ key: keyof T; header: string }>
): (string | number)[][];
export function buildWorkbook(sheets: Array<{ name: string; rows: (string | number)[][] }>): Buffer;
export function xlsxResponse(buffer: Buffer, what: string, now?: Date): Response;
```

Rules (put them in the code as comments):

- **Due week** = the Monday–Sunday week before the current Manila week: `addDays(getWeekStartMonday(now), -7)`. That report is due Tuesday of the current week.
- `reportState`: `undefined` → `NOT_STARTED`; `APPROVED/REGARDED/DISREGARDED/RETURNED` map 1:1; `PENDING` + `isAwaitingReview` → `SUBMITTED`, else `DRAFT`.
- Confirmed hours = sum of `dailyEntries.actualHours` over `APPROVED` + `REGARDED` reports (same rule as `calculateRenderedHours`), rounded to 2 dp. `hoursPercent = requiredHours > 0 ? min(100, round(confirmed/required*100)) : 0`.
- `status`: no `companyId` → `NOT_DEPLOYED`; `confirmed >= required && required > 0` → `COMPLETED`; `checklistApproved < 9` or `dueWeekState ∈ {NOT_STARTED, DRAFT, RETURNED}` → `NEEDS_ATTENTION`; else `ON_TRACK`.
- Query: one `prisma.studentProfile.findMany` with `deletedAt: null`, scope filter, `include` user email, classGroup name, company name, `checklistItems: { select: { status } }`, `weeklyReports: { select: { weekStart, status, revisionHistory, dailyEntries: { select: { actualHours } } } }`, ordered by `studentNumber`. Faculty scope first loads `facultyClassGroup` pairs and returns `[]` without querying students when there are none.
- `summarize`: `submittedThisWeek` counts rows whose `dueWeekState` is SUBMITTED/APPROVED/REGARDED/DISREGARDED; `pendingReview` sums `awaitingReview`; `notYetSubmitted` counts deployed rows whose `dueWeekState` is NOT_STARTED/DRAFT/RETURNED.
- `resolveDepartmentSemester(id)`: with an id → that semester (archived allowed); without → the `isActive` one; none → `null`.
- `toSheetRows`: header row first; strings starting with `= + - @` (or tab/CR) get a leading `'`; `null/undefined` → `""`.
- `xlsxResponse`: filename `idsms-${what}-${toDateKey(manilaToday)}.xlsx`, `Content-Disposition: attachment`, `Cache-Control: no-store`.

- [ ] **Step 1: Write failing tests** in `complianceService.test.ts` (prismaMock; `NOW = new Date("2026-10-12T00:00:00Z")` → due week `2026-10-05`):
  - `reportState` table test for all 7 states (`PENDING` with `[{type:"SUBMITTED"}]` → SUBMITTED; with `[]` → DRAFT).
  - A deployed student with an APPROVED 2026-09-28 report (8 + 8 hours), a SUBMITTED 2026-10-05 report and 9/9 approved checklist → `confirmedHours 16`, `dueWeekState "SUBMITTED"`, `awaitingReview 1`, `status "ON_TRACK"`, `hoursPercent` = `round(16/486*100)`.
  - Student with no reports, no checklist rows, no company → `confirmedHours 0`, `checklistTotal 0`, `hoursPercent 0`, `dueWeekState "NOT_STARTED"`, `status "NOT_DEPLOYED"` (Review Focus 4).
  - Faculty with zero `facultyClassGroup` rows → `[]` and `studentProfile.findMany` not called.
  - Department scope passes `{ semesterId, program }` and **no** `archivedAt`/`isActive` condition into `where` (Review Focus 2).
  - `summarize` and `summarizeByProgram` on three hand-built rows.
  - `resolveDepartmentSemester()` with no active semester → `null` (Review Focus 1); with an archived id → returns it.
- [ ] **Step 2:** In `excelExport.test.ts`: `toSheetRows` turns `"=HYPERLINK(\"x\")"` into `"'=HYPERLINK(\"x\")"`, keeps numbers as numbers, `null` → `""` (Review Focus 3); `buildWorkbook` output read back with `XLSX.read(buf)` has the sheet name and header row; `xlsxResponse` sets the three headers and the Manila-dated filename (`2026-10-11T17:00:00Z` → `2026-10-12`).
- [ ] **Step 3:** Run `npx jest src/lib/services/complianceService src/lib/utils/excelExport` → FAIL (modules missing).
- [ ] **Step 4:** Implement both files per the rules above. `buildWorkbook`: `XLSX.utils.book_new()`, `XLSX.utils.aoa_to_sheet(rows)`, `XLSX.utils.book_append_sheet(wb, ws, name.slice(0, 31))`, `Buffer.from(XLSX.write(wb, { type: "buffer", bookType: "xlsx" }))`.
- [ ] **Step 5:** Run the same command → PASS; then `npx tsc --noEmit`.
- [ ] **Step 6: Commit** — `git add src/lib/services/complianceService.* src/lib/utils/excelExport.*` → `git commit -m "Add compliance read model and formula-safe Excel export helper"`.

### Task 2: Faculty dashboard (FR-DB-03) + compliance export route

**Files:**

- Create: `src/components/compliance-table.tsx`
- Create: `src/app/api/compliance/export/route.ts`, `route.test.ts`
- Modify: `src/app/(dashboard)/page.tsx` (faculty branch, lines ~156–183)

**Interfaces:**

- Consumes: `getComplianceRows`, `summarize`, `resolveDepartmentSemester`, `toSheetRows`, `buildWorkbook`, `xlsxResponse` (Task 1); `BulkEndorsementButton` from `src/app/(dashboard)/my-students/bulk-endorsement-button.tsx`.
- Produces: `GET /api/compliance/export?semesterId=&program=&status=` — faculty get their own scope (query params other than `status` ignored); `DEPARTMENT_COORDINATOR`/`SUPER_ADMIN` get department scope via `resolveDepartmentSemester(semesterId)` (404 JSON `{ error: "No active semester" }` when null); students → 403. `<ComplianceTable rows={ComplianceRow[]} showProgram?: boolean />`.
- Export columns (in order): Student number, Name, Email, Program, Class group, Company, Confirmed hours, Required hours, Hours %, Checklist approved, Due-week report, Awaiting review, Status. Sheet name `Compliance`. `what` = `compliance`.

- [ ] **Step 1: Failing route tests** (mock `complianceService` + `@/lib/auth/session` like `src/app/api/config/notifications/route.test.ts`): faculty → `getComplianceRows({kind:"faculty", facultyId})` and 200 with xlsx content type; coordinator with `?program=BSIT&status=NEEDS_ATTENTION` → department scope with `program: "BSIT"` and only NEEDS_ATTENTION rows in the sheet (read back with `XLSX.read`); coordinator with no active semester → 404; student → 403; `?program=XYZ` → 400.
- [ ] **Step 2:** Run `npx jest src/app/api/compliance/export` → FAIL.
- [ ] **Step 3:** Implement the route (`export const runtime = "nodejs"`), validating `program` with `z.nativeEnum(Program).optional()` and `status` with `z.enum([...ComplianceStatus values]).optional()`.
- [ ] **Step 4:** Run → PASS.
- [ ] **Step 5:** Build `compliance-table.tsx` (server component): columns Student (name or student number + email), Program (if `showProgram`), Hours (`confirmed / required` with a progress bar: `<div role="progressbar" aria-valuenow={hoursPercent} aria-valuemin={0} aria-valuemax={100} aria-label="Hours progress">`), Docs (`approved/9`), Weekly report (`StatusBadge` of `dueWeekState`, plus "N to review" when `awaitingReview > 0`), AI flag (`—`, `title="AI review not enabled"`), Status badge, Actions (links to `/students/{id}/weekly-reports` and `/students/{id}/checklist`). Wrap in `overflow-x-auto`; empty state row "No students yet".
- [ ] **Step 6:** Replace the faculty branch of `page.tsx`: KPI row of four `StatCard`s from `summarize(rows)` (Total students, Submitted this week, Pending review — amber when > 0, Not yet submitted — red when > 0), then a Card "My students" with an "Export to Excel" link button (`<a href="/api/compliance/export" download>`), the existing `BulkEndorsementButton` per class group, and `<ComplianceTable rows={rows} />`.
- [ ] **Step 7:** `npx tsc --noEmit && npx next lint && npx jest` → all green.
- [ ] **Step 8: Commit** — `git commit -m "Add faculty compliance dashboard with progress, weekly status and Excel export"`.

### Task 3: Coordinator dashboard (FR-DB-04)

**Files:**

- Create: `src/app/(dashboard)/compliance-filters.tsx` (client; `<form method="get">` with `semesterId`, `program`, `status` selects, no JS required)
- Modify: `src/app/(dashboard)/page.tsx` (staff branch, lines ~124–155; page accepts `searchParams`)

**Interfaces:**

- Consumes: `resolveDepartmentSemester`, `getComplianceRows`, `summarizeByProgram`, `ComplianceTable`, `getExpiringMoaRecords(30)`, `semesterService.listSemesters` (Task 5 — if Task 5 is not merged yet, read `prisma.semester.findMany({ orderBy: { startDate: "desc" } })` directly and switch to `listSemesters` in Task 5).
- Produces: dashboard URL params `?semesterId=&program=&status=`; Export link `/api/compliance/export?<same params>`.

- [ ] **Step 1:** Write a test for a small pure helper in `complianceService.ts`: `filterRows(rows, { status?: ComplianceStatus })` (program is filtered in the query) — FAIL, implement, PASS.
- [ ] **Step 2:** Staff branch: resolve semester; if `null`, render an empty-state Card "No active semester — activate one on the Semesters page" with a link to `/semesters` for Super Admin (Review Focus 1) and skip the rest.
- [ ] **Step 3:** MOA banner: when `expiringMoas.length > 0`, an amber `role="alert"` Card above the cards: "N MOA(s) expire within 30 days" linking to `/companies`.
- [ ] **Step 4:** One `StatCard` row per program from `summarizeByProgram` (Students, Deployed, Avg hours %, Needs attention), then keep the existing user/company cards in a second row.
- [ ] **Step 5:** "All students compliance" Card: `<ComplianceFilters>` (selected values from `searchParams`), an archived-semester note when `archivedAt` is set ("Archived semester — read-only history"), Export link carrying the same params, and `<ComplianceTable rows={filterRows(rows, …)} showProgram />`.
- [ ] **Step 6:** `npx tsc --noEmit && npx next lint && npx jest` → green; `npx next build` compiles.
- [ ] **Step 7: Commit** — `git commit -m "Add coordinator compliance dashboard with program cards, MOA alert and filters"`.

### Task 4: Student dashboard tables (FR-DB-02)

**Files:**

- Modify: `src/app/(dashboard)/page.tsx` (student branch, after the StatCard grid ~line 338)
- Test: `src/lib/services/complianceService.test.ts` (new helper)

**Interfaces:**

- Consumes: `getChecklistProgress(studentProfileId).items` (`requirementType`, `status`), `prisma.weeklyReport.findMany`, `reportState` (Task 1).
- Produces: `export function weeklyHistory(reports: Array<{ id: string; weekStart: Date; weekEnd: Date; status: WeeklyReportStatus; revisionHistory: unknown }>): Array<{ id: string; week: string; state: ReportState; referenceCode: string | null }>` in `complianceService.ts`, newest first, `week` formatted `"Oct 5 – Oct 11, 2026"` (UTC getters — week dates are stored as UTC midnight).
- Weekly reports have **no** reference-code column: the code lives on the last `type: "SUBMITTED"` entry of `revisionHistory` (`WeeklyReportSubmissionEntry.referenceCode` in `weeklyReportService.ts`). Read it with the existing `getWeeklyReportHistory(revisionHistory)` helper; `null` when never submitted.

- [ ] **Step 1:** Failing test for `weeklyHistory` (ordering, `DRAFT` vs `SUBMITTED`, date label, reference code taken from the latest SUBMITTED entry when there were two submissions).
- [ ] **Step 2:** Run → FAIL; implement; run → PASS.
- [ ] **Step 3:** Add two Cards: "Pre-deployment requirements" (table: requirement — humanised `requirementType`; status — `StatusBadge`) and "Weekly report history" (table: week, status badge, reference code, link to `/weekly-reports`), each with an empty state.
- [ ] **Step 4:** `npx tsc --noEmit && npx next lint && npx jest` → green.
- [ ] **Step 5: Commit** — `git commit -m "Show per-requirement status and weekly report history on the student dashboard"`.

### Task 5: Semester management (FR-DB-05, FR-DB-07, FR-DB-08)

**Files:**

- Create: `src/lib/services/semesterService.ts` (+test)
- Create: `src/app/api/semesters/route.ts` (GET list, POST create), `src/app/api/semesters/[semesterId]/activate/route.ts` (POST), `src/app/api/semesters/[semesterId]/archive/route.ts` (POST) (+ one `route.test.ts` per folder)
- Create: `src/app/(dashboard)/semesters/page.tsx`, `semester-actions.tsx`, `create-semester-form.tsx`
- Modify: `src/lib/utils/apiError.ts` (map `SemesterStateError` → 409), `src/lib/validators/` (new `semester.ts`), `src/app/(dashboard)/dashboard-nav.tsx`

**Interfaces:**

- Produces:

```ts
export class SemesterStateError extends Error {}
export const createSemesterSchema: z.ZodType<{
  name: string;
  academicYear: string;
  startDate: Date;
  endDate: Date;
}>; // name 1–80, academicYear /^\d{4}-\d{4}$/, startDate < endDate
export async function listSemesters(): Promise<
  Array<{
    id: string;
    name: string;
    academicYear: string;
    startDate: Date;
    endDate: Date;
    isActive: boolean;
    archivedAt: Date | null;
    _count: { students: number };
  }>
>;
export async function createSemester(input: unknown, actingUserId: string): Promise<{ id: string }>;
export async function activateSemester(id: string, actingUserId: string): Promise<void>;
export async function archiveSemester(id: string, actingUserId: string): Promise<void>;
```

- Rules: activate — not found → `SemesterStateError("Semester not found")`; archived → `SemesterStateError("Archived semesters can't be activated")`; in one `prisma.$transaction`: `semester.updateMany({ where: { isActive: true }, data: { isActive: false } })` then `semester.update({ id }, { isActive: true })`, then `logEvent({ action: "SEMESTER_ACTIVATED", entityType: "Semester", entityId: id })` with `tx`. Archive — already archived → error; sets `{ archivedAt: new Date(), isActive: false }`, `logEvent("SEMESTER_ARCHIVED")`; **never** calls any `delete`/`deleteMany`. Create — `logEvent("SEMESTER_CREATED")`.
- All routes: `SUPER_ADMIN` only (GET also allows `DEPARTMENT_COORDINATOR`).

- [ ] **Step 1: Failing service tests:** activate runs `updateMany` before `update` inside `$transaction` and logs (Review Focus 5); activating an archived semester throws `SemesterStateError`; archive sets `archivedAt` + `isActive:false`, logs, and `prismaMock.semester.delete`/`deleteMany` and `prismaMock.studentProfile.deleteMany` are never called (Review Focus 2); create rejects `startDate >= endDate` and bad `academicYear`.
- [ ] **Step 2:** Run → FAIL; implement; run → PASS. (`prismaMock.$transaction.mockImplementation((fn) => fn(prismaMock))` as in existing service tests.)
- [ ] **Step 3: Failing route tests:** coordinator POST activate → 401 (`requireRole` throws `UnauthorizedError`, which `handleApiError` maps to 401); Super Admin → 200; `SemesterStateError` → 409 with its message.
- [ ] **Step 4:** Implement routes + `apiError.ts` mapping; run → PASS.
- [ ] **Step 5:** Page `/semesters` (Super Admin only; coordinator read-only view without buttons): table Name, Academic year, Dates, Students, State badge (Active / Archived / Inactive), actions (`semester-actions.tsx` client: "Activate" and "Archive" buttons; Archive asks for confirmation with an inline confirm step — not `window.confirm` — explaining "Archiving keeps all records and hides the semester from default views"); `create-semester-form.tsx` above the table. `router.refresh()` + `toast` on success, `toast.error(body.error)` on failure.
- [ ] **Step 6:** Add "Semesters" to `dashboard-nav.tsx` for `SUPER_ADMIN` and `DEPARTMENT_COORDINATOR`.
- [ ] **Step 7:** `npx tsc --noEmit && npx next lint && npx jest` → green.
- [ ] **Step 8: Commit** — `git commit -m "Add semester management with single-active activation and non-destructive archiving"`.

### Task 6: Super Admin — required hours and audit log (FR-DB-05)

**Files:**

- Create: `src/app/(dashboard)/users/required-hours-form.tsx` (client; one row per `Program` with a number input, PATCH `/api/config/required-hours`)
- Modify: `src/app/(dashboard)/users/page.tsx` (Super Admin card under Notification settings; initial values via `getRequiredHoursConfig(program)` for each program)
- Create: `src/lib/services/auditLogQuery.ts` (+test), `src/app/api/audit-logs/export/route.ts` (+test), `src/app/(dashboard)/audit-log/page.tsx`
- Modify: `dashboard-nav.tsx` ("Audit log", Super Admin only)

**Interfaces:**

- Produces:

```ts
export const auditLogFilterSchema = z.object({
  action: z.string().max(80).optional(),
  entityType: z.string().max(80).optional(),
  email: z.string().max(254).optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  page: z.coerce.number().int().min(1).default(1),
});
export async function queryAuditLogs(
  filter: z.infer<typeof auditLogFilterSchema>,
  opts?: { pageSize?: number; max?: number }
): Promise<{
  rows: Array<{
    id: string;
    timestamp: Date;
    action: string;
    entityType: string;
    entityId: string | null;
    email: string | null;
    ipAddress: string | null;
    detail: unknown;
  }>;
  total: number;
}>;
```

- `to` is inclusive of the whole day (Manila): `lt: addDays(to, 1)`. Page size 50 for the page; export uses `max: 10_000` and reports truncation in a second sheet `Notes` when `total > 10_000`.
- Export columns: Timestamp (Manila, `YYYY-MM-DD HH:mm`), User email, Action, Entity type, Entity id, IP address, Detail (JSON string, cut to 2,000 chars). `what` = `audit-log`.

- [ ] **Step 1: Failing tests** for `queryAuditLogs`: filters build the expected `where` (`action` exact, `entityType` exact, `user: { email: { contains, mode: "insensitive" } }`, `timestamp: { gte: from, lt: to+1d }`), ordered `timestamp desc`, `skip/take` from page; export route: Super Admin 200 xlsx, coordinator 401, bad date → 400; detail JSON with `=cmd` is exported as text (relies on `toSheetRows`).
- [ ] **Step 2:** Run → FAIL; implement; run → PASS.
- [ ] **Step 3:** `/audit-log` page: GET form (action, entity type, email, from, to), table with the export columns, Prev/Next links, "Export to Excel" link carrying the filters.
- [ ] **Step 4:** Required-hours form: validates positive whole numbers client-side, mirroring `requiredHoursConfigSchema` (`{ program: z.enum(Program), hours: z.number().int().positive() }` in `src/lib/validators/attendance.ts`); one PATCH per changed program; toast per program saved, `toast.error(body.error)` on failure.
- [ ] **Step 5:** `npx tsc --noEmit && npx next lint && npx jest` → green.
- [ ] **Step 6: Commit** — `git commit -m "Add Super Admin required-hours form and filterable audit log with Excel export"`.

### Task 7: Weekly summary Excel (FR-DB-06)

**Files:**

- Modify: `src/lib/services/complianceService.ts` (+test)
- Create: `src/app/api/compliance/weekly-summary/route.ts` (+test)
- Modify: faculty and coordinator Cards in `page.tsx` (second link "Weekly summary")

**Interfaces:**

- Produces: `export async function getWeeklySummaryRows(scope: ComplianceScope, weekStart: Date): Promise<Array<{ studentNumber: string; fullName: string | null; program: Program; classGroup: string; state: ReportState; hours: number; submittedAt: string | null; late: boolean }>>` — `hours` = that week's `dailyEntries.actualHours` sum; `submittedAt` = last `SUBMITTED` entry timestamp from `revisionHistory` (Manila `YYYY-MM-DD HH:mm`); `late` from `isWeeklyReportLate(weekEnd, submittedAt)`.
- Route: `GET /api/compliance/weekly-summary?weekStart=YYYY-MM-DD&semesterId=&program=` — `weekStart` defaults to the due week and must be a Monday (400 otherwise); same role scoping as Task 2. Workbook: sheet `Summary` (counts by state + total hours) and sheet `Students` (rows). `what` = `weekly-summary-<weekStart>`.

- [ ] **Step 1: Failing tests:** service — a student with no report that week appears as `NOT_STARTED`, 0 hours; a late submission is flagged; route — non-Monday → 400; faculty scope used for faculty; summary sheet counts match.
- [ ] **Step 2:** Run → FAIL; implement (reuse the Task 1 query shape, filtered to `weeklyReports: { where: { weekStart } }`); run → PASS.
- [ ] **Step 3:** Add the "Weekly summary (Excel)" links next to the compliance export links.
- [ ] **Step 4:** Full gate: `npx tsc --noEmit && npx next lint && npx jest && npx next build`.
- [ ] **Step 5: Commit** — `git commit -m "Add weekly summary Excel export for faculty and coordinators"`.

---

## Acceptance (roadmap line 135)

- All four role dashboards show their FR-DB-02..05 fields (AI flag column present, "—" until D).
- Faculty and coordinator compliance exports and the weekly summary download and open in Excel.
- On a test semester: create → activate (previous one deactivates) → archive (still visible when picked, rows unchanged).
- tsc, lint, jest, build, CI green; vault MOC updated after merge.

## Deferred (documented, not built)

- Read-only enforcement of writes to students in an archived semester (archive is a visibility/retention flag in F; G may add enforcement).
- AI flag values (Workstream D).
- Scheduled e-mailing of the weekly summary (FR-DB-06 says "auto-generate … exportable"; on-demand export covers it).
