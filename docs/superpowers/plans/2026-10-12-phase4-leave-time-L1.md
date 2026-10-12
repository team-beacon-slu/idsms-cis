# Workstream L1 — Time Requests, SLU Weekly Report & Credited Hours: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Interns file leave, OT and UT requests in IDSMS. Daily time records hold two time ranges. Rendered hours follow SLU's rules: time inside the shift counts; OT counts only if approved and at least 30 minutes; no offsetting; tardiness is undertime. The weekly report PDF follows SLU's Weekly Work Report template, including its OT and UT sections.

**Architecture:**

- One pure module, `src/lib/utils/timeMath.ts`, owns all time and credit maths, usable on client and server.
- Each `DailyReportEntry` stores `creditedHours` (nullable), computed at save time and recomputed when an OT request is approved or returned.
- Every hours total, everywhere, reads one shared helper `entryCreditedHours(entry)`, which returns `creditedHours ?? min(actualHours, scheduledHours)`. That keeps legacy rows on SLU's rules without a backfill.
- The existing `DeviationReport` becomes the request record: new nullable columns plus a review note and resubmission.
- No uploads (D2/D7).

**Tech Stack:** Next.js 14 App Router, Prisma 6, zod, Jest with `@/testUtils/prismaMock`, the existing Puppeteer PDF pipeline (`renderAndStoreDocument`), shadcn/ui, sonner.

**Spec:** `docs/superpowers/specs/2026-10-12-phase4-leave-time-requests-design.md`. Approved by Jay on 2026-10-12, split into L1 (this plan) and L2 (deductions, later). The relevant sections are: Intent, SLU rules, Decisions, Design (Data, Student tab, Faculty, Hours), the SLU Weekly Work Report template, the SLU OT/UT report sections, and Answers and defaults.

## Global Constraints

- Schema changes: edit `schema.prisma`, run `npx prisma generate`, and put the DDL in `prisma/migrations_manual/008_leave_time.sql` (additive, nullable). **Never run `prisma db push`, `migrate`, or any SQL against the shared DB.** Jay applies 008 later, after giving his OK.
- **No uploads of any kind** (D2/D7). Proof, signed forms and medical certificates go to Google Classroom. The deviation upload path is removed, but legacy `proofUrl` values stay readable to staff.
- **Credited-hours rules (spec "Hours", per day):**
  - `base` = minutes of the time ranges that fall inside the scheduled shift window [`startTime`, `endTime`], minus the part of `breakMinutes` that falls in the window, capped at `scheduledHours`.
  - `extra` = worked minutes outside the shift window, or every worked minute on a non-scheduled day.
  - The extra is credited only when all of these hold:
    - an APPROVED OVERTIME request covers the date;
    - the extra is at least 30 minutes;
    - the day is not tardy (no offsetting).
  - The credited extra is capped at the approved request's minutes.
  - When a schedule has no `startTime`/`endTime`, use the legacy fallback `min(actualHours, scheduledHours)` + eligible OT.
- **Worked examples. These are mandatory tests:**
  - Shift 08:00–17:00 with a 60-minute break:
    - `07:35–12:10` + `13:00–17:05` gives **8 h**;
    - `08:30–12:00` + `13:00–17:00` gives **7.5 h** and is tardy;
    - `07:55–17:15` (one range) gives **8 h**.
  - Saturday (non-scheduled) `08:00–12:00` with an approved 240-minute OT request gives **4 h**.
  - A 20-minute OT, approved or not, gives 0 extra.
  - A tardy day with approved OT gives 0 extra.
