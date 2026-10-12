# 01. Product overview

_Last updated: 12 October 2026. Status labels: **Built**, **In progress**, **Planned** (see the [index](README.md))._

## 1. What IDSMS-CIS is

IDSMS-CIS (Internship Document Submission and Monitoring System for CIS) is a website for Saint Louis University's School of Accountancy, Management, Computing and Information Studies (SAMCIS). It manages the student internship (OJT) process for three programs: **BSIT, BSCS and BMMA**.

It replaces a process that today runs mostly on Google Classroom, email and spreadsheets with one place where:

- students record their attendance and weekly work reports,
- faculty advisers review those reports and track each student's progress,
- the coordinator manages host companies (HTEs) and their MOAs,
- the system computes hours, flags late reports, sends reminders and produces the official PDF documents.

The internship process is governed by **CHED CMO No. 104, s. 2017** (the Student Internship Program in the Philippines, SIPP) and SLU's own internship guidelines. Personal data is handled under the **Data Privacy Act of 2012 (RA 10173)**.

## 2. The problem it solves at SAMCIS

From the PRD's problem statement (based on interviews with interns; the PRD notes the sample was small and the figures are anecdotal):

| Pain point today                                                                     | How IDSMS addresses it                                                                                 |
| ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------ |
| MOA processing is a bottleneck, handled by email with no status tracking             | Companies and MOA records with lifecycle stages and expiry alerts                                      |
| Late submissions because Google Classroom bins close; workarounds via chat and email | Weekly reports in IDSMS with a fixed Tuesday deadline, a late flag and a required "reason for delay"   |
| Errors in submissions: wrong dates, mismatched hour counts                           | Forms generated from the student's schedule; hours computed by the system, not typed into a total      |
| Review turnaround of 2 days to 2 weeks with no consolidated feedback                 | Review queue on the faculty dashboard; Approve / Return / Regard / Disregard with notes; notifications |
| No live compliance view; coordinators consolidate spreadsheets by hand               | Role dashboards with status per student, filters and Excel exports                                     |
| Final documents produced manually with no traceability                               | Server-generated PDFs with reference codes (weekly, monthly, endorsement letter, final report cover)   |
| Students can start deployment before all requirements are verified                   | Endorsement letter is blocked until every pre-deployment checklist item is approved                    |

## 3. Users and roles

IDSMS has four roles. Every screen and every server action checks the role, and staff only see students they are allowed to see.

| Role                       | Who                                                 | Main jobs in IDSMS                                                                                                     |
| -------------------------- | --------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| **Student intern**         | BSIT, BSCS or BMMA student on internship            | Checklist status, work plan, schedule, daily time record, weekly and monthly reports, PDFs, data request               |
| **Faculty adviser**        | Faculty member assigned to one or more class groups | Review checklist items and weekly reports, validate deviation reports, generate endorsement letters, exports           |
| **Department coordinator** | SAMCIS internship coordinator                       | Department dashboard, users and bulk import, companies and MOAs, work plan approval, schedule-change approval, exports |
| **Super Admin**            | System administrator                                | Everything the coordinator does, plus settings, semesters, audit log, Export Center, data requests and file retention  |

Host companies (HTE supervisors) have **no account** in IDSMS. This is out of scope in the PRD. Their signatures go on paper copies, which are kept in Google Classroom (decision D2).

## 4. Goals

From the PRD, in plain terms:

1. One purpose-built platform for the whole internship lifecycle, aligned with SIPP.
2. Compliance gating: no endorsement letter until the pre-deployment requirements are approved.
3. Automatic hour computation and schedule tracking, to remove manual calculation errors.
4. Live, role-specific dashboards and a unified calendar.
5. Traceable documents with system reference codes.
6. Less administrative work through structured workflows, notifications and bulk operations.
7. Full history per semester for audit and accreditation.
8. Compliance with RA 10173 and SLU's data privacy policy.
9. (Optional, last) AI hints for faculty, advisory only.

## 5. Scope

### In scope

