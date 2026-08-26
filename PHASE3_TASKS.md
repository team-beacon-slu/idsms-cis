# Phase 3 Task Tracker — Active Deployment, Attendance & Unified Calendar

Scope: full Phase 3 as specified in `PRD.md` (Module 5 — Attendance & Time Tracking, FR-AT-01–11;
Module 6 — Weekly & Monthly Report Submission, FR-WR-01–10; Module 12 — Unified Calendar &
Timeline Tracking, FR-CAL-01–04). 25 FRs total, decomposed into 43 single-responsibility stub
functions/components.

**Framework vs. stub boundary:** Danielle (PM) builds all schema, API routes with RBAC, zod
validators, and page shells wired to stub services. Every function below is delivered by its
owner as a `// TODO(<github-username>): <contract>` stub — compiling, wired into its route/UI,
returning a placeholder value — not working business logic. Doc comment above each stub states
inputs/outputs/edge cases straight from the FR text.

**Frencine (RenAbanador)** is intentionally excluded from this table — she is focused on the
thesis paper and code review for this phase.

Owner counts (Danielle highest, Kenneth second-highest per PM call on 2026-08-26):

| Owner                     | GitHub                                                                                             | Count | Focus                                                                                                                     |
| ------------------------- | -------------------------------------------------------------------------------------------------- | ----- | ------------------------------------------------------------------------------------------------------------------------- |
| Danielle John Aragon (PM) | JayPing23                                                                                          | 11    | Hardest cross-cutting backend: hour computation, schedule-change lifecycle, monthly aggregation gate, calendar aggregator |
| Kenneth Russel Avaricio   | KennethRusselAvaricio                                                                              | 8     | Second-lead backend: schedule config, deviation validation, weekly hour calc, review actions                              |
| Ulrich Gayaso             | gu457                                                                                              | 7     | Front-end: report/schedule/deviation/calendar client components + paired read APIs                                        |
| Matt                      | AndresBonifaci0                                                                                    | 7     | Front-end: monthly view, calendar client components + paired read APIs                                                    |
| Gillian Domenden          | 2215428-sys                                                                                        | 4     | Backend: holiday calendar, required-hours config                                                                          |
| Shantea23                 | Shantea23                                                                                          | 4     | Backend: CSV export assembly, report form generation, late-submission validation, reference codes                         |
| Rhaastas                  | Rhaastas (**invite still pending** — not yet a repo collaborator, issues below created unassigned) | 2     | Backend: schedule-change request intake, report status email                                                              |

Frencine (RenAbanador) confirmed as a repo collaborator but intentionally holds 0 tasks — thesis paper + code review instead.

Total: 43

---

## Module 5 — Attendance & Time Tracking