- **Every hours total in the app reads `entryCreditedHours`.** No raw `actualHours` sums remain except the stored raw value itself and the displayed "worked" time.
- **Grace period: none** (spec answer 2). Any time-in after `startTime` is tardy. Leaving before `endTime` on a scheduled PRESENT day is undertime.
- **Weekly report submit gate:** every tardy or early-leave day in the week needs an UNDERTIME request (any status) covering that date. Otherwise submission fails with a message listing the dates.
- Role checks: `requireUserApi()` + `requireRole()`; pages use `requireUserPage()` + `redirect("/")`. Only the owning student files or edits their own requests. Reviewing is limited to the assigned faculty adviser, the coordinator or a Super Admin, via `assertCanAccessStudent`.
- Every mutation calls `logEvent` in the same transaction. Notifications are sent after commit via `notify()`.
- Manila wall-clock times are `"HH:MM"`. Hours are displayed as `"N hrs M mins"` (e.g. `7 hrs 30 mins`, `8 hrs`, `30 mins`).
- No new dependencies. `package.json` and `package-lock.json` are untouched. No Claude/Anthropic attribution in commits.

## Review Focus

1. **Legacy and mocked rows with no times, schedule or creditedHours** must not crash or produce NaN. They fall back to `min(actualHours, scheduledHours)`. Existing tests whose mocks return only `{ actualHours }` keep working. (Tasks 1 and 3.)
2. **An OT approval or return after the week was saved** must recompute that day's `creditedHours`, `totalHours`, `runningTotal` and the student's rendered hours. (Task 4.)
3. **Schedule fields survive every normalizer:** `configureWorkSchedule`, `requestScheduleChange`, `parseScheduleConfig`, the FormData parsing in the schedule route, and `schedule-form.tsx`. Missing one silently drops `startTime`, `endTime` or `breakMinutes`. (Task 1.)
4. **A day with only one time range, or a midnight-free range,** e.g. `13:00–17:00` only, computes correctly. An end time before the start time is rejected. (Tasks 1 and 2.)
5. **The PDF shows "beginning" and "ending" totals that agree with the dashboard,** because both read the same credited values. (Tasks 3 and 7.)

---

## File map