Accounts and security; companies and MOAs; the pre-deployment checklist (status only, see D7); work plans and schedules; attendance and hour computation; weekly and monthly reports; PDF generation; notifications; dashboards and exports; the unified calendar; data privacy features (data requests, retention, audit log). Planned additions are the SLU leave and time request process, the SLU deduction matrix, the final technical report and the optional AI advisory.

### Out of scope

- A native mobile app (the website works on phone browsers).
- A portal for HTE supervisors.
- Any automated grading or approval by AI.
- Storing signed or sensitive documents (decisions D2 and D7). These stay in Google Classroom.
- Integration with other learning systems beyond Google Classroom as a companion.
- Multiple institutions or departments beyond SAMCIS CIS programs in this version.
- Mid-internship company transfers (handled manually by the coordinator).
- Allowance and remuneration, group applications and international deployment (CHED-SIAP).

## 6. Modules, status and requirements

PRD requirement IDs are listed so readers can trace each module back to `PRD.md`.

| #   | Module                                 | What it does                                                                                                                                                             | PRD requirements                      | Status                                                                                                                    |
| --- | -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| 1   | Accounts, roles and security           | Four roles, bulk student import, default passwords, forced first-login password change, 30-minute sessions, lockout, password reset, audit log                           | FR-UM-01..04, 06..11                  | **Built** (Phase 1). MFA (FR-UM-05) deferred; sensitive actions use a password re-check instead.                          |
| 2   | Companies and MOAs                     | Company profiles, MOA records with lifecycle stages and validity dates, company verification, MOA expiry alerts                                                          | FR-MOA-01, 03, 04, 05, 06, 07         | **Built** (Phase 2; expiry alerts Phase 4 C). Duplicate detection (FR-MOA-02) deferred. MOA settings changes **Planned**. |
| 3   | Pre-deployment checklist               | 9 requirements per student, Approved / Returned with a note, completion percentage, endorsement gate                                                                     | FR-CK-01..04, 06                      | **Built**. Status-only since D7 (PR #85). Optional/required items and the endorsement override are **Planned**.           |
| 4   | Work plan                              | Student submits planned tasks; coordinator approves or returns; approved plan is locked; schedule set from it                                                            | FR-WP-01, 02, 04, 05, 06              | **Built**. Program-task matching (FR-WP-03) deferred.                                                                     |
| 5   | Attendance and hours                   | Schedule, PH holidays, deviation reports, confirmed vs pending hours, projected completion date, CSV export, schedule changes                                            | FR-AT-01..11                          | **Built**. SLU credited-hours rules and Leave & Time Requests are **In progress** (L1).                                   |
| 6   | Weekly and monthly reports             | Weekly form from the schedule, Tuesday deadline and late reason, four review actions, monthly aggregation, copy-paste warning                                            | FR-WR-01..10                          | **Built**. SLU Weekly Work Report template is **In progress** (L1).                                                       |
| 7   | Final technical report                 | Unlocks near the required hours; company profile, evaluation scores, proof; coordinator review                                                                           | FR-FT-01..03                          | Final report **cover** PDF **Built** (Phase 4 E). The report itself is **Planned** (Workstream H).                        |
| 8   | Document generation                    | Server-side PDFs with reference codes and retry: weekly, monthly, endorsement letter (single and bulk), final report cover                                               | FR-DG-01..07                          | **Built** (Phase 4 A and E).                                                                                              |
| 9   | AI advisory                            | Similarity and sentiment hints for faculty, advisory only                                                                                                                | FR-AI-01..07, NFR-AI-01..04           | **Planned** (Workstream D, optional, needs approvals; see Q16).                                                           |
| 10  | Dashboards and monitoring              | Student, faculty, coordinator and admin dashboards, Excel exports, weekly summary, semester activate/archive, history retention                                          | FR-DB-01..08                          | **Built** (Phase 4 F).                                                                                                    |
| 11  | Notifications                          | In-app inbox and bell, event triggers, daily reminder job, email via Resend when a sending domain exists                                                                 | FR-NT-01..05                          | **Built** (Phase 4 C). Email delivery to students waits on a sending domain (Q15).                                        |
| 12  | Unified calendar                       | Role-specific calendar of deadlines, holidays, approved deviations and projected completion                                                                              | FR-CAL-01..04                         | **Built** (Phase 3).                                                                                                      |
| —   | Data privacy and compliance            | Export Center with password re-check, "Request my data" with a 15-day deadline, 3-year file retention review, tamper-proof audit log                                     | NFR-DP-05..08, NFR-SEC-05, 07, 10, 11 | **Built** (Phase 4 G).                                                                                                    |
| —   | Leave & Time Requests, SLU hours rules | Leave, overtime and undertime requests; two time ranges per day; SLU weekly report layout; credited-hours rules                                                          | FR-AT-03..05, SLU slides, decisions   | **In progress** (Workstream L1).                                                                                          |
| —   | Conduct and deductions                 | SLU deduction matrix (ADVISER and WWR points), warnings, demerits, violations, suspensions, "Excused" exceptions                                                         | SLU slide, decisions                  | **Planned** (Workstream L2).                                                                                              |
| —   | Checklist & MOA settings               | Super Admin chooses required items; new items; per-student endorsement override; MOA as status + dates + Drive link; foreign HTE flag                                    | Decisions                             | **Planned** (next after L1).                                                                                              |
| —   | Class group & staff management screens | Faculty or Super Admin can create class groups, assign faculty to class groups, and create staff accounts (today: no screens; staff accounts only via `POST /api/users`) | FR-UM-01, FR-UM-02                    | **Planned** (after L1, alongside Checklist & MOA settings; Q20)                                                           |
| —   | Lab-computer hosting                   | Move from Vercel and Supabase to a dedicated SAMCIS lab computer                                                                                                         | Phase 5 plan                          | **Planned** (Phase 5).                                                                                                    |

## 7. Success criteria

The project is successful when:

- **Compliance gate holds.** No endorsement letter can be produced, by screen or by direct request, until the student's checklist items are approved.
- **Hours are trustworthy.** Rendered hours are computed by the system from reports the faculty has approved, never typed as a total, and follow SLU's rules (the SLU credited-hours rules arrive with L1).
- **Reports are on time and traceable.** Every submitted weekly report has a reference code, a submission time and a late flag where applicable; PDFs carry the same code.
- **Staff have a live view.** Faculty and the coordinator can see, without spreadsheets, who is on track, who needs attention and which reports are waiting.
- **Privacy holds.** No signed or medical documents are stored; exports need a password re-check and are logged; the audit log cannot be edited; data requests are answered within 15 days.
- **Quality gates pass.** Type checking, linting, automated tests and a production build pass on every change (Phase 5 adds performance targets and UAT sign-off; see [10](10-roadmap-and-status.md)).
- **Users accept it.** Phase 5 user acceptance testing with interns, faculty and coordinators passes.

## 8. Constraints

| Constraint                               | Effect on the design                                                                                                                                                        |
| ---------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **RA 10173 (Data Privacy Act)**          | Data minimisation, need-to-know access, audit log, data subject requests (15 days), retention review. See [09](09-security-and-privacy.md).                                 |
| **SLU internship guidelines**            | Required hours (IT 600, MMA 500), weekly report due Tuesday, SLU weekly report format, OT/UT and leave rules, deduction matrix (the last three are In progress or Planned). |
| **CHED CMO 104, s. 2017 (SIPP)**         | Pre-deployment requirements, MOA with each HTE, supervision and documentation.                                                                                              |
| **Decisions D2 and D7**                  | IDSMS never stores signed copies, signatures, medical certificates or psychological records. Students submit those in Google Classroom.                                     |
| **Capstone team and timeline**           | An 8-person team; a single "modular monolith" application rather than microservices; features prioritised with MoSCoW.                                                      |
| **Free-tier hosting during development** | Vercel Hobby allows one scheduled job per day, so all reminders run in one daily job. Supabase free tier has 1 GB storage, so file sizes are capped (5 MB PDF, 2 MB image). |
| **Email**                                | Email to students needs a verified sending domain. Until SLU provides one, notifications are in-app only.                                                                   |
| **Phase 5 hosting**                      | All code follows "portability rules" so it can move to a lab computer by configuration, not a rewrite.                                                                      |
