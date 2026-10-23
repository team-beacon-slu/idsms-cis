# 10. Roadmap and status

> Draft for adviser review — flows and rules may change; see [README](README.md).

_Last updated: 23 October 2026. Status labels: **Built**, **In progress**, **Planned** (see the [index](README.md))._

The executed roadmap, per-workstream plans and designs are kept for reference in [`docs/archive/`](../archive/README.md). The one active plan is the [Phase 5 lab-server plan](../plans/phase5-lab-server-hosting.md).

## 1. Phases

| Phase | Scope                                                                                                                  | Status                  |
| ----- | ---------------------------------------------------------------------------------------------------------------------- | ----------------------- |
| 0     | Repository, CI, database setup, schema                                                                                 | **Built**               |
| 1     | Accounts, roles, sessions, lockout, password reset, bulk import, RLS                                                   | **Built**               |
| 2     | Companies and MOAs, pre-deployment checklist, work plans, endorsement gate                                             | **Built**               |
| 3     | Schedules, deviations, hours, weekly and monthly reports, unified calendar                                             | **Built** (PR #75, #76) |
| 4     | Feature completion: documents, report flow, notifications, dashboards, compliance, SLU rules, final report, AI, polish | **Built**               |
| 5     | Hosting on a SAMCIS lab computer, optimisation, hardening, UAT. No new features.                                       | **Planned**             |

## 2. Phase 4 workstreams

| Workstream                             | Scope                                                                                                                                                                                                                  | PR                   | Status                                    |
| -------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------- | ----------------------------------------- |
| Plan                                   | Phase 4 roadmap and per-workstream plans                                                                                                                                                                               | #77                  | Merged                                    |
| **A**                                  | Server PDF generation: weekly and monthly report PDFs, reference codes, retry, Download/Regenerate                                                                                                                     | #78                  | **Built**                                 |
| **B**                                  | Report-flow gaps: confirmed vs pending hours, per-day attendance status, time in/out, legal name, supervisor position                                                                                                  | #79                  | **Built**                                 |
| D2 fix                                 | Remove the signed-copy upload; signed copies go to Google Classroom only                                                                                                                                               | #80                  | **Built**                                 |
| **E**                                  | Endorsement letters (single and bulk with password), final report cover                                                                                                                                                | #81                  | **Built**                                 |
| **C**                                  | Notifications: in-app inbox and bell, event triggers, daily cron (deadline reminders, MOA expiry), Resend email when configured                                                                                        | #82                  | **Built**                                 |
| **F**                                  | Role dashboards, Excel exports, weekly summary, semester activate/archive, audit log page                                                                                                                              | #83                  | **Built**                                 |
| **G**                                  | Export Center with password re-check, DSAR (15-day SLA), 3-year file retention review, append-only audit log triggers, login lockout hardening                                                                         | #84                  | **Built**                                 |
| **D7**                                 | Pre-deployment checklist becomes status-only; Return requires a note                                                                                                                                                   | #85                  | **Built**                                 |
| **L1**                                 | Leave & Time Requests, two time ranges per day, SLU credited-hours rules, SLU Weekly Work Report template (with OT/UT sections), Week 1 date, name from school email                                                   | #87                  | **Built**                                 |
| **L2**                                 | Conduct and deductions: SLU deduction matrix (editable), warnings, demerits, violations, suspensions, automatic late/unsupported counts, "Excused" exceptions, optional hours per record                               | #88                  | **Built**                                 |
| **H**                                  | Final Technical Report (FR-FT-01..03), HTE evaluation, certificates tracked as status                                                                                                                                  | #89                  | **Built**                                 |
| **D**                                  | AI advisory: similarity and sentiment hints, advisory only, disabled until the golden-set accuracy test passes                                                                                                         | #90                  | **Built** (off until enabled in settings) |
| Audits                                 | Whole-system audits: security holes, upload checks, FK indexes, time zones, row locks on reviews, monthly-report month-end rule, schedule-change approval buttons, audit-log gaps                                      | #91, #97, #99        | **Built**                                 |
| Framework upgrades                     | Next.js 14 → 16 (closes critical advisories), Tailwind 4, Prisma 7; production dependency audit clean                                                                                                                  | #93, #94             | **Built**                                 |
| Class group & staff management screens | Coordinator or Super Admin creates, renames and deletes class groups and assigns advisers per semester; the import picks the group and semester from lists; the Super Admin creates staff accounts from the Users page | #99, #100, #103      | **Built**                                 |
| Privacy consent                        | Blocking data-privacy notice on first use (RA 10173); agree records time and version, disagree signs out; both audited                                                                                                 | #101                 | **Built**                                 |
| Company duplicates                     | Similar names suggested while registering ("This is my company"); coordinator merges duplicates (interns and MOAs move, the rest hidden)                                                                               | #102                 | **Built**                                 |
| Checklist & MOA settings               | Super Admin chooses required items; new items (proof of corporate legitimacy, internship agreement); per-student "allowed to start before MOA approval" override; MOA as status + dates + Drive link; foreign HTE flag | #105                 | **Built**                                 |
| BEACON visual identity                 | Lighthouse logo, navy palette, display typeface, colour and frosted-glass surfaces, bento home, internship track, settings page                                                                                        | #96, #98, #104, #106 | **Built**                                 |
| Dark mode and navigation               | Light / dark / system theme, collapsible sidebar, staff charts on the home page                                                                                                                                        | #107                 | **Built**                                 |
| Sign-in and passwords                  | Show/hide password, Caps Lock hint, password-manager autocomplete; sign-in email ignores capitals and stray spaces                                                                                                     | #108                 | **Built**                                 |
| Identity and account                   | Staff display names (migration 015), account menu with initials avatar, Account settings (profile, appearance, security, privacy, your data), "Sign out of other devices"                                              | #109                 | **Built**                                 |
| Privacy notice and terms               | Public `/privacy` and `/terms` pages; the consent popup needs a ticked box to agree; new notice version 2026-10-23                                                                                                     | #110                 | **Built**                                 |
| Help and orientation                   | Help page (role FAQ, real contacts, glossary), a distinct tab title per page, "Skip to content" link                                                                                                                   | #111                 | **Built**                                 |
| UX polish                              | Shared page headers, an "internship complete" home state that points to the final report, larger tap targets                                                                                                           | #112                 | **Built**                                 |
| Site footer                            | Links to the SLU website, SLU Portal, Library and Data Protection Office; Help, Privacy and Terms; copyright                                                                                                           | #114, #115           | **Built**                                 |

Quality gates on every merge: type checking, linting, about 1,100 automated tests, `prisma validate` and a production build in CI, plus code review.

## 3. What is next

1. **Adviser answers** to the [open questions](../ADVISER_QUESTIONS.md). Most have working defaults; Q5, Q7, Q10, Q15, Q17 and Q18 need an answer before launch.
2. **Phase 5** lab hosting. **Stage 1 is done** (#123): the Docker stack in `deploy/` builds and runs, and file storage can switch to MinIO with `STORAGE_DRIVER=s3`. The rest waits for answers H1–H6 in the [Phase 5 plan](../plans/phase5-lab-server-hosting.md) and a lab computer.

## 4. Phase 5 plan (Planned)

- The self-hosting stack (Docker: Postgres + pgvector, MinIO, the app, a daily cron container, Caddy) is in `deploy/` and runs locally (Stage 1, #123, replacing PR #50). Supabase stays the default until cutover; the lab computer sets `STORAGE_DRIVER=s3`.
- Make the site reachable off campus over HTTPS (outbound tunnel or an IT-provided address).
- Migrate data and files from Supabase with count checks; keep a 2-week rollback window. Apply every file in `prisma/migrations_manual/` in order (except the Supabase-bucket files 003/004).
- Harden: secrets rotation, re-verify the audit-log triggers, UPS and auto-restart, nightly off-site backups with a tested restore, uptime monitoring, an operations runbook.
- Performance (p95 TTFB ≤ 800 ms with 50 users), test coverage targets, Cypress end-to-end tests and UAT with interns, faculty and coordinators.

## 5. Deferred and backlog items

| Item                                                                              | Source / note                                                        |
| --------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| Two-step sign-in for sensitive actions (FR-UM-05)                                 | Deferred; password re-check used instead (Q24)                       |
| Work plan program-task matching (FR-WP-03)                                        | Deferred                                                             |
| Onboarding tour (NFR-USA-02), maintenance banner (NFR-REL-01)                     | Not built; the Help page covers first-time questions                 |
| Monitoring log: supervisor checks and OJT visitations                             | Backlog (Q13)                                                        |
| Pull-out or mid-internship company transfer                                       | Backlog (Q22)                                                        |
| Withdraw a submitted weekly report to draft                                       | Waiting for the adviser (Q21)                                        |
| Habitual tardiness or absence flag on the faculty dashboard                       | Backlog                                                              |
| "University suspension" calendar type                                             | Backlog (Q14)                                                        |
| Coordinator-posted department events on students' calendars                       | Backlog                                                              |
| Notification email preferences per user                                           | Backlog; email itself waits for a sending domain (Q15)               |
| Calendar feed (`.ics`) for phone calendars                                        | Backlog                                                              |
| Monthly journal in SLU's template                                                 | Waiting for the template (Q7)                                        |
| Leave, OT and UT proof: upload vs Google Classroom                                | Pending confirmation (Q19); today a proof file can still be uploaded |
| Out of scope: allowance, group applications, international deployment (CHED-SIAP) | PRD and SLU guidelines review                                        |