| File                                                                                                                                                                                             | Responsibility                                                                                                                                                                                                 |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/lib/utils/timeMath.ts` (+test)                                                                                                                                                              | `parseHHMM`, `formatHrsMins`, `overlapMinutes`, `computeDayCredit`, `scheduleShift`; also exports `timeOfDay`                                                                                                  |
| `src/lib/validators/attendance.ts`, `src/lib/utils/schedule.ts`, `attendanceService.ts` (configure/requestScheduleChange), `api/students/[id]/schedule/route.ts`, `attendance/schedule-form.tsx` | schedule `startTime`/`endTime`/`breakMinutes` end to end                                                                                                                                                       |
| `prisma/schema.prisma`, `prisma/migrations_manual/008_leave_time.sql`                                                                                                                            | DailyReportEntry: `timeIn2`, `timeOut2`, `creditedHours`. DeviationReport: `requestKind`, `endDate`, `startTime`, `endTime`, `requestedMinutes`, `proofType`, `reviewNote`, `submittedAt`, `updatedAt` + enums |
| `src/lib/validators/report.ts`, `weeklyReportService.ts` (`saveDailyAccomplishment`, `generateWeeklyReportForm`, new `addDailyEntry`), `weekly-reports/weekly-report-form.tsx`, `auto-hours.ts`  | two time ranges, holiday rows, non-scheduled-day rows                                                                                                                                                          |
| `src/lib/services/creditedHours.ts` (+test)                                                                                                                                                      | `entryCreditedHours`, `recomputeCreditedHoursForDates`, the loader for a student's schedule + approved OT                                                                                                      |
| all hours readers (listed in Task 3)                                                                                                                                                             | switch to `entryCreditedHours`                                                                                                                                                                                 |
| `src/lib/services/timeRequestService.ts` (+test), `src/lib/validators/timeRequest.ts`                                                                                                            | file / edit / resubmit / review requests                                                                                                                                                                       |
| `src/app/api/students/[id]/time-requests/route.ts`, `src/app/api/time-requests/[id]/route.ts`, `.../review/route.ts`                                                                             | API                                                                                                                                                                                                            |
| `src/app/(dashboard)/leave-requests/page.tsx` (redirect), `students/[id]/leave-requests/page.tsx`, `request-form.tsx`, `request-review-actions.tsx`                                              | UI                                                                                                                                                                                                             |
| `src/lib/documents/weeklyReportTemplate.ts`, `weeklyReportData.ts`                                                                                                                               | SLU template                                                                                                                                                                                                   |

---

### Task 1: Time maths and the schedule shift

**Files:** create `src/lib/utils/timeMath.ts` + `timeMath.test.ts`. Modify `src/lib/validators/report.ts` (export `timeOfDay` from `timeMath`), `src/lib/validators/attendance.ts`, `src/lib/utils/schedule.ts`, `src/lib/services/attendanceService.ts` (`ConfigureWorkScheduleInput`, `configureWorkSchedule` ~:94, `requestScheduleChange` ~:703), `src/app/api/students/[studentProfileId]/schedule/route.ts` (FormData ~:45-50), `src/app/(dashboard)/students/[studentProfileId]/attendance/schedule-form.tsx`, and the affected tests.

**Interfaces (produces):**

```ts
export const timeOfDay: z.ZodString; // ^([01]\d|2[0-3]):[0-5]\d$
export function parseHHMM(t: string): number; // minutes since midnight; throws on bad input
export function formatHrsMins(hours: number): string; // 7.5 → "7 hrs 30 mins", 8 → "8 hrs", 0.5 → "30 mins", 0 → "0 hrs"
export function overlapMinutes(a: [number, number], b: [number, number]): number;
export interface Shift {
  startMin: number;
  endMin: number;
  breakMinutes: number;
  scheduledHours: number;
}
export function scheduleShift(schedule: {
  startTime?: string;
  endTime?: string;
  breakMinutes?: number;
  hoursPerDay: number;
}): Shift | null; // null when start/end missing
export interface DayCreditInput {
  ranges: Array<[string, string]>; // 0–2 [timeIn, timeOut]
  shift: Shift | null; // null → legacy fallback
  scheduledDay: boolean;
  scheduledHours: number; // entry.scheduledHours
  actualHours: number | null; // fallback when ranges empty
  approvedOtMinutes: number; // 0 if no APPROVED OVERTIME request covers the date
}
export interface DayCredit {
  workedHours: number;
  baseHours: number;
  extraMinutes: number;
  creditedOtHours: number;
  creditedHours: number;
  tardy: boolean;
  earlyLeave: boolean;
}
export function computeDayCredit(input: DayCreditInput): DayCredit;
```

The schedule schema gains `startTime?`, `endTime?` (both `timeOfDay`; end must be after start) and `breakMinutes?` (int 0–240). `hoursPerDay` stays required. When start and end are given, the form fills `hoursPerDay` as `(end − start − break) / 60`, which the user can edit.

- [ ] **Step 1: Failing tests** for `timeMath`:
  - every worked example in Global Constraints;
  - formatter cases;
  - a single-range day;
  - `13:00–17:00` only;
  - legacy fallback (`shift: null`, `actualHours` 9, `scheduledHours` 8 → 8);
  - `ranges: []` with `actualHours` given → fallback;
  - a non-scheduled day without OT → 0;
  - an approved OT of 20 minutes → 0 extra;
  - OT capped at the approved minutes;
  - a tardy day with approved OT → 0 extra;
  - `earlyLeave` true when the last time-out is before `endTime`.
- [ ] **Step 2:** Run, see them FAIL. Implement. Run, see them PASS.
- [ ] **Step 3: Failing tests:**
  - the schedule schema accepts and rejects the new fields;
  - `configureWorkSchedule` and `requestScheduleChange` persist `startTime`, `endTime` and `breakMinutes` (update the existing `toEqual` shapes);
  - `parseScheduleConfig` keeps them;
  - the schedule route's FormData parsing passes them through.

  Implement, then run until PASS.

- [ ] **Step 4:** `schedule-form.tsx`:
  - Add start time, end time and break inputs, defaulting to 08:00, 17:00 and 60 (spec answer 1: per student).
  - Show the computed hours per day.
  - Send the new FormData keys.
  - Read-only views show "8:00 am – 5:00 pm (1 h break)".
- [ ] **Step 5:** `npx tsc --noEmit && npx next lint && npx jest`, all green. Commit: "Add time maths and per-student shift times to the work schedule".

### Task 2: Migration 008, two time ranges, holiday and non-scheduled rows

**Files:**

- `prisma/schema.prisma` (DailyReportEntry `timeIn2 String?`, `timeOut2 String?`, `creditedHours Decimal? @db.Decimal(4,2)`).
- DeviationReport, with new enums:

  ```prisma
  requestKind RequestKind? (ANTICIPATED|EMERGENCY)
  endDate DateTime?
  startTime String?
  endTime String?
  requestedMinutes Int?
  proofType ProofType? (MEDICAL_CERTIFICATE|PROOF_OF_LEAVE|WRITTEN_NOTICE)
  reviewNote String?
  submittedAt DateTime? @db.Timestamptz(3)
  updatedAt DateTime? @db.Timestamptz(3)
  ```

- `prisma/migrations_manual/008_leave_time.sql`: idempotent `ALTER TABLE … ADD COLUMN IF NOT EXISTS`, plus `CREATE TYPE … IF NOT EXISTS` via DO blocks. Header: apply after Jay's OK, no data loss, all columns nullable.
- `src/lib/validators/report.ts` (`dailyEntrySchema` gets `timeIn2`/`timeOut2`; hours-versus-window refine sums both ranges; ranges must not overlap; range 2 starts after range 1 ends).
- `weeklyReportService.ts`:
  - `saveDailyAccomplishment` details gains `timeIn2`/`timeOut2`, and non-PRESENT rows null them too;
  - `generateWeeklyReportForm` also creates HOLIDAY rows (0 h, `attendanceStatus "HOLIDAY"`) for applicable PH holidays falling on scheduled days;
  - new `addDailyEntry(weeklyReportId, reportDate, studentUserId)` for a non-scheduled date within the week (`scheduledHours 0`, `attendanceStatus "SCHEDULED"`), owner-only, editable weeks only, no duplicate dates.
- `api/weekly-reports/[id]/route.ts` PATCH (passes `timeIn2`/`timeOut2`) and a new `POST api/weekly-reports/[id]/entries` (addDailyEntry).
- `weekly-reports/weekly-report-form.tsx`:
  - a second "Afternoon" time range per row;
  - auto-hours via `computeDayCredit(...).workedHours`, replacing `auto-hours.ts`;
  - an "Add a day" control for a non-scheduled date such as Saturday;
  - rows show "N hrs M mins";
  - holiday rows show "Holiday (PH Calendar)".
- `auto-hours.ts` + `auto-hours.test.ts`: delete them, or reduce to a thin wrapper over `timeMath`, but no duplicate maths.

- [ ] **Step 1:** Edit the schema, write 008, run `npx prisma generate`.
- [ ] **Step 2: Failing tests:**
  - validator: two ranges OK; overlapping ranges rejected; hours above the summed window rejected;
  - `saveDailyAccomplishment` persists and nulls the second range;
  - `generateWeeklyReportForm` creates a HOLIDAY row for an applicable holiday on a scheduled day and none for a non-applicable one;
  - `addDailyEntry`: owner-only, rejects a date outside the week, rejects a duplicate, rejects a locked report.

  Implement, then PASS.

- [ ] **Step 3:** Form UI changes. Keep the client-side `rowProblem` in sync by calling the same shared validator helpers, not duplicate maths.
- [ ] **Step 4:** Gate green. Commit: "Record two time ranges per day, holiday rows and non-scheduled days in weekly reports".

### Task 3: Credited hours everywhere

**Files:** create `src/lib/services/creditedHours.ts` (+test). Modify every hours reader:

- `attendanceService.ts`: `calculateRenderedHours` :442, `getHoursSummary` pending sum ~:1046, `exportAttendanceLogCsv` ~:632, and `computeProjectedCompletionDate` (which already uses `calculateRenderedHours`);
- `weeklyReportService.ts`: `calculateWeeklyTotalHours` :218 and `calculateRunningTotalAndRemaining` :244;
- `complianceService.ts` :174-186 and :263-273;
- `adminExportService.ts` :143 and :171;
- `dataRequestService.ts` :252 and :379;
- `monthlyReportService.ts` (its per-month sum);
- `documentService.ts` :487 (final cover gate, via `calculateRenderedHours`).

**Interfaces (produces):**

```ts
// Credited hours of one stored entry; legacy-safe.
export function entryCreditedHours(e: {
  creditedHours?: Prisma.Decimal | number | null;
  actualHours?: Prisma.Decimal | number | null;
  scheduledHours?: Prisma.Decimal | number | null;
  attendanceStatus?: string | null;
}): number;
// = creditedHours != null ? Number(creditedHours)
//   : status in (ABSENT, HOLIDAY) ? 0
//   : Math.min(Number(actualHours ?? 0), scheduledHours != null ? Number(scheduledHours) : Infinity)

