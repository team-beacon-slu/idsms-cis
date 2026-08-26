# Phase 3 — Active Deployment, Attendance & Unified Calendar: Design

**Date:** 2026-08-26
**Status:** Approved (task distribution + GitHub issues already created; see `PHASE3_TASKS.md`)
**Branch:** `feature/phase3-attendance-reports-calendar` (not yet created)

## Context

Phase 1 (Identity/RBAC/Auth) and Phase 2 (Pre-Deployment & Compliance Workflow) are merged and
live against the shared Supabase dev DB. Phase 3 covers the three PRD modules that run the
day-to-day internship once a student is deployed:

- **Module 5 — Attendance & Time Tracking** (FR-AT-01–11): schedule configuration, deviation
  reports, hour computation, mid-internship schedule changes.
- **Module 6 — Weekly & Monthly Report Submission** (FR-WR-01–10): the recurring weekly report
  cycle, faculty's four-way review action, monthly aggregation.
- **Module 12 — Unified Calendar & Timeline Tracking** (FR-CAL-01–04): a read-only, color-coded
  calendar view over data already produced by Modules 5/6/10.

25 FRs total. Researched via direct reading of `PRD.md` lines 234–344 and the current
`prisma/schema.prisma` (models `StudentProfile`, `WorkPlan`, `WeeklyReport`,
`DailyReportEntry`, `DeviationReport`, `GeneratedDocument`, `HolidayCalendarEntry`).

## Scope decision — full spec, framework-only from the PM

Per direction from Danielle (PM/project lead): build **all** 25 FRs, not a Must-only cut. The
PM (Danielle) builds the framework only — schema, API routes with RBAC, zod validators, page
shells wired to stub services, nav entries. Every substantive business-logic function is
delivered as a `// TODO(<github-username>): <contract>` stub by a named team member: compiling,
wired into its route/component, returning a placeholder — not working logic.

**Frencine (RenAbanador)** holds zero tasks by design — she is doing the thesis paper and code
review for this phase, not implementation.

Every other org member holds at least one task slice, specifically so each has an individually
attributable GitHub contribution for peer evaluation (all 7 named members plus the PM). Task
decomposition is maximal — one single-responsibility function or component per stub, never a
multi-action bundle — so contribution and review scope stay clean per person.