| #   | Function                                                              | FR       | Owner                                  | Difficulty | File (planned)                          | Issue                                                         |
| --- | --------------------------------------------------------------------- | -------- | -------------------------------------- | ---------- | --------------------------------------- | ------------------------------------------------------------- |
| B1  | `configureWorkSchedule(studentProfileId, scheduleConfig)`             | FR-AT-01 | Kenneth                                | Medium     | `src/lib/services/attendanceService.ts` | [#3](https://github.com/team-beacon-slu/idsms-cis/issues/3)   |
| B2  | `getHolidayCalendarForStudent(studentProfileId)`                      | FR-AT-02 | Gillian                                | Medium     | `src/lib/services/attendanceService.ts` | [#4](https://github.com/team-beacon-slu/idsms-cis/issues/4)   |
| B3  | `markHolidayApplicable(studentProfileId, holidayEntryId, applicable)` | FR-AT-02 | Gillian                                | Easy       | `src/lib/services/attendanceService.ts` | [#5](https://github.com/team-beacon-slu/idsms-cis/issues/5)   |
| B4  | `submitDeviationReport(studentProfileId, data)`                       | FR-AT-03 | Kenneth                                | Medium     | `src/lib/services/attendanceService.ts` | [#6](https://github.com/team-beacon-slu/idsms-cis/issues/6)   |
| B5  | `validateDeviationReport(deviationReportId, facultyId, action)`       | FR-AT-04 | Kenneth                                | Medium     | `src/lib/services/attendanceService.ts` | [#7](https://github.com/team-beacon-slu/idsms-cis/issues/7)   |
| B6  | `computeTotalHoursRendered(studentProfileId)`                         | FR-AT-05 | Danielle                               | Hard       | `src/lib/services/attendanceService.ts` | [#8](https://github.com/team-beacon-slu/idsms-cis/issues/8)   |
| B7  | `computeProjectedCompletionDate(studentProfileId)`                    | FR-AT-05 | Danielle                               | Hard       | `src/lib/services/attendanceService.ts` | [#9](https://github.com/team-beacon-slu/idsms-cis/issues/9)   |
| B8  | `getRequiredHoursConfig(program)`                                     | FR-AT-06 | Gillian                                | Easy       | `src/lib/services/attendanceService.ts` | [#10](https://github.com/team-beacon-slu/idsms-cis/issues/10) |
| B9  | `setRequiredHoursConfig(program, hours)`                              | FR-AT-06 | Gillian                                | Easy       | `src/lib/services/attendanceService.ts` | [#11](https://github.com/team-beacon-slu/idsms-cis/issues/11) |
| B10 | `exportAttendanceLogCsv(studentProfileId)`                            | FR-AT-07 | Shantea23                              | Easy       | `src/lib/services/attendanceService.ts` | [#12](https://github.com/team-beacon-slu/idsms-cis/issues/12) |
| B11 | `requestScheduleChange(studentProfileId, data)`                       | FR-AT-08 | Rhaastas (unassigned — pending invite) | Medium     | `src/lib/services/attendanceService.ts` | [#13](https://github.com/team-beacon-slu/idsms-cis/issues/13) |
| B12 | `validateScheduleChangeFaculty(workPlanId, facultyId, action)`        | FR-AT-09 | Danielle                               | Medium     | `src/lib/services/attendanceService.ts` | [#14](https://github.com/team-beacon-slu/idsms-cis/issues/14) |
| B13 | `approveScheduleChangeCoordinator(workPlanId, coordinatorId, action)` | FR-AT-09 | Danielle                               | Medium     | `src/lib/services/attendanceService.ts` | [#15](https://github.com/team-beacon-slu/idsms-cis/issues/15) |
| B14 | `applyScheduleChangeProspectively(workPlanId)`                        | FR-AT-10 | Danielle                               | Hard       | `src/lib/services/attendanceService.ts` | [#16](https://github.com/team-beacon-slu/idsms-cis/issues/16) |
| B15 | `logScheduleChangeHistory(workPlanId, entry)`                         | FR-AT-11 | Kenneth                                | Easy       | `src/lib/services/attendanceService.ts` | [#17](https://github.com/team-beacon-slu/idsms-cis/issues/17) |

## Module 6 — Weekly & Monthly Report Submission

| #   | Function                                                                             | FR       | Owner                                  | Difficulty | File (planned)                             | Issue                                                         |
| --- | ------------------------------------------------------------------------------------ | -------- | -------------------------------------- | ---------- | ------------------------------------------ | ------------------------------------------------------------- |
| B16 | `generateWeeklyReportForm(studentProfileId, weekStart)`                              | FR-WR-01 | Shantea23                              | Medium     | `src/lib/services/weeklyReportService.ts`  | [#18](https://github.com/team-beacon-slu/idsms-cis/issues/18) |
| B17 | `calculateWeeklyTotalHours(weeklyReportId)`                                          | FR-WR-02 | Kenneth                                | Easy       | `src/lib/services/weeklyReportService.ts`  | [#19](https://github.com/team-beacon-slu/idsms-cis/issues/19) |
| B18 | `calculateRunningTotalAndRemaining(studentProfileId, weeklyReportId)`                | FR-WR-02 | Kenneth                                | Medium     | `src/lib/services/weeklyReportService.ts`  | [#20](https://github.com/team-beacon-slu/idsms-cis/issues/20) |
| B19 | `saveDailyAccomplishment(dailyReportEntryId, hours, accomplishments, studentUserId)` | FR-WR-03 | Ulrich                                 | Easy       | `src/lib/services/weeklyReportService.ts`  | [#21](https://github.com/team-beacon-slu/idsms-cis/issues/21) |
| B20 | `validateLateSubmissionReason(weeklyReportId, reasonForDelay)`                       | FR-WR-05 | Shantea23                              | Easy       | `src/lib/services/weeklyReportService.ts`  | [#22](https://github.com/team-beacon-slu/idsms-cis/issues/22) |
| B21 | `reviewWeeklyReport_Approve(weeklyReportId, facultyId)`                              | FR-WR-06 | Danielle                               | Medium     | `src/lib/services/weeklyReportService.ts`  | [#23](https://github.com/team-beacon-slu/idsms-cis/issues/23) |
| B22 | `reviewWeeklyReport_Return(weeklyReportId, facultyId, notes)`                        | FR-WR-06 | Kenneth                                | Easy       | `src/lib/services/weeklyReportService.ts`  | [#24](https://github.com/team-beacon-slu/idsms-cis/issues/24) |
| B23 | `reviewWeeklyReport_Regard(weeklyReportId, facultyId)`                               | FR-WR-06 | Kenneth                                | Easy       | `src/lib/services/weeklyReportService.ts`  | [#25](https://github.com/team-beacon-slu/idsms-cis/issues/25) |
| B24 | `reviewWeeklyReport_Disregard(weeklyReportId, facultyId)`                            | FR-WR-06 | Danielle                               | Hard       | `src/lib/services/weeklyReportService.ts`  | [#26](https://github.com/team-beacon-slu/idsms-cis/issues/26) |
| B25 | `sendReportStatusEmail(weeklyReportId, action)`                                      | FR-WR-07 | Rhaastas (unassigned — pending invite) | Easy       | `src/lib/services/notificationService.ts`  | [#27](https://github.com/team-beacon-slu/idsms-cis/issues/27) |
| B26 | `checkMonthlyAggregationEligibility(studentProfileId, calendarMonth)`                | FR-WR-08 | Danielle                               | Medium     | `src/lib/services/monthlyReportService.ts` | [#28](https://github.com/team-beacon-slu/idsms-cis/issues/28) |
| B27 | `submitMonthlyReport(studentProfileId, calendarMonth)`                               | FR-WR-08 | Danielle                               | Hard       | `src/lib/services/monthlyReportService.ts` | [#29](https://github.com/team-beacon-slu/idsms-cis/issues/29) |
| B28 | `generateReportPdfPreview(weeklyReportId)`                                           | FR-WR-09 | Ulrich                                 | Medium     | `src/lib/services/weeklyReportService.ts`  | [#30](https://github.com/team-beacon-slu/idsms-cis/issues/30) |
| B29 | `generateReportReferenceCode(weeklyReportId)`                                        | FR-WR-10 | Shantea23                              | Easy       | `src/lib/services/weeklyReportService.ts`  | [#31](https://github.com/team-beacon-slu/idsms-cis/issues/31) |

## Module 12 — Unified Calendar & Timeline Tracking

| #   | Function                                       | FR        | Owner    | Difficulty | File (planned)                        | Issue                                                         |
| --- | ---------------------------------------------- | --------- | -------- | ---------- | ------------------------------------- | ------------------------------------------------------------- |
| B30 | `getUnifiedCalendarEvents(userId, role)`       | FR-CAL-01 | Danielle | Hard       | `src/lib/services/calendarService.ts` | [#32](https://github.com/team-beacon-slu/idsms-cis/issues/32) |
| B31 | `colorCodeCalendarEvents(events)`              | FR-CAL-01 | Matt     | Easy       | `src/lib/services/calendarService.ts` | [#33](https://github.com/team-beacon-slu/idsms-cis/issues/33) |
| B32 | `getStudentCalendarView(studentProfileId)`     | FR-CAL-02 | Ulrich   | Easy       | `src/lib/services/calendarService.ts` | [#34](https://github.com/team-beacon-slu/idsms-cis/issues/34) |
| B33 | `getFacultyCalendarView(facultyId)`            | FR-CAL-03 | Matt     | Medium     | `src/lib/services/calendarService.ts` | [#35](https://github.com/team-beacon-slu/idsms-cis/issues/35) |
| B34 | `detectHighVolumeSubmissionWeeks(facultyId)`   | FR-CAL-03 | Matt     | Medium     | `src/lib/services/calendarService.ts` | [#36](https://github.com/team-beacon-slu/idsms-cis/issues/36) |
| B35 | `getCoordinatorCalendarView(coordinatorId)`    | FR-CAL-04 | Matt     | Medium     | `src/lib/services/calendarService.ts` | [#37](https://github.com/team-beacon-slu/idsms-cis/issues/37) |
| B36 | `detectEndorsementLetterSpikes(coordinatorId)` | FR-CAL-04 | Danielle | Medium     | `src/lib/services/calendarService.ts` | [#38](https://github.com/team-beacon-slu/idsms-cis/issues/38) |

## Front-end components

| #   | Component                                             | FR(s)              | Owner  | Difficulty | File (planned)                                                                            | Issue                                                         |
| --- | ----------------------------------------------------- | ------------------ | ------ | ---------- | ----------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| F1  | `WeeklyReportForm` (daily accomplishment entry UI)    | FR-WR-02, FR-WR-03 | Ulrich | Hard       | `src/app/(dashboard)/students/[studentProfileId]/weekly-reports/weekly-report-form.tsx`   | [#39](https://github.com/team-beacon-slu/idsms-cis/issues/39) |
| F2  | `MonthlyReportView` (aggregation display)             | FR-WR-08           | Matt   | Medium     | `src/app/(dashboard)/students/[studentProfileId]/monthly-reports/monthly-report-view.tsx` | [#40](https://github.com/team-beacon-slu/idsms-cis/issues/40) |
| F3  | `AttendanceScheduleForm` (config + change-request UI) | FR-AT-01, FR-AT-08 | Ulrich | Medium     | `src/app/(dashboard)/students/[studentProfileId]/attendance/schedule-form.tsx`            | [#41](https://github.com/team-beacon-slu/idsms-cis/issues/41) |
| F4  | `DeviationReportForm` (submission + upload UI)        | FR-AT-03           | Ulrich | Medium     | `src/app/(dashboard)/students/[studentProfileId]/attendance/deviation-form.tsx`           | [#42](https://github.com/team-beacon-slu/idsms-cis/issues/42) |
| F5  | `UnifiedCalendarView` (color-coded grid)              | FR-CAL-01–04       | Ulrich | Hard       | `src/app/(dashboard)/calendar/unified-calendar-view.tsx`                                  | [#43](https://github.com/team-beacon-slu/idsms-cis/issues/43) |
| F6  | `AttendanceExportButton` (CSV download trigger)       | FR-AT-07           | Matt   | Easy       | `src/app/(dashboard)/students/[studentProfileId]/attendance/export-button.tsx`            | [#44](https://github.com/team-beacon-slu/idsms-cis/issues/44) |
| F7  | Copy-paste warning client logic (blocking submit UI)  | FR-WR-04           | Matt   | Medium     | `src/app/(dashboard)/students/[studentProfileId]/weekly-reports/copy-paste-warning.ts`    | [#45](https://github.com/team-beacon-slu/idsms-cis/issues/45) |

---

## Schema note — resolved 2026-08-26

`StudentProfile.scheduleId` is a nullable UUID column with no matching relation and no
`Schedule` model anywhere in `schema.prisma` — schedule config is actually stored in
`WorkPlan.scheduleConfig` (Json). **Confirmed: drop this column** in the Phase 3 schema diff,
alongside whatever new fields the attendance/report/calendar models need. Not yet executed —
this happens during the framework build (schema stage), not during task planning.
