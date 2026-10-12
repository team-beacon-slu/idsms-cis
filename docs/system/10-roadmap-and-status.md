# 10. Roadmap and status

_Last updated: 12 October 2026. Status labels: **Built**, **In progress**, **Planned** (see the [index](README.md))._

Detailed plans live in `docs/superpowers/plans/` (umbrella plan: `2026-10-11-phase4-roadmap.md`) and designs in `docs/superpowers/specs/`.

## 1. Phases

| Phase | Scope                                                                                                          | Status                      |
| ----- | -------------------------------------------------------------------------------------------------------------- | --------------------------- |
| 0     | Repository, CI, database setup, schema                                                                         | **Built**                   |
| 1     | Accounts, roles, sessions, lockout, password reset, bulk import, RLS                                           | **Built**                   |
| 2     | Companies and MOAs, pre-deployment checklist, work plans, endorsement gate                                     | **Built**                   |
| 3     | Schedules, deviations, hours, weekly and monthly reports, unified calendar                                     | **Built** (PR #75, #76)     |
| 4     | Feature completion: documents, report flow, notifications, dashboards, compliance, SLU rules, final report, AI | Mostly **Built**; see below |
| 5     | Hosting on a SAMCIS lab computer, optimisation, hardening, UAT. No new features.                               | **Planned**                 |

## 2. Phase 4 workstreams

| Workstream               | Scope                                                                                                                                                                                                                  | PR  | Status                      |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --- | --------------------------- |
| Plan                     | Phase 4 roadmap and per-workstream plans                                                                                                                                                                               | #77 | Merged                      |
| **A**                    | Server PDF generation: weekly and monthly report PDFs, reference codes, retry, Download/Regenerate                                                                                                                     | #78 | **Built**                   |
| **B**                    | Report-flow gaps: confirmed vs pending hours, per-day attendance status, time in/out, legal name, supervisor position                                                                                                  | #79 | **Built**                   |
| D2 fix                   | Remove the signed-copy upload; signed copies go to Google Classroom only                                                                                                                                               | #80 | **Built**                   |
| **E**                    | Endorsement letters (single and bulk with password), final report cover                                                                                                                                                | #81 | **Built**                   |
| **C**                    | Notifications: in-app inbox and bell, event triggers, daily cron (deadline reminders, MOA expiry), Resend email when configured                                                                                        | #82 | **Built**                   |
| **F**                    | Role dashboards, Excel exports, weekly summary, semester activate/archive, audit log page                                                                                                                              | #83 | **Built**                   |
| **G**                    | Export Center with password re-check, DSAR (15-day SLA), 3-year file retention review, append-only audit log triggers, login lockout hardening                                                                         | #84 | **Built**                   |
| **D7**                   | Pre-deployment checklist becomes status-only; Return requires a note                                                                                                                                                   | #85 | **Built**                   |
| **L1**                   | Leave & Time Requests, two time ranges per day, SLU credited-hours rules, SLU Weekly Work Report template (with OT/UT sections), Week 1 date, name from school email                                                   | —   | **In progress**             |
| Checklist & MOA settings | Super Admin chooses required items; new items (proof of corporate legitimacy, internship agreement); per-student "allowed to start before MOA approval" override; MOA as status + dates + Drive link; foreign HTE flag | —   | **Planned** (next after L1) |
| **L2**                   | Conduct and deductions: SLU deduction matrix (editable), warnings, demerits, violations, suspensions, automatic late/unsupported counts, "Excused" exceptions, optional hours per record                               | —   | **Planned**                 |
| **H**                    | Final Technical Report (FR-FT-01..03), HTE evaluation, certificates tracked as status                                                                                                                                  | —   | **Planned**                 |
| **D**                    | AI advisory: similarity and sentiment hints, advisory only, disabled until the golden-set accuracy test passes                                                                                                         | —   | **Planned**, optional, last |

Quality gates on every merge: type checking, linting, about 700 automated tests, `prisma validate` and a production build in CI, plus code review.

## 3. What is next

1. **Finish L1** (In progress): migration 008 (applied only with the PM's approval), time maths and shift, credited hours, request service and tab, submit gate for tardiness, SLU weekly report template. Acceptance includes the three SLU worked examples (8 h; 7 h 30 m with undertime; 8 h).
2. **Checklist & MOA settings** (Planned).
3. **L2** deductions (Planned), after the adviser answers Q9–Q12.
4. **H** final technical report (Planned).
5. **D** AI advisory (Planned, optional), only if Q16 is approved and the golden set is labelled.
6. **Phase 5** lab hosting (Planned), after the Phase 4 feature freeze.

If time runs short, the agreed cut order is: D first, then H, then the "Should" dashboard items, then email (keeping in-app notifications).

## 4. Phase 5 plan (Planned)

- Adapt the self-hosting stack from PR #50 (Docker: Postgres + pgvector, MinIO, the app, Caddy) to a lab computer.
- Make the site reachable off campus over HTTPS (outbound tunnel or an IT-provided address).
- Migrate data and files from Supabase with count checks; keep a 2-week rollback window.
- Harden: secrets rotation, re-verify the audit-log triggers, UPS and auto-restart, nightly off-site backups with a tested restore, uptime monitoring, an operations runbook.
- Performance (p95 TTFB ≤ 800 ms with 50 users), test coverage targets and UAT with interns, faculty and coordinators.

## 5. Deferred and backlog items

| Item                                                                                                                | Source / note                                       |
| ------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------- |
| MFA for sensitive actions (FR-UM-05)                                                                                | Deferred; password re-check used instead            |
| Company name autocomplete and duplicate detection (FR-MOA-02)                                                       | Deferred                                            |
| Work plan program-task matching (FR-WP-03)                                                                          | Deferred                                            |
| Consent logging during orientation (FR-CK-05, NFR-DP-03)                                                            | Not built; to confirm whether still needed under D7 |
| Onboarding tour (NFR-USA-02), maintenance banner (NFR-REL-01)                                                       | Not built                                           |
| Monitoring log: supervisor checks and OJT visitations                                                               | Backlog (Q13)                                       |
| Habitual tardiness or absence flag on the faculty dashboard                                                         | Backlog (after L1 records tardiness)                |
| "University suspension" calendar type                                                                               | Backlog (Q14)                                       |
| Coordinator-posted department events on students' calendars                                                         | Backlog                                             |
| Monthly journal in SLU's template                                                                                   | Waiting for the template (Q7)                       |
| Screens for class groups, faculty assignments and single staff accounts                                             | Not built; to confirm how they are maintained       |
| Email to students                                                                                                   | Waiting for a sending domain (Q15)                  |
| Out of scope: allowance, group applications, international deployment (CHED-SIAP), company transfers mid-internship | PRD and SLU guidelines review                       |