// Recompute and store creditedHours for a student's entries on the given dates (or all), then refresh totals.
export async function recomputeCreditedHours(
  studentProfileId: string,
  opts?: { dates?: Date[]; tx?: Prisma.TransactionClient }
): Promise<void>;
```

`recomputeCreditedHours`:

1. Loads the student's current schedule (latest approved work plan `scheduleConfig` → `scheduleShift`) and their APPROVED OVERTIME requests (date or `endDate` range → minutes per date).
2. For each entry, calls `computeDayCredit` and writes `creditedHours`.
3. For affected weekly reports, re-runs `calculateWeeklyTotalHours` and `calculateRunningTotalAndRemaining`.
4. Calls `computeTotalHoursRendered`.

`saveDailyAccomplishment` calls the per-entry compute so `creditedHours` is set at save time.

- [ ] **Step 1: Failing tests:**
  - `entryCreditedHours` covers creditedHours present, the legacy cap, ABSENT/HOLIDAY → 0, and mocks with only `actualHours` (Review Focus 1);
  - `recomputeCreditedHours` writes the expected values and refreshes the totals;
  - `calculateRenderedHours` sums `entryCreditedHours`;
  - the pending sum, compliance, exports, DSAR, monthly and CSV all use it (assert on representative inputs).

  Update the existing hard-coded sums only where a row exceeds its `scheduledHours`; otherwise they must pass unchanged.

- [ ] **Step 2:** Implement. Run until PASS. Run `grep -rn "actualHours" src/lib src/app --include=*.ts`: every remaining use must be the raw stored value, the display, or `entryCreditedHours` itself. List them in the report.
- [ ] **Step 3:** Gate green. Commit: "Credit hours by SLU shift rules everywhere hours are totalled".

### Task 4: Time requests (rework DeviationReport): service, validators and API

**Files:**

- create `src/lib/validators/timeRequest.ts` and `src/lib/services/timeRequestService.ts` (+tests);
- create the routes `api/students/[studentProfileId]/time-requests/route.ts` (GET list, POST create) and `api/time-requests/[id]/route.ts` (PATCH edit/resubmit) and `api/time-requests/[id]/review/route.ts` (POST approve/return);
- modify `notify.ts` (add the `"REQUEST_RETURNED"` trigger) and `notificationEvents.ts` (`notifyTimeRequestReviewed`);
- the old `deviations` POST route stops accepting files: JSON only, delegating to the new service, or removed if the UI no longer calls it. Keep `deviations/[id]/proof` (GET) for legacy `proofUrl` rows. Remove `deviations/[id]/validate` once the new review route replaces it, and update `attentionService`/calendar readers that reference `validationStatus` only if the names change.

**Interfaces (produces):**

```ts
export const timeRequestSchema: z.ZodType<{
  deviationType: "ABSENCE" | "OVERTIME" | "UNDERTIME";
  requestKind: "ANTICIPATED" | "EMERGENCY";
  date: Date;
  endDate?: Date; // endDate only for ABSENCE; >= date; max 14 days
  startTime?: string;
  endTime?: string; // required for OVERTIME/UNDERTIME; end > start
  reason: string; // trimmed 10–500
  proofType?: "MEDICAL_CERTIFICATE" | "PROOF_OF_LEAVE" | "WRITTEN_NOTICE"; // required for ABSENCE
}>; // requestedMinutes derived server-side from start/end
export async function createTimeRequest(
  studentProfileId: string,
  input: unknown,
  actingUser: { id: string; role: Role },
  ip?: string | null
): Promise<{ id: string }>;
export async function updateTimeRequest(
  id: string,
  input: unknown,
  actingUser: { id: string; role: Role },
  ip?: string | null
): Promise<void>; // owner only; PENDING or REJECTED(=Returned) only; resets to PENDING, clears reviewNote
export async function reviewTimeRequest(
  id: string,
  action: "APPROVE" | "RETURN",
  note: string | undefined,
  actingUser: { id: string; role: Role },
  ip?: string | null
): Promise<{ studentProfileId: string; status: ValidationStatus }>; // RETURN requires note 1–500; APPROVE→VALIDATED, RETURN→REJECTED; then recomputeCreditedHours(studentProfileId, { dates })
export async function listTimeRequests(studentProfileId: string): Promise<TimeRequestView[]>; // includes filedAfterTheFact = deviationType==='OVERTIME' && submittedAt > date (Manila day)
export function isFiledAfterTheFact(r: {
  deviationType: string;
  date: Date;
  submittedAt: Date | null;
}): boolean;
```

- [ ] **Step 1: Failing tests:**
  - schema rules (OT/UT need times; ABSENCE needs a proofType; reason length; endDate bounds);
  - create: owner only, sets `submittedAt`, audits `TIME_REQUEST_SUBMITTED`;
  - update: owner only, blocked when VALIDATED, Returned → PENDING;
  - review: assigned staff only, RETURN without a note → 400, APPROVE/RETURN audited, recompute called with the request's dates (Review Focus 2), notification after commit;
  - "filed after the fact" for OT whose `submittedAt` is a later Manila day than its date.
- [ ] **Step 2:** Implement the services. Run until PASS.
- [ ] **Step 3: Failing route tests:**
  - 401 for the wrong role;
  - 403 or 404 when not the owner / not the assigned adviser;
  - 400 on a Return without a note;
  - 201 or 200 on success;
  - no multipart or file accepted anywhere.

  Implement, then PASS.

- [ ] **Step 4:** Gate green. Commit: "Add leave, overtime and undertime requests with adviser review".

### Task 5: The "Leave & Time Requests" tab and staff review UI

**Files:**

- create `src/app/(dashboard)/leave-requests/page.tsx` (redirect pattern like `attendance/page.tsx`) and `students/[studentProfileId]/leave-requests/page.tsx`, `request-form.tsx`, `request-review-actions.tsx`;
- modify `dashboard-nav.tsx` (student item "Leave & Time Requests" after Attendance);
- modify `students/[studentProfileId]/attendance/page.tsx`: replace the deviation form and history with a link to the new tab and a summary; keep the legacy history read-only;
- modify `src/app/(dashboard)/page.tsx` / `attentionService.ts`: "Requests awaiting review" count for staff.

- [ ] **Step 1: Student page:**
  - The request list shows date(s), type, kind, times, "N hrs M mins", status text (Pending / Approved / Returned + the adviser's note) and a "Filed after the fact" badge.
  - Edit is available on Pending or Returned requests.
  - The form shows the fields from Task 4 and help text quoting SLU's rules: "Overtime must be requested before it is worked", "Overtime under 30 minutes is not credited", "Attach the signed form and any proof to that week's report in Google Classroom".
  - No upload control.
- [ ] **Step 2: Staff view (same page, staff roles):**
  - Approve, and Return with an inline required note, with no `window.confirm`.
  - Focus moves to the note field.
  - Each button's accessible name includes the request date and type.
- [ ] **Step 3:** Gate green. Commit: "Add the Leave & Time Requests tab and adviser review".

### Task 6: Weekly report submit gate for tardiness and early leave

**Files:** modify `weeklyReportService.ts` `recordWeeklyReportSubmission` (incompleteness check ~:421-428) and the weekly report form, which shows per-row warnings.

- [ ] **Step 1: Failing tests:**
  - a week with a tardy day (time-in after `startTime`) or an early-leave day and no UNDERTIME request covering that date: submission throws `WeeklyReportIncompleteError` listing the dates ("File an undertime request for: Jun 16 (late arrival)");
  - with a request of any status: submission passes;
  - schedules without `startTime` skip the check.
- [ ] **Step 2:** Implement. The form flags tardy and early-leave rows ("Late arrival: file an undertime request") with a link to the requests tab, prefilled with the date and the gap times via query params.
- [ ] **Step 3:** Gate green. Commit: "Require an undertime request for late arrival or early leave before submitting a week".

### Task 7: SLU Weekly Work Report template (PDF and preview)

**Files:** modify `src/lib/documents/weeklyReportData.ts` (+test) and `src/lib/documents/weeklyReportTemplate.ts` (+test).

**Loader additions:**

- `fullName`;
- company name;
- week number: weeks since the deployment start date (`internshipStartDate`, else the first entry date), with Week 1 = the week containing it;
- both time ranges;
- per-entry `creditedHours` via `entryCreditedHours`;
- holiday names for HOLIDAY rows (from `getHolidayCalendarForStudent`);
- that week's OVERTIME and UNDERTIME requests (any status except REJECTED), with date, time range, minutes and reason;
- `beginning` = `runningTotal − totalHours` and `ending` = `runningTotal`.

**Template (rewrite to match the spec):**

- the header lines;
- "Weekly Work Report";
- "Week No. N (Mon D – Mon D, YYYY)";
- "Name: Last, First M." (as entered) and "Company:";
- the "Detailed Time Record" table: Date (Day) | Actual Work Times (one or two lines) | Hours Rendered ("N hrs M mins") | Work Accomplishment;
- holiday rows read "Holiday (PH Calendar)" with 0;
- totals: "Total work-hours rendered", "TOTAL work-hours (beginning)", "TOTAL rendered so far (ending)";
- the supervisor name line and "date signed";
- "Report on Overtime Hours" and "Report on UNDER TIME Hours" sections (with "TOTAL UT Hours"), each only when non-empty and each with its own supervisor line;
- the notes "An overtime is credited when the Intern has incurred at least 30 minutes of off-duty time. Less than the minimum time will not be credited." and "Extending the hours to compensate for tardiness is impermissible."

Keep the reference code, the Manila timestamp, the preview watermark and `escapeHtml` on all user text.

- [ ] **Step 1: Failing tests:**
  - the loader computes the week number, beginning/ending and the OT/UT lists;
  - the template renders the SLU header strings, two ranges, "7 hrs 30 mins", the holiday label, both sections only when present, the TOTAL UT row, and escapes user text (`<script>` in the accomplishments);
  - Review Focus 5: beginning + total = ending.
- [ ] **Step 2:** Implement, then PASS. The preview page and PDF generation use the same template unchanged.
- [ ] **Step 3:** Full gate: `npx tsc --noEmit && npx next lint && npx jest && npx next build` (no dev server running). Commit: "Render weekly reports in SLU's Weekly Work Report format with OT and UT sections".

---

## Acceptance

- Migration 008 is applied to the dev DB with Jay's OK.
- The hands-on check on the dev DB:
  - set a student's shift to 08:00–17:00 / 60;
  - enter the three SLU example days, and check 8 h, 7 h 30 m (with the late-arrival UT gate) and 8 h;
  - file an OT request for a Saturday, approve it, and check that the hours update;
  - return a request with a note;
  - the weekly report PDF matches SLU's template, including the OT and UT sections.
- tsc, lint, jest, build and CI green. The PR lists the dev DB students whose totals change.

## Deferred to L2

Deduction matrix, conduct records (warnings, demerits, violations, suspensions), automatic late or missing and unsupported-UT counts, "Excused" exceptions, and the optional hours per demerit.
