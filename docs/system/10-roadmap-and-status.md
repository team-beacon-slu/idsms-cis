# 10. Roadmap and status

> Draft for adviser review — flows and rules may change; see [README](README.md).

_Last updated: 22 October 2026. Status labels: **Built**, **In progress**, **Planned** (see the [index](README.md))._

Detailed plans live in `docs/superpowers/plans/` (umbrella plan: `2026-10-11-phase4-roadmap.md`) and designs in `docs/superpowers/specs/`.

## 1. Phases

| Phase | Scope                                                                                                          | Status                                               |
| ----- | -------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| 0     | Repository, CI, database setup, schema                                                                         | **Built**                                            |
| 1     | Accounts, roles, sessions, lockout, password reset, bulk import, RLS                                           | **Built**                                            |
| 2     | Companies and MOAs, pre-deployment checklist, work plans, endorsement gate                                     | **Built**                                            |
| 3     | Schedules, deviations, hours, weekly and monthly reports, unified calendar                                     | **Built** (PR #75, #76)                              |
| 4     | Feature completion: documents, report flow, notifications, dashboards, compliance, SLU rules, final report, AI | **Built**, except Checklist & MOA settings (Planned) |
| 5     | Hosting on a SAMCIS lab computer, optimisation, hardening, UAT. No new features.                               | **Planned**                                          |

## 2. Phase 4 workstreams

| Workstream                             | Scope                                                                                                                                                                                                                  | PR              | Status                                    |
| -------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------- | ----------------------------------------- |
| Plan                                   | Phase 4 roadmap and per-workstream plans                                                                                                                                                                               | #77             | Merged                                    |
| **A**                                  | Server PDF generation: weekly and monthly report PDFs, reference codes, retry, Download/Regenerate                                                                                                                     | #78             | **Built**                                 |
| **B**                                  | Report-flow gaps: confirmed vs pending hours, per-day attendance status, time in/out, legal name, supervisor position                                                                                                  | #79             | **Built**                                 |
| D2 fix                                 | Remove the signed-copy upload; signed copies go to Google Classroom only                                                                                                                                               | #80             | **Built**                                 |
| **E**                                  | Endorsement letters (single and bulk with password), final report cover                                                                                                                                                | #81             | **Built**                                 |
| **C**                                  | Notifications: in-app inbox and bell, event triggers, daily cron (deadline reminders, MOA expiry), Resend email when configured                                                                                        | #82             | **Built**                                 |
| **F**                                  | Role dashboards, Excel exports, weekly summary, semester activate/archive, audit log page                                                                                                                              | #83             | **Built**                                 |
| **G**                                  | Export Center with password re-check, DSAR (15-day SLA), 3-year file retention review, append-only audit log triggers, login lockout hardening                                                                         | #84             | **Built**                                 |
| **D7**                                 | Pre-deployment checklist becomes status-only; Return requires a note                                                                                                                                                   | #85             | **Built**                                 |
| **L1**                                 | Leave & Time Requests, two time ranges per day, SLU credited-hours rules, SLU Weekly Work Report template (with OT/UT sections), Week 1 date, name from school email                                                   | #87             | **Built**                                 |
| Checklist & MOA settings               | Super Admin chooses required items; new items (proof of corporate legitimacy, internship agreement); per-student "allowed to start before MOA approval" override; MOA as status + dates + Drive link; foreign HTE flag | —               | **Planned** (next after L1)               |
| Class group & staff management screens | Coordinator or Super Admin creates, renames and deletes class groups and assigns advisers per semester; the import picks the group and semester from lists; the Super Admin creates staff accounts from the Users page | #99, #100, #103 | **Built**                                 |
| **L2**                                 | Conduct and deductions: SLU deduction matrix (editable), warnings, demerits, violations, suspensions, automatic late/unsupported counts, "Excused" exceptions, optional hours per record                               | #88             | **Built**                                 |
| **H**                                  | Final Technical Report (FR-FT-01..03), HTE evaluation, certificates tracked as status                                                                                                                                  | —               | **Built**                                 |
| **D**                                  | AI advisory: similarity and sentiment hints, advisory only, disabled until the golden-set accuracy test passes                                                                                                         | —               | **Built** (off until enabled in settings) |
| Audits                                 | Two whole-system audits: upload checks, FK indexes, time zones, row locks on reviews, monthly-report month-end rule, schedule-change approval buttons, audit-log gaps                                                  | #97, #99, #103  | **Built**                                 |
| Privacy consent                        | Blocking data-privacy notice on first use (RA 10173); agree records time and version, disagree signs out; both audited                                                                                                 | #101            | **Built**                                 |
| Company duplicates                     | Similar names suggested while registering ("This is my company"); coordinator merges duplicates (interns and MOAs move, the rest hidden)                                                                               | #102            | **Built**                                 |

Quality gates on every merge: type checking, linting, about 1,000 automated tests, `prisma validate` and a production build in CI, plus code review.

## 3. What is next

1. **Checklist & MOA settings** (Planned, the last Phase 4 item): required items chosen by the Super Admin, the two new items, the per-student "allowed to start before MOA approval" override, MOA as status + dates + Drive link, and the foreign HTE flag.
2. **Phase 5** lab hosting (Planned). Stage 1 (bringing the PR #50 Docker stack up to date) needs no lab computer; the rest waits for answers H1–H6 in the Phase 5 plan.

## 4. Phase 5 plan (Planned)

- Adapt the self-hosting stack from PR #50 (Docker: Postgres + pgvector, MinIO, the app, Caddy) to a lab computer.
- Make the site reachable off campus over HTTPS (outbound tunnel or an IT-provided address).
- Migrate data and files from Supabase with count checks; keep a 2-week rollback window.
- Harden: secrets rotation, re-verify the audit-log triggers, UPS and auto-restart, nightly off-site backups with a tested restore, uptime monitoring, an operations runbook.
- Performance (p95 TTFB ≤ 800 ms with 50 users), test coverage targets and UAT with interns, faculty and coordinators.

## 5. Deferred and backlog items

| Item                                                                                                                | Source / note                                                                                                                |
| ------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| MFA for sensitive actions (FR-UM-05)                                                                                | Deferred; password re-check used instead                                                                                     |
| Company name autocomplete and duplicate detection (FR-MOA-02)                                                       | **Built** (#102): suggestions while typing, coordinator merge                                                                |
| Work plan program-task matching (FR-WP-03)                                                                          | Deferred                                                                                                                     |
| Consent logging (FR-CK-05, NFR-DP-03)                                                                               | **Built** (#101): in-app privacy notice, agreement logged with time and version; consent forms stay in Google Classroom (D7) |
| Onboarding tour (NFR-USA-02), maintenance banner (NFR-REL-01)                                                       | Not built                                                                                                                    |
| Monitoring log: supervisor checks and OJT visitations                                                               | Backlog (Q13)                                                                                                                |
| Habitual tardiness or absence flag on the faculty dashboard                                                         | Backlog (after L1 records tardiness)                                                                                         |
| "University suspension" calendar type                                                                               | Backlog (Q14)                                                                                                                |
| Coordinator-posted department events on students' calendars                                                         | Backlog                                                                                                                      |
| Monthly journal in SLU's template                                                                                   | Waiting for the template (Q7)                                                                                                |
| Screens for class groups, faculty assignments and single staff accounts                                             | **Built** (see section 2)                                                                                                    |
| Email to students                                                                                                   | Waiting for a sending domain (Q15)                                                                                           |
| Leave, OT and UT proof: upload vs Google Classroom                                                                  | Pending confirmation (Q19); today a proof file can still be uploaded                                                         |
| Out of scope: allowance, group applications, international deployment (CHED-SIAP), company transfers mid-internship | PRD and SLU guidelines review                                                                                                |
