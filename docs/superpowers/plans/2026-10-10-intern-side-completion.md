# Intern (Student) Side Completion — Plan

Date: 2026-10-10 · Branch: `feature/intern-side-completion` → `develop`
Authorized by the adviser for the PM to build directly; task credit is reassigned to the
original owners afterward. Covers everything a `STUDENT_INTERN` touches end to end. Faculty-,
coordinator-, and admin-only stubs remain open for their owners.

## Starting state (reviewed from vault + GitHub + code)

- Phases 0–3 on `develop`; PR #62 is the latest merge. Danielle's 11 Phase 3 stubs are done.
- Student pages exist but the Phase 3 student flow is placeholder: 4 of 7 client components
  are "not yet implemented" boxes, and 17 student-path service functions return placeholders.
- Without these, a student can't set a schedule, file a deviation, generate/fill/submit a
  weekly report, export attendance, request a schedule change, or submit a monthly report.

## Scope — backend (service bodies, contracts unchanged)

| Function                                                          | Issue   | Decision taken                                                                                                                                                                                                                                       |
| ----------------------------------------------------------------- | ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `configureWorkSchedule`                                           | #3      | Needs an APPROVED work plan. If a schedule is already set, **reject** and point the student to a change request (FR-AT-08), so FR-AT-10's no-retroactive-change rule isn't bypassed.                                                                 |
| `getHolidayCalendarForStudent` / `markHolidayApplicable`          | #4 #5   | Per-student row (with `studentProfileId` set, `semesterId` null) on the same date = **opt-out** ("doesn't apply to me"). No schema change. New `GET/PATCH /api/students/[id]/holidays` route (closes the wiring gap).                                |
| `submitDeviationReport`                                           | #6      | Transaction + `logEvent`. Route now also accepts multipart with an optional proof file (stored in the existing checklist bucket under `deviations/…`, no new bucket to provision). New `GET /api/deviations/[id]/proof` redirects to a signed URL.   |
| `exportAttendanceLogCsv`                                          | #12     | Daily entries across all weeks, RFC-4180 escaped.                                                                                                                                                                                                    |
| `requestScheduleChange` + `logScheduleChangeHistory`              | #13 #17 | Rejects if a request is already pending. Appends `PENDING_FACULTY` entry carrying `newScheduleConfig` (the convention `applyScheduleChangeProspectively` already reads).                                                                             |
| `generateWeeklyReportForm`                                        | #18     | Normalizes to the Monday of the week; idempotent (returns the existing row). One entry per scheduled day, skipping applicable holidays.                                                                                                              |
| `calculateWeeklyTotalHours` / `calculateRunningTotalAndRemaining` | #19 #20 | Null hours count as 0; running total = prior APPROVED/REGARDED weeks + this week.                                                                                                                                                                    |
| `saveDailyAccomplishment`                                         | #21     | Owner-only; locked while awaiting review or once APPROVED/REGARDED/DISREGARDED.                                                                                                                                                                      |
| `validateLateSubmissionReason`                                    | #22     | Due date = Tuesday after `weekEnd`, end of day Manila. Late + no reason → 400. Reason is stored in the `SUBMITTED` entry of `revisionHistory`.                                                                                                       |
| `generateReportPdfPreview`                                        | #30     | Returns a URL to a printable preview page (browser "Save as PDF"), not Module 8's Puppeteer PDF.                                                                                                                                                     |
| `generateReportReferenceCode`                                     | #31     | `WR-YYYYMMDD-XXXXXXXX` (week start + random UUID segment).                                                                                                                                                                                           |
| `colorCodeCalendarEvents` / `getStudentCalendarView`              | #33 #34 | Fixed type→color map; the student calendar is scoped to that one student.                                                                                                                                                                            |
| _(new)_ `recordWeeklyReportSubmission`                            | —       | `WeeklyReport` has no "submitted" status, so submission is recorded as a `SUBMITTED` entry in `revisionHistory` (reference code, timestamp, late flag, delay reason). "Awaiting review" = status PENDING/RETURNED **and** last entry is `SUBMITTED`. |

## Scope — frontend

- F3 `AttendanceScheduleForm`: initial setup, plus a change-request mode with a reason and supporting document, showing the pending request's status.
- F4 `DeviationReportForm`: date, type, reason, optional proof upload.
- F6 `AttendanceExportButton`: CSV download.
- F1 `WeeklyReportForm` + F7 copy-paste check: per-day hours/accomplishments/tools, live totals, preview, and submit with a late-reason prompt. Copy-paste matches are blocking.
- F2 `MonthlyReportView`: per-month eligibility, rollup, and submit.
- Attendance page: rendered/remaining hours, projected completion date, holiday opt-out list.
- Weekly reports page: a "start this week's report" generator, reference code, faculty feedback.
- Student dashboard: hours and progress stats. Nav: Monthly Reports link and a `/monthly-reports` redirect.

## Out of scope (left for owners)

Faculty/coordinator/admin stubs: #7 validateDeviationReport, #10/#11 required-hours config,
#24/#25 Return/Regard, #27 status email, #35–#37 faculty/coordinator calendar views.

## Verification

`npm run typecheck`, `npm run lint`, `npm test` (stub tests replaced with real-behavior
tests for every implemented function), `npm run build`.