Full task table, owners, difficulty mix, FR mapping, file paths, and GitHub issue links live in
`PHASE3_TASKS.md` at the repo root (already created, 43 tasks, 43 GitHub issues open in
`team-beacon-slu/idsms-cis` #3–#45). This spec does not repeat that table — it defines the
framework those stubs plug into.

## Schema diff

Confirmed against the live schema (`prisma/schema.prisma`) — no guessing:

1. **Drop `StudentProfile.scheduleId`.** It is a nullable UUID column with no relation and no
   matching `Schedule` model anywhere in the schema — a Phase-0 vestige. The actual schedule
   config already lives in `WorkPlan.scheduleConfig` (Json), set by FR-AT-01's
   `configureWorkSchedule`. Confirmed with Danielle 2026-08-26.
2. **Add `GeneratedDocument.periodLabel String? @map("period_label")`.** `DocumentType` already
   has `WEEKLY_REPORT` and `MONTHLY_REPORT` values (added in Phase 0, never used yet) — this
   phase is the first to populate them. `periodLabel` disambiguates _which_ week/month a given
   `GeneratedDocument` row represents (e.g. `"2026-08-24"` for a week-start, `"2026-08"` for a
   calendar month); null for `ENDORSEMENT_LETTER`/`FINAL_REPORT_COVER`. No new model needed for
   monthly reports — `submitMonthlyReport` (task B27) creates a
   `GeneratedDocument(documentType: MONTHLY_REPORT, status: PENDING_DRAFT)` row, the same
   pattern Phase 2's `reviewWorkPlan` already established for `ENDORSEMENT_LETTER`.
3. **No new models.** Everything Module 5/6/12 needs already exists: `WeeklyReport` +
   `DailyReportEntry` (report cycle), `DeviationReport` (already has `validationStatus`,
   `facultyId` — matches FR-AT-04 exactly), `HolidayCalendarEntry` (FR-AT-02),
   `StudentProfile.renderedHours` (confirmed unwritten anywhere in `src/` today — this phase is
   what makes it real, via task B6). `WeeklyReportStatus` already has all four values FR-WR-06
   needs (`APPROVED`/`RETURNED`/`REGARDED`/`DISREGARDED`) — no enum change required there.
4. **`ValidationStatus` enum note for implementers:** it's `PENDING` / `VALIDATED` / `REJECTED`
   — task B5's stub contract must use `VALIDATED`, not `APPROVED`, to match the existing enum
   (flagged here since the PRD text says "validated," which is easy to mis-type as an approve
   action name).

Run `npx prisma generate && npx prisma db push` (never `migrate dev`, per Phase 1/2 precedent).

## Framework layout (built by the PM, not a stub)

**Correction from Phase-0 scaffold** (found during this spec's self-review, not previously
accounted for): `src/lib/services/` already contains Phase-0 placeholder files, each a one-line
header comment and nothing else. `reportService.ts` covers Module 5 **and** Module 6 combined
("Weekly/monthly report submission, review actions... and hour computation. See PRD Module 5
... Module 6..."); `calendarService.ts` already exists, empty, for Module 12.

Phase 1/2 established a stricter one-file-per-PRD-module convention (`companyService.ts`,
`checklistService.ts`, `workPlanService.ts` never merge two modules). `reportService.ts`
merging Modules 5 and 6 into one file predates that convention and would hold all 29 of B1–B29
— large enough, and spanning two distinct domains, to qualify as the kind of pre-existing
problem the design should fix rather than build on. Decision: **delete `reportService.ts`**
and replace it with the module-per-file split below; **keep and fill in `calendarService.ts`**
(name already matches, just empty).

- `src/lib/services/attendanceService.ts` (new, replaces part of `reportService.ts`) — Module 5, functions B1–B15.
- `src/lib/services/weeklyReportService.ts` (new, replaces part of `reportService.ts`) — Module 6 weekly-report functions, B16–B25, B28–B29.
- `src/lib/services/monthlyReportService.ts` (new, replaces part of `reportService.ts`) — Module 6 monthly-aggregation functions, B26–B27.
- `src/lib/services/calendarService.ts` (existing empty placeholder, filled in) — Module 12, functions B30–B36.

This does not affect `PHASE3_TASKS.md` or the 43 GitHub issues already created — their file
paths already used this three-way split, not `reportService.ts`.

Each file: the PM writes the exported function _signatures_ with full JSDoc (inputs, outputs,
edge cases, straight from the FR text — this is what's already captured per-task in
`PHASE3_TASKS.md` and each GitHub issue), the RBAC-checked caller path, and the
`prisma`/`$transaction`/`logEvent` scaffolding identical to Phase 1/2's pattern. The function
_body_ is `// TODO(<owner>): <contract>` plus a placeholder return that satisfies the return
type (so the file compiles and the route/UI wiring is real, but the logic is not).

**API routes** (new, RBAC per FR text, same `requireUserApi → requireRole/assertCanAccessStudent
→ zod.parse → service call → handleApiError` shape as Phase 1/2):

| Path                                                      | Methods     | RBAC                                                                                                                                                |
| --------------------------------------------------------- | ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/api/students/[studentProfileId]/schedule`               | POST, PATCH | POST: student self-only. PATCH (change request): student self-only.                                                                                 |
| `/api/work-plans/[id]/schedule-change/faculty-review`     | PATCH       | Faculty only.                                                                                                                                       |
| `/api/work-plans/[id]/schedule-change/coordinator-review` | PATCH       | Coordinator/Admin only.                                                                                                                             |
| `/api/students/[studentProfileId]/deviations`             | POST, GET   | POST: student self-only. GET: `assertCanAccessStudent`.                                                                                             |
| `/api/deviations/[id]/validate`                           | PATCH       | Faculty/Coordinator/Admin.                                                                                                                          |
| `/api/students/[studentProfileId]/attendance-summary`     | GET         | `assertCanAccessStudent` (returns B6/B7 output).                                                                                                    |
| `/api/students/[studentProfileId]/attendance-export`      | GET         | `assertCanAccessStudent`.                                                                                                                           |
| `/api/config/required-hours`                              | GET, PATCH  | GET: any authenticated user. PATCH: Super Admin only.                                                                                               |
| `/api/students/[studentProfileId]/weekly-reports`         | POST, GET   | POST: system/cron-triggered generation (B16) — exposed as a manual "generate this week" fallback, student self-only. GET: `assertCanAccessStudent`. |
| `/api/weekly-reports/[id]`                                | GET, PATCH  | GET: `assertCanAccessStudent`. PATCH (daily entries): student self-only.                                                                            |
| `/api/weekly-reports/[id]/submit`                         | POST        | Student self-only — runs B20 late-submission gate.                                                                                                  |
| `/api/weekly-reports/[id]/review`                         | PATCH       | Faculty only — body `{ action: "APPROVE"\|"RETURN"\|"REGARD"\|"DISREGARD" }`, dispatches to B21–B24.                                                |
| `/api/students/[studentProfileId]/monthly-reports`        | POST, GET   | POST: student self-only (runs B26 gate then B27). GET: `assertCanAccessStudent`.                                                                    |
| `/api/calendar`                                           | GET         | Any authenticated user — role-scoped via `getUnifiedCalendarEvents(user.id, user.role)` (B30).                                                      |

**UI page shells** (Server Components, `requireUserPage` + role-gate, exact Phase 1/2
`users/page.tsx` pattern — fetch via direct service call, mutations in sibling `"use client"`
components):

- `(dashboard)/students/[studentProfileId]/attendance/page.tsx` — schedule + deviations, hosts
  F3/F4.
- `(dashboard)/students/[studentProfileId]/weekly-reports/page.tsx` — hosts F1.
- `(dashboard)/students/[studentProfileId]/weekly-reports/[weeklyReportId]/review/page.tsx` —
  faculty review screen, four action buttons wired to `/review`.
- `(dashboard)/students/[studentProfileId]/monthly-reports/page.tsx` — hosts F2.
- `(dashboard)/calendar/page.tsx` — hosts F5, single page for all four roles (role-scoped data,
  shared component).
- `dashboard-nav.tsx`: add "Attendance", "Weekly Reports", "Calendar" links (role-visible per
  existing nav pattern).

## Testing approach

Matches the framework/stub split:

- **Framework code** (schema, routes, RBAC gate, zod validators, service scaffolding, page
  shells, data-fetch wiring) gets real tests at Phase 1/2 rigor: `prismaMock`-based service
  tests asserting the transaction/`logEvent` shape around each stub call site, route tests
  asserting RBAC (403 for wrong role, `assertCanAccessStudent` enforcement), zod validator
  tests for the request-shape boundary.
- **Stubbed functions themselves** get one "reachable and wired correctly" test each: call the
  route/service, assert it returns the placeholder without throwing, assert RBAC still applies
  before the stub is ever reached. Each such test carries a matching
  `// TODO(<owner>): replace this placeholder-return assertion once the real logic lands` so
  the eventual real test is a known, located gap — not a silent hole in coverage.
- New `jest.config.ts` coverage thresholds: `attendanceService.ts`, `weeklyReportService.ts`,
  `monthlyReportService.ts`, `calendarService.ts` — set thresholds against the framework
  surface only (RBAC/validation/wiring branches), not against stub bodies, since stub bodies
  are TODOs by design and would artificially fail a logic-coverage gate.

## Sequencing

Mirrors Phase 1/2's lettered stages, adjusted for the framework/stub split:

- **A** — Schema diff (`scheduleId` drop, `periodLabel` add), `db push`.
- **B** — Service file scaffolding: all 43 function/component signatures + JSDoc + RBAC/`$transaction` shell + `TODO(owner)` stub bodies, across `attendanceService.ts`, `weeklyReportService.ts`, `monthlyReportService.ts`, `calendarService.ts`.
- **C** — Zod validators for every new route body.
- **D** — All 13 API routes, wired to the stub services.
- **E** — UI page shells + nav entries, wired to the stub services/routes (client components F1–F7 also land here as their own stub bodies, owned per `PHASE3_TASKS.md`).
- **F** — Framework tests (Stage G equivalent): RBAC/wiring/"reachable" tests per the Testing approach above.
- **G** — Docs reconciliation: `PRD.md` FR annotations for any Should-vs-Must clarifications made here, `CONTRIBUTING.md` note on the stub/TODO convention for anyone picking up a task from `PHASE3_TASKS.md`.

One PR (`feature/phase3-attendance-reports-calendar` off `develop`), matching Phase 1/2
precedent — will flag mid-execution if it grows unwieldy enough to warrant splitting per
owner instead.

## Out of scope for this spec

- The actual stub _implementations_ — those are each task owner's individual PRs against their
  assigned GitHub issue, reviewed by Frencine.
- Module 8 PDF generation for weekly/monthly reports (Puppeteer rendering) — `GeneratedDocument`
  rows this phase creates stay `PENDING_DRAFT`; actual PDF rendering is Module 8's job, not
  scoped here.
- Notification delivery internals (FR-WR-07, task B25) beyond the stub call site — Module 11's
  Resend/React-Email wiring is assumed already stubbed elsewhere or deferred; B25's contract
  only requires the call site to exist and be reachable.
