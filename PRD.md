# Product Requirements Document

# IDSMS-CIS: Internship Document Submission and Monitoring System for CIS

**Version:** 1.3 _(Pre-Build Hardening: Session Revocation, Prioritization, AI Evaluation Spec)_  
**Date:** August 2026  
**Institution:** Saint Louis University — SAMCIS  
**Course:** IT 321  
**Team (Team Beacon):**

- Abanador, Frencine Daine L.
- Andres, James Matthew S.
- Antonio, Shantea Myles C.
- Aragon, Danielle John P.
- Avaricio, Kenneth Russel C.
- Domenden, Gillian D.
- Gayaso, Ulrich L.
- Suarez, Steven Dale O.

**Project Adviser:** Ria Andrea N. Fernandez

---

## Revision Notes (v1.2 → v1.3)

This revision resolves every open defect from the pre-build architecture and product-management review, applied before any code is written:

| #   | Change                                                                                      | Why                                                                                                                                                                                                                                                                                                                                                                              |
| --- | ------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **Auth strategy changed from stateless JWT to NextAuth database sessions** (Prisma Adapter) | v1.2 required both stateless JWT (FR-UM-05/06) and instant account lockout — JWTs can't be revoked before natural expiry without a live DB check, which defeats the point of choosing JWT. Database sessions give immediate revocation natively, using infrastructure (Prisma + Postgres) already in the stack. See new FR-UM-11, updated NFR-SEC-08, and two new schema tables. |
| 2   | **NFR-MNT-02 reworded** from "physically distinct" to "logically distinct"                  | The stated requirement contradicted the stated architecture (`pgvector` inside the same Supabase Postgres instance). Rewording matches what's actually being built — a separate vector database would be over-engineering at this scale.                                                                                                                                         |
| 3   | **Priority column (MoSCoW) added to all 12 Functional Requirement modules**                 | v1.2 sequenced 12 modules into fixed sprint phases with no documented prioritization framework — no answer to "what gets cut if a phase slips."                                                                                                                                                                                                                                  |
| 4   | **New AI Quality & Evaluation NFR subsection (NFR-AI-01–04)**                               | FR-AI-01/02 defined a similarity mechanism and a threshold (0.70) with no evaluation spec — no golden set, no accuracy target, no calibration procedure.                                                                                                                                                                                                                         |
| 5   | **Interview-count caveat NOT added** — deferred by team decision                            | The Problem Statement's n=3 interview stats remain unchanged; the team does not have time before build to re-run discovery interviews. This is a known, accepted gap — not a resolved one. Treat the percentages in the Problem Statement as anecdotal, not statistically validated.                                                                                             |

---

## Problem Statement

Saint Louis University's SAMCIS department oversees internship programs for three degree programs — BSIT (600 hours), BSCS (240 hours), and BMMA (500 hours) — all of which are governed by CHED CMO No. 104, Series of 2017 (the Student Internship Program in the Philippines / SIPP). The internship lifecycle spans three phases: **pre-deployment**, **active deployment**, and **post-deployment**, each requiring structured document submission, review, and approval workflows involving students, faculty advisers, department coordinators, and host training establishments (HTEs).

Currently, the institution relies primarily on **Google Classroom** supplemented by email, spreadsheets, and manual processes. This general-purpose platform was designed for coursework management and lacks the compliance-enforcement capabilities required by SIPP. Specific, documented pain points derived from student intern interviews include:

- **100%** of interviewed interns found MOA processing a major deployment bottleneck, with back-and-forth communication handled entirely via email with no status tracking.
- **66.7%** experienced late submission incidents caused by closed Google Classroom submission bins, forcing informal workarounds via private comments, Google Chat, or email.
- **66.7%** reported errors in submissions — missing signatures, incorrect dates, mismatched hour counts — requiring manual revision loops with no structured tracking.
- Faculty review turnaround ranges from **2 days to 2 weeks**, with no consolidated feedback view for students.
- No live compliance dashboard exists; coordinators must manually consolidate submission statuses across multiple Classroom entries using spreadsheets.
- Final report generation is entirely manual, using school-provided templates with no traceability codes or automated output.

The result is a fragmented, high-administrative-overhead workflow with limited visibility, inconsistent turnaround times, and no compliance gating — meaning students can begin deployment without all required documents being verified.

---

## Goals

- Centralize the entire internship lifecycle (pre-deployment through post-deployment) into a single, purpose-built web platform aligned with the SIPP regulatory framework.
- Enforce compliance gating: no student may progress to active deployment without all nine pre-deployment checklist items being approved.
- Automate hour computation, attendance tracking, and schedule adherence monitoring to eliminate manual calculation errors.
- Provide real-time, role-specific compliance dashboards and a **Unified Calendar** for students, faculty advisers, department coordinators, and super admins to intuitively track activities and anticipate OJT completion dates.
- Integrate assistive AI features (similarity detection and sentiment analysis) as advisory indicators to support — not replace — faculty judgment during report review.
- Automate document generation (endorsement letters, weekly/monthly report PDFs, final report cover pages) with system-generated reference codes for accreditation traceability.
- Reduce administrative burden on faculty advisers and coordinators through structured workflows, notifications, and bulk operations.
- Maintain full historical data per semester for institutional audit and accreditation support.
- Comply with the Philippine Data Privacy Act of 2012 (RA 10173) and SLU's institutional data privacy policy.

---

## Primary Users

| Role                       | Description                                                                                                                                                                            |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Student Intern**         | BSIT, BSCS, or BMMA student undergoing internship. Most active user across all phases.                                                                                                 |
| **Faculty Adviser**        | SLU faculty member assigned to one or more class groups. Reviews checklist items, weekly/monthly reports, deviation reports, and generates endorsement letters.                        |
| **Department Coordinator** | SAMCIS staff overseeing internship program compliance. Approves work plans, manages MOA records, bulk-enrolls students, and monitors department-wide compliance.                       |
| **Super Admin**            | System administrator. Manages all user accounts, roles, system-wide configurations, semester archiving, and audit logs. Has exclusive access to the Export Center and system settings. |

> **Out of scope user:** Company/HTE supervisors do not have a portal in v1.0.

---

## User Needs

### Student Intern

- Know exactly which pre-deployment documents are required, their current approval status, and what action is needed.(Medical cert(_), Psych Cert(_), Work Plan(_), moa, data privacy cert, undertaking(parent consent), goverment issued company permit (_), company reply form ) {give super admin control to be more flexible on submission of predeployment}
- Submit weekly and monthly accomplishment reports through structured, auto-populated forms without needing to remember the format.(Appeal box where they submit their reason for late submission, (over time, under time, and absent)have template to be auto-populated)
- See a real-time count of hours rendered vs. hours required, and a projected completion date.
- Receive timely email and in-app notifications when reports are deadlines are approaching.
- Track of version editing
- Download their attendance log as CSV.
- Preview and confirm their report as a PDF before final submission.
- View a unified calendar to track deadlines, holidays, and their projected OJT completion date.
- enable change of work plan schedule(with approval and/or prior proof or prior communication)

### Faculty Adviser

- See a single dashboard view of all assigned students' compliance status, hours progress, and report submission state.(able to see multiple class)
- Access a department-wide compliance dashboard spanning all three programs (BSIT, BSCS, BMMA).
- Review weekly reports with AI-generated similarity and sentiment flags surfaced inline — without having to toggle to a separate tool.
- Approve or return individual pre-deployment checklist items with written comments.
- Validate or reject deviation reports (absences, overtime, undertime) before they affect hour computation.
- Generate individual or bulk endorsement letters in PDF format for eligible students.
- Export class-group compliance reports to Excel.
- View a calendar aggregating submission deadlines for all assigned class groups.

### Department Coordinator

- Approve or return student work plans, verifying that planned tasks match the student's enrolled program.(IT/CS/MMA)
- Manage MOA records including upload, validity tracking, and automated expiry alerts, and coverage program(IT/CS/MMA).
- Bulk-enroll students via CSV upload linked to official SLU class codes.
- Approve or return final technical reports.
- Access a department-wide compliance dashboard spanning all three programs (BSIT, BSCS, BMMA).
- Export full compliance reports in Excel or CSV format.
- View a calendar displaying department-wide milestones, MOA expirations, and clustered projected completion dates.

### Super Admin

- Manage all user accounts, assign and modify roles.
- Configure system-wide settings: required completion hours per program, similarity detection thresholds, deadline reminder intervals, MOA expiry alert days, session timeout.
- Create and archive semester records.
- Access the immutable audit log for all system activity.
- Perform bulk data exports (all students, all reports, audit log, MOA records, user accounts, AI flag summary) requiring MFA confirmation.

---

## Scope

### In Scope

- **Authentication & User Management:** Role-based access control (RBAC) for four roles, institutional email login, MFA (OTP/email), first-login password enforcement, session auto-expiry, bulk student CSV/Excel import, immutable audit logging for login and role events, and password reset flow.
- **Company Profile & MOA Management:** Company registration with autocomplete and duplicate detection, MOA upload (PDF/Drive link), MOA lifecycle stage tracking, automated expiry alerts.
- **Pre-Deployment Checklist:** Per-student tracking of all nine required documents, faculty approve/return/comment per item, real-time completion percentage, endorsement letter gating (blocked until all nine items approved), consent logging for Data Privacy and Internship Orientation.
- **Work Plan Submission & Approval:** Student submission using institutional template, coordinator review/approval/return, program-task alignment verification, endorsement letter draft queuing on approval, fixed schedule derived from approved work plan.
- **Attendance & Time Tracking:** Calendar-based schedule with Philippine national/regional holidays and company non-working days, deviation reports with proof attachments and faculty validation, automated hour computation, configurable required hours per program via admin UI, and mid-internship schedule change workflow.
- **Weekly & Monthly Report Submission:** Auto-populated structured forms, client-side copy-paste detection flagging, Tuesday deadline enforcement with late-note requirement, faculty Approve/Return/Regard/Disregard workflow with email notifications, monthly aggregation by calendar month.
- **Final Technical Report:** Unlocks only after configurable hour threshold is met, includes company profile summary, and proof attachments.
- **Document Generation:** Endorsement letters (individual and bulk PDF), weekly/monthly report PDFs, final report cover pages — all with system-generated reference codes and timestamps via Puppeteer server-side rendering, including failure recovery logic.
- **AI-Assisted Features:** Similarity detection (Gemini `text-embedding-004`, pgvector, 0.70 threshold), sentiment analysis (Gemini 2.5 Flash, Positive/Neutral/Negative + confidence score), cached results, advisory-only outputs.
- **Dashboards & Monitoring:** Real-time role-specific dashboards; per-student hours, checklist %, submission status, anomaly flags; weekly dashboard summary reports; semester-level archiving for accreditation.
- **Unified Calendar & Timeline Tracking:** Role-specific calendar views displaying submission deadlines, holidays, approved deviations, and auto-calculated "Projected OJT Completion Date" milestones.
- **Notification System:** 12 automated trigger events via Resend; configurable intervals via Super Admin UI; in-app status indicators.(Changeable, CS 180hrs, MMA 420 hrs, IT 520, notify the faculty adivisor to send out evaluation form to students company supervisor(required need to accomplished by student: complete name of supervisor, position, and email address(1 or multiple supervisor)))
- **Export & Reporting:** Excel/CSV export of compliance data, hours summaries, checklist statuses, flagged student lists.
- **Data Privacy & Security:** RA 10173 compliance, RBAC at middleware and service layers, Supabase RLS, HTTPS/TLS 1.2+, time-limited signed file URLs, soft deletes for full audit history, DSAR workflow, and file retention/cleanup policies.

### Out of Scope

- Native mobile application (iOS/Android)
- Company/HTE supervisor portal
- Automated grading or approval decisions by AI
- Integration with external LMS platforms beyond Google Classroom (as complementary context)
- Multi-institution or multi-department beyond SAMCIS CIS programs in v1.0
- Real-time WebSocket infrastructure (polling/SSE used instead)
- **Mid-internship Company Transfer Workflow:** Students changing host companies _after_ deployment has begun is out of scope for v1.0. (If this occurs, the Department Coordinator must manually intervene to adjust records; the system assumes a 1:1 student-to-company relationship per semester).

---

## Requirements

### Functional Requirements

**Prioritization framework: MoSCoW**, applied per the product-manager-toolkit canon's Framework Selection Guide ("Sprint-level prioritization → MoSCoW"). Each module below states its module-level default plus any per-requirement exceptions. Module-level distribution: **8 Must** (Modules 1, 2*, 3, 4*, 5*, 6, 8, 10 — *asterisked modules have Should-tier exceptions noted inline), **3 Should** (Modules 7, 9, 11), **1 Could** (Module 12). Treat "Must" as the floor that must survive any timeline compression; "Should" and "Could" modules/rows are where Phase 5 schedule pressure should be absorbed first — not by cutting corners inside a Must-tier module.

#### Module 1 — User Management & Authentication

_Prioritization: **Must** throughout — this module is the security/RBAC foundation every other module depends on (MoSCoW "Must Have" criterion: security or data integrity requirement)._

| ID           | Requirement                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | Priority |
| ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| FR-UM-01     | System must support four distinct user roles: Super Admin, Department Coordinator, Faculty Adviser, Student Intern — each with role-specific UI and API access enforced by RBAC middleware.                                                                                                                                                                                                                                                                                                                                                              | Must     |
| FR-UM-02     | Students must be bulk-registered via CSV or Excel file import using official SLU class lists.                                                                                                                                                                                                                                                                                                                                                                                                                                                            | Must     |
| FR-UM-03     | Default passwords must be generated using a salted hash of the student ID number.                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | Must     |
| FR-UM-04     | Password change must be enforced on first login before accessing any other feature.                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | Must     |
| FR-UM-05     | System must support OTP or email-based MFA for sensitive operations.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | Must     |
| FR-UM-06     | Sessions must automatically expire after a configurable period of inactivity (default: 30 minutes).                                                                                                                                                                                                                                                                                                                                                                                                                                                      | Must     |
| FR-UM-07     | Account must lock after 5 consecutive failed login attempts.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | Must     |
| FR-UM-08     | An immutable audit log must record all login attempts, role changes, and security-sensitive actions with user identity, IP address, timestamp, and affected record.                                                                                                                                                                                                                                                                                                                                                                                      | Must     |
| FR-UM-09     | RBAC must be enforced at both the route/middleware level AND the service/record-ownership level (e.g., a student cannot access another student's report even via a crafted API request).                                                                                                                                                                                                                                                                                                                                                                 | Must     |
| **FR-UM-10** | **Password Reset Flow:** System must provide a `/auth/reset-password` route. Users can request a magic link sent to their SLU email. The link is valid for 1 hour. Locked accounts may use this to reset credentials, but the account remains locked from login until the 15-minute lockout timer expires or a Super Admin manually unlocks it.                                                                                                                                                                                                          | Must     |
| **FR-UM-11** | **Instant Session Revocation:** Because sessions use the database strategy (not stateless JWT), any of the following must delete the affected user's row(s) from the `sessions` table immediately, forcing re-authentication on their very next request — not waiting for token expiry: (a) account auto-lock after 5 failed attempts (FR-UM-07), (b) Super Admin deactivating a user (`isActive = false`), (c) Super Admin-initiated forced logout, (d) password reset completion. This is the mechanism that makes "instant lockout" actually instant. | Must     |

#### Module 2 — Company Profile & MOA Management

_Prioritization: Must, except two UX/notification enhancements (Should) — the MOA record itself is one of the 9 compliance-gating documents, but autocomplete and proactive expiry alerts are conveniences layered on top of it, not the gate itself._

| ID        | Requirement                                                                                                                                                                                                       | Priority |
| --------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| FR-MOA-01 | Students and faculty must be able to register host company profiles including: company name, full address, work modality (On-site / Work-from-Home / Hybrid), supervisor/HR contact info, student position title. | Must     |
| FR-MOA-02 | Company name entry must support autocomplete and duplicate detection.                                                                                                                                             | Should   |
| FR-MOA-03 | MOA records must be uploadable as PDF files or Google Drive links, with system-captured metadata: validity period, academic programs covered.                                                                     | Must     |
| FR-MOA-04 | MOA lifecycle stages must be tracked: Drafting → Pending → For HTE Review → For University Review → Approved/Active → Expiring/Expired → Archived.                                                                | Must     |
| FR-MOA-05 | System must automatically identify MOAs approaching expiration and send email and in-app alerts to the internship coordinator.                                                                                    | Should   |
| FR-MOA-06 | Government-issued business permits must be uploadable and verifiable by faculty or coordinators before the student is activated for internship.                                                                   | Must     |
| FR-MOA-07 | MOA record access must be restricted to authorized Faculty Advisers and Department Coordinators only.                                                                                                             | Must     |

#### Module 3 — Pre-Deployment Checklist

The following nine documents must be tracked per student:

1. Medical Certificate
2. Psychological Clearance
3. Parent's Consent and Undertaking
4. Company Reply Form
5. Data Privacy (DP) Orientation Certification
6. Internship Orientation Completion Record
7. Government-Issued Company Permits
8. Work Plan (approved)
9. Memorandum of Agreement (MOA)

_Prioritization: Must throughout — this module is the compliance gate itself (MoSCoW "Must Have" criterion: regulatory requirement + core user job)._

| ID           | Requirement                                                                                                                                                                                                                                                                                                            | Priority |
| ------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| FR-CK-01     | Each of the nine pre-deployment documents must be tracked as a separate checklist item per student.                                                                                                                                                                                                                    | Must     |
| FR-CK-02     | Faculty must be able to Approve, Return (with written comments), or leave pending each checklist item individually.                                                                                                                                                                                                    | Must     |
| FR-CK-03     | Student checklist completion percentage must be displayed in real time.                                                                                                                                                                                                                                                | Must     |
| **FR-CK-04** | **Endorsement Letter Gating:** Endorsement letter generation and progression to active deployment are strictly blocked until all nine checklist items are approved. _(Note: Work plan approval (Item 8) only queues a draft record; the actual PDF generation and download unlock only when Item 9 is also approved)._ | Must     |
| FR-CK-05     | Data Privacy Orientation and Internship Orientation must be tracked separately, with user consent to data collection logged during orientation registration.                                                                                                                                                           | Must     |
| FR-CK-06     | Checklist item status updates must trigger in-app and email notifications to the student.                                                                                                                                                                                                                              | Should   |

#### Module 4 — Work Plan Submission & Approval

_Prioritization: Must, except the program-mismatch notification (Should) — the work plan is Checklist Item 8 and directly feeds hour computation, but flagging a format mismatch is a helpful nudge, not a hard gate._

| ID           | Requirement                                                                                                                                                                                                                                                              | Priority |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------- |
| FR-WP-01     | Students must submit a work plan using the institutional template before deployment.                                                                                                                                                                                     | Must     |
| FR-WP-02     | Work plans must be reviewed and approved or returned by the department coordinator.                                                                                                                                                                                      | Must     |
| FR-WP-03     | System must verify that planned tasks match the student's academic program; if the company has its own work plan format, the system must notify the student and request additional info.                                                                                 | Should   |
| FR-WP-04     | Approved work plans must be used to: (a) establish the fixed work schedule, (b) calculate required hours, (c) determine projected completion date.                                                                                                                       | Must     |
| **FR-WP-05** | **Draft Queuing:** Upon work plan approval, the system queues a draft endorsement letter record in `generated_documents` with status `pending_draft`. This record does NOT become downloadable or final until the 9/9 pre-deployment gate (FR-CK-04) is fully satisfied. | Must     |
| FR-WP-06     | Approved work plans must be locked and non-editable; changes require a new submission with coordinator re-approval.                                                                                                                                                      | Must     |

#### Module 5 — Attendance & Time Tracking

_Prioritization: Must for core hour computation (FR-AT-01–07) — this is the system's central value metric. The mid-internship schedule-change workflow (FR-AT-08–11) is Should — a real edge case, but one the Department Coordinator could still handle manually (as today) without breaking the core compliance narrative if a phase slips._

| ID           | Requirement                                                                                                                                                                                                     | Priority |
| ------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| FR-AT-01     | Upon work plan approval, each student must configure their work schedule (daily hours, working days) in the system.                                                                                             | Must     |
| FR-AT-02     | System must populate a calendar-based schedule pre-populated with Philippine national holidays, regional holidays, and company-specific non-working days that students can mark as applicable.                  | Must     |
| FR-AT-03     | Absences, undertime, and overtime must be submitted via structured deviation report forms with date, reason category, and supporting documentation upload.                                                      | Must     |
| FR-AT-04     | All deviation reports must be validated by the faculty adviser before affecting hour computation.                                                                                                               | Must     |
| FR-AT-05     | System must automatically compute: total hours rendered, required hours remaining, and projected completion date — based only on validated attendance data.                                                     | Must     |
| FR-AT-06     | Required completion hours per program must be configurable via the admin interface, never hardcoded.                                                                                                            | Must     |
| FR-AT-07     | Students must be able to export their attendance log as CSV.                                                                                                                                                    | Should   |
| **FR-AT-08** | **Schedule Change Initiation:** Students may request a mid-internship schedule change via a structured form, requiring a valid reason and supporting document (if applicable).                                  | Should   |
| **FR-AT-09** | **Schedule Change Approval:** Schedule changes require Faculty Adviser validation followed by Department Coordinator final approval.                                                                            | Should   |
| **FR-AT-10** | **Hour Computation Impact:** Approved schedule changes do _not_ retroactively alter previously validated hours or reports. They only affect future hour computation and update the "Projected Completion Date." | Should   |
| **FR-AT-11** | **Audit Logging:** All schedule changes are logged in the `work_plans.scheduleChangeHistory` JSONB field with timestamps and approver IDs.                                                                      | Should   |

#### Module 6 — Weekly & Monthly Report Submission

_Prioritization: Must throughout — this is the recurring compliance/hour-tracking cycle that runs every week of the internship, directly targeting the Problem Statement's late-submission and error pain points. FR-WR-04 is Should: it's a client-side convenience layered in front of the server-side similarity check (FR-AI-01) that does the real detection, so the system is still correct without it._

| ID           | Requirement                                                                                                                                                                                                                                                                                                                                                | Priority |
| ------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| FR-WR-01     | System must auto-generate weekly report forms based on each student's approved fixed schedule and semester calendar.                                                                                                                                                                                                                                       | Must     |
| FR-WR-02     | Form fields must include: daily attendance status (Present/Absent/Holiday), actual work hours, work accomplishments (per day), total hours for the week (auto-calculated), running total hours, and hours remaining.                                                                                                                                       | Must     |
| FR-WR-03     | Only the student may enter actual hours worked and daily accomplishments.                                                                                                                                                                                                                                                                                  | Must     |
| **FR-WR-04** | **Client-Side Copy-Paste Warning:** Before submission, the client-side UI compares new accomplishment text against the student's immediate prior submission. If an exact or near-exact match is detected, a blocking warning prompts the student to revise before the "Submit" button becomes active. _(Distinct from server-side vector similarity)._     | Should   |
| **FR-WR-05** | **Late Submission Protocol:** Reports are due on Tuesday. Late submissions require the _student_ to fill out a mandatory "Reason for Delay" text field before the system accepts the submission. Faculty can view this note during review.                                                                                                                 | Must     |
| **FR-WR-06** | **Faculty Review Actions:** Faculty can: **Approve** (hours count, status complete), **Return** (requires student revision, hours do not count yet), **Regard** (acknowledged, hours count, but marked for minor improvement/no revision needed), or **Disregard** (invalid submission, e.g., wrong week; hours do not count, requires full resubmission). | Must     |
| FR-WR-07     | Faculty and students must receive email notifications when reports are approved or returned.                                                                                                                                                                                                                                                               | Should   |
| **FR-WR-08** | **Monthly Report Aggregation:** Monthly reports aggregate weekly reports by **Calendar Month**. A monthly report can only be submitted when _all_ weekly reports falling within that calendar month are in "Approved" or "Regarded" status.                                                                                                                | Must     |
| FR-WR-09     | Students must be able to preview a PDF of their report before final submission.                                                                                                                                                                                                                                                                            | Should   |
| FR-WR-10     | A submitted report PDF must be auto-generated with a system reference code and timestamp.                                                                                                                                                                                                                                                                  | Must     |

#### Module 7 — Final Technical Report

_Prioritization: **Should**, whole module — flagging a real scheduling risk, not just a formality: a BSIT student needs ~500/600 hours before this module even unlocks (FR-FT-01). Given the 6-phase, ~13-week build timeline, it's unlikely any pilot student will reach that threshold before the capstone defense/demo date. If Phase 5 time is tight, this is the module to compress or stub (e.g., ship the schema and a minimal review UI, defer the full evaluation-scoring workflow) — doing so doesn't compromise the pre-deployment compliance story the rest of the PRD is built around._

| ID       | Requirement                                                                                                                                                                                                   | Priority |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| FR-FT-01 | The Final Technical Report module must only become accessible to students who have reached a configurable hour threshold (e.g., 500 of 600 for BSIT).                                                         | Should   |
| FR-FT-02 | The report must contain sections for: company profile summary, peer and supervisor evaluation scores, and proof of attachments (attendance proof, certificates of completion, certificates of participation). | Should   |
| FR-FT-03 | Final technical reports must be reviewed and approved or returned by the department coordinator.                                                                                                              | Should   |

#### Module 8 — Document Generation

_Prioritization: Must for the endorsement-letter path (it's what FR-CK-04's gate actually unlocks) and the failure-recovery logic (given Puppeteer/Vercel is the architecture review's highest-flagged operational risk, retry logic isn't optional polish). Bulk generation is a Should — faculty can generate letters one at a time as a fallback._

| ID           | Requirement                                                                                                                                                                                                                                                                                                                   | Priority |
| ------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| FR-DG-01     | Endorsement letters must be auto-generated with: student name, student ID, company name and address, supervisor name and position, endorsement date, using the institution's standard letterhead format.                                                                                                                      | Must     |
| FR-DG-02     | Faculty must be able to generate bulk endorsement letters for all eligible students in a class group via a batch PDF export function.                                                                                                                                                                                         | Should   |
| FR-DG-03     | System must generate PDF versions of: weekly reports, monthly reports, endorsement letters, and final report cover pages.                                                                                                                                                                                                     | Must     |
| FR-DG-04     | All generated PDFs must include a system-generated reference code and timestamp for traceability and accreditation purposes.                                                                                                                                                                                                  | Must     |
| FR-DG-05     | PDF generation must only occur after the student has reviewed and confirmed report contents in the system.                                                                                                                                                                                                                    | Must     |
| FR-DG-06     | PDF generation must be performed server-side using Puppeteer (headless Chrome) to ensure consistent rendering across browsers and devices.                                                                                                                                                                                    | Must     |
| **FR-DG-07** | **PDF Generation Failure Recovery:** If Puppeteer generation fails (e.g., timeout, memory limit), the system retains the submission data, logs the error, sets the document status to `failed`, and provides a "Regenerate PDF" button for the user. The system will attempt a maximum of 3 retries with exponential backoff. | Must     |

#### Module 9 — AI-Assisted Features

_Prioritization: **Should**, whole module — per the Goals section, AI is explicitly "assistive... to support, not replace, faculty judgment," and Out of Scope explicitly rules out AI making decisions. No core compliance-gating job requires it; the system is fully functional (checklist gating, hour computation, report workflow) without it. **Exception: FR-AI-06 is a Must-level guardrail** — if the AI module ships at all, "advisory only, never auto-decides" is non-negotiable, not a nice-to-have within a nice-to-have module._

| ID           | Requirement                                                                                                                                                                                                                                                                                          | Priority                              |
| ------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------- |
| **FR-AI-01** | **Similarity Detection:** System must compare new accomplishment entries against the student's previous report embeddings using vector-based comparison (**Gemini `text-embedding-004`** + pgvector). _(Note: OpenAI models are not used)._                                                          | Should                                |
| **FR-AI-02** | **Threshold Calibration:** Reports with a cosine similarity score exceeding the configurable threshold (default: 0.70) are flagged. This threshold is calibrated to flag near-identical text blocks while allowing standard boilerplate phrasing. Super Admin can adjust this between 0.60 and 0.85. | Should                                |
| FR-AI-03     | System must include **sentiment analysis** of weekly report journal entries using Gemini 2.5 Flash, classifying output as Positive, Neutral, or Negative with a confidence score and brief reasoning.                                                                                                | Should                                |
| FR-AI-04     | Aggregated sentiment trend indicators must be surfaced on the faculty dashboard.                                                                                                                                                                                                                     | Could                                 |
| FR-AI-05     | All AI results must be cached in the database after computation; no live API call may be made during page load.                                                                                                                                                                                      | Should                                |
| FR-AI-06     | AI results must be displayed as advisory indicators only. They must never automate grading, approval, or rejection decisions.                                                                                                                                                                        | **Must** (guardrail — see note above) |
| FR-AI-07     | AI outputs must be displayed inline on the faculty Report Review page as part of the standard review workflow.                                                                                                                                                                                       | Should                                |

#### Module 10 — Dashboard & Monitoring

_Prioritization: Must for the four role-specific dashboards themselves — "no live compliance dashboard exists" is a named pain point in the Problem Statement, so this directly targets it. Auto-generated summary exports and semester archiving are Should — valuable operational features, but a single-semester capstone demo can function with manual export/archival if time runs short._

| ID       | Requirement                                                                                                                                                                                                                                                                           | Priority |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| FR-DB-01 | Role-specific dashboards must be provided for: Student Intern, Faculty Adviser, Department Coordinator, and Super Admin.                                                                                                                                                              | Must     |
| FR-DB-02 | **Student Dashboard** must display: hours rendered vs. required, pre-deployment document completion %, estimated completion date, per-document status, weekly report submission history with statuses.                                                                                | Must     |
| FR-DB-03 | **Faculty Dashboard** must display: total students, reports submitted this week, reports pending review, reports not yet submitted; per-student rows with hours progress bars, document count, weekly report status, AI flags, and action buttons; Bulk Endorse and Export functions. | Must     |
| FR-DB-04 | **Coordinator Dashboard** must display: program-level summary cards, MOA expiry alerts, full student compliance table with filters by program and status, Excel export.                                                                                                               | Must     |
| FR-DB-05 | **Super Admin Dashboard** must display: system-wide user and semester management, required hours configuration, audit log with filter and export, semester management (archive/activate).                                                                                             | Must     |
| FR-DB-06 | Dashboards must auto-generate weekly summary reports exportable to Excel for offline review and accreditation use.                                                                                                                                                                    | Should   |
| FR-DB-07 | All historical data per semester must be retained to support institutional audit requirements.                                                                                                                                                                                        | Must     |
| FR-DB-08 | System must support an end-of-semester archiving process.                                                                                                                                                                                                                             | Should   |

#### Module 11 — Notification System

_Prioritization: **Should**, whole module — reduces the late-submission pain point named in the Problem Statement, but every workflow it notifies about (checklist status, deadlines, MOA expiry) still functions and is visible in-app/on-dashboard without email notifications; it's an efficiency layer, not a gate. In-app status indicators (FR-NT-03) lean Must since they're the dashboard's own status language, not a separate notification channel._

| ID       | Requirement                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | Priority |
| -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| FR-NT-01 | System must send automated notifications for 12 trigger events: (1) account creation, (2) password reset, (3) report submission confirmation, (4) report return with revision notes, (5) submission deadline reminder at 48 hours, (6) submission deadline reminder at 24 hours, (7) endorsement letter generation, (8) MOA expiry warning, (9) pre-deployment checklist status changes, (10) work plan approval, (11) deviation report validation, (12) scheduled deadline reminders. | Should   |
| FR-NT-02 | All notification intervals must be configurable through the Super Admin interface; none may be hardcoded.                                                                                                                                                                                                                                                                                                                                                                              | Should   |
| FR-NT-03 | In-app status indicators must be displayed for: returned reports, pending validations, upcoming deadlines, and incomplete pre-deployment requirements.                                                                                                                                                                                                                                                                                                                                 | Must     |
| FR-NT-04 | Email notifications must be sent via Resend transactional email API using JSX-based React Email templates.                                                                                                                                                                                                                                                                                                                                                                             | Should   |
| FR-NT-05 | Scheduled notifications must be dispatched by Vercel Cron Jobs. _(Note: Due to Vercel Hobby tier limits, 48h and 24h deadline checks are consolidated into a single daily cron evaluation)._                                                                                                                                                                                                                                                                                           | Should   |

#### Module 12 — Unified Calendar & Timeline Tracking _(NEW)_

_Prioritization: **Could**, whole module — explicitly the newest addition to the spec, and a visualization layer over data (deadlines, holidays, deviations, projected completion date) already surfaced elsewhere in the per-role dashboards (Module 10). A genuine Kano "delighter": nice when present, but nothing else in the system depends on it, and every module's Should/Must timeline in this PRD holds even if Module 12 is the one cut for time._

| ID            | Requirement                                                                                                                                                                                                                        | Priority |
| ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| **FR-CAL-01** | **Unified Calendar View:** All roles have access to a calendar view displaying color-coded events: Submission Deadlines (Red), Holidays (Gray), Approved Deviations (Yellow), and Projected OJT Completion Date (Green milestone). | Could    |
| **FR-CAL-02** | **Student Calendar:** Displays the student's specific work schedule, upcoming report deadlines, and a prominent, auto-updating "Projected OJT Completion Date" based on current rendered hours and approved schedule.              | Could    |
| **FR-CAL-03** | **Faculty Calendar:** Displays aggregated submission deadlines for all assigned students, highlighting weeks with high expected submission volumes.                                                                                | Could    |
| **FR-CAL-04** | **Coordinator Calendar:** Displays department-wide milestones, MOA expiration dates, and clustered projected completion dates to anticipate endorsement letter generation spikes.                                                  | Could    |

---

### Non-Functional Requirements

#### Security

| ID             | Requirement                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| NFR-SEC-01     | Role-based access control must be enforced at all system layers: middleware (route-level) and service layer (record-level ownership).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| NFR-SEC-02     | All client-server communication must use HTTPS/TLS 1.2 or higher.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| NFR-SEC-03     | Uploaded files must be stored in authenticated, access-controlled Supabase Storage buckets. Files must never be served via public URLs; all access must be mediated by the application server using time-limited, scoped signed URLs.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| NFR-SEC-04     | File uploads must be validated server-side with MIME-type verification, limited to safe types: PDF, DOCX, PNG, JPG, XLSX, CSV.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| NFR-SEC-05     | Sensitive actions (role changes, bulk exports, PDF generation, user deletion) must require re-authentication or MFA confirmation.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| NFR-SEC-06     | Authentication endpoints must implement rate limiting to defend against brute-force attacks.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| NFR-SEC-07     | An immutable audit log must record all data access, modification, export, and deletion events with user identity, timestamp, IP address, and affected record.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| NFR-SEC-08     | Session tokens (opaque, database-backed per FR-UM-11 — not JWT) must be HttpOnly and Secure.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| NFR-SEC-09     | All protected routes must re-validate the session against the live `sessions` table row via NextAuth.js middleware before serving any page or API response; a missing or expired row must redirect to login. This live check is what enables FR-UM-11's instant revocation, and is an explicitly accepted latency tradeoff against NFR-PERF-01 (see note there).                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| **NFR-SEC-10** | **Audit Log Immutability:** The `audit_logs` table must have an append-only Row Level Security (RLS) policy in Supabase that strictly prevents `UPDATE` or `DELETE` operations by any role, including the service role, enforced at the database level.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| **NFR-SEC-11** | **Row Level Security (defense-in-depth):** All remaining domain tables (everything except `audit_logs`, which NFR-SEC-10 already covers) must have RLS policies matching the RBAC roles in NFR-SEC-01, designed and enabled during Phase 1 alongside the RBAC middleware — not deferred past it. _(Status as of Phase 0: RLS is currently disabled on these 18 tables — flagged by Supabase's security advisor immediately after schema creation. Low immediate risk since the app connects via Prisma as the `postgres` owner role, which bypasses RLS by default, but a real gap if the `anon`/publishable key were ever exposed client-side. Team decision 2026-08-24: defer real policy design to Phase 1 rather than bolt on a placeholder now, since it's the same design problem as the RBAC middleware itself.)_ |

#### Data Privacy & Compliance

| ID            | Requirement                                                                                                                                                                                                                                                                                         |
| ------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| NFR-DP-01     | System must comply with the Philippine Data Privacy Act of 2012 (Republic Act No. 10173) and SLU's institutional data privacy policy.                                                                                                                                                               |
| NFR-DP-02     | Student personal data — including health-related documents, psychological records, and parent consent forms — must be accessible only to personnel on a need-to-know basis and encrypted at rest.                                                                                                   |
| NFR-DP-03     | Explicit user consent to collect and process personal data must be logged during account registration and the orientation flow.                                                                                                                                                                     |
| NFR-DP-04     | Data minimization must be applied — only information necessary for internship management may be collected.                                                                                                                                                                                          |
| NFR-DP-05     | The system must not expose student personal information in publicly accessible URLs, shared links, or unscoped API responses.                                                                                                                                                                       |
| NFR-DP-06     | A data retention policy must flag records for institutional review or anonymization after the defined retention period rather than automatic deletion.                                                                                                                                              |
| **NFR-DP-07** | **Data Subject Access Request (DSAR):** Users can trigger a DSAR from their Settings page. This generates a ticket logged in `audit_logs`, notifies the Super Admin, and carries a 15-day SLA for the admin to generate and provide a CSV/PDF export of the user's personal data, per NPC advisory. |
| **NFR-DP-08** | **File Retention & Cleanup:** Generated PDFs and uploaded documents are retained for 3 years post-semester. A quarterly background job flags files older than 3 years for Super Admin review before permanent deletion, preventing unbounded storage growth.                                        |

#### Performance

| ID              | Requirement                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **NFR-PERF-01** | Dashboard pages must load with a p95 Time-To-First-Byte (TTFB) ≤ 800ms under a simulated load of 50 concurrent users on the Vercel Hobby tier. _(This budget must absorb the per-request `sessions` table lookup from NFR-SEC-09 — a single indexed PK read, expected single-digit ms at this scale. If Phase 5 performance testing shows this budget is at risk, add a short-TTL in-memory cache of valid session IDs rather than reverting to stateless JWT, to preserve FR-UM-11's instant-revocation guarantee.)_ |
| NFR-PERF-02     | PDF generation must be consistent and accurate across different browsers and devices.                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| NFR-PERF-03     | The AI feature layer must be designed for handling concurrent requests during peak submission periods (e.g., Tuesday report deadlines).                                                                                                                                                                                                                                                                                                                                                                               |
| **NFR-PERF-04** | Bulk operations (bulk student enrollment, bulk endorsement letter generation, bulk report export, bulk checklist review) must be supported without application timeout. This is mitigated by utilizing async server actions or background job queues to prevent 10-second serverless function timeouts, providing a "Processing..." UI state to the user while the job completes.                                                                                                                                     |

#### Reliability & Availability

| ID             | Requirement                                                                                                                                                                                |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **NFR-REL-01** | System targets 99.5% uptime during academic working hours (Mon-Fri, 7 AM - 7 PM PHT). Maintenance windows must be communicated to users via an in-app banner at least 48 hours in advance. |
| NFR-REL-02     | Automated data backup procedures must run at minimum daily frequency.                                                                                                                      |
| NFR-REL-03     | Failed submissions must be handled gracefully — draft data must be retained and a clear recovery message shown to the user.                                                                |

#### Usability & Accessibility

| ID             | Requirement                                                                                                                                                                                        |
| -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| NFR-USA-01     | System must be fully responsive and accessible on desktop and mobile browsers without requiring a native mobile application.                                                                       |
| **NFR-USA-02** | **Onboarding Guide:** First-time login for all roles triggers a 3-step interactive tooltip tour covering: (1) Dashboard navigation, (2) Primary action buttons, and (3) Status indicator meanings. |
| NFR-USA-03     | Autocomplete, pre-filled defaults, and inline validation messages must reduce input errors and manual data entry.                                                                                  |
| NFR-USA-04     | Calendar and schedule interfaces must visually differentiate working days, non-working holidays, and submission deadlines.                                                                         |
| NFR-USA-05     | Status indicators throughout the system must use consistent color-coded visual language: Submitted, Validated, Returned, Pending, Overdue.                                                         |

#### Maintainability

| ID             | Requirement                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| NFR-MNT-01     | Architecture must be modular and service-oriented; each component must be independently updatable without compromising overall functionality.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| **NFR-MNT-02** | The AI and vector database layers must be **logically distinct** from the relational data layer — fully abstracted behind `aiService.ts` as a swappable service adapter (per NFR-MNT-05), even though `pgvector` is co-located in the same Supabase Postgres instance for v1.0. This supports independent model updates and feature toggles without the operational overhead of a physically separate vector database; migrating to a dedicated vector store (e.g., Pinecone, Qdrant) remains a drop-in future option behind the same adapter if scale ever demands it. _(Reworded in v1.3 — the original "physically distinct" wording contradicted the architecture actually being built.)_ |
| NFR-MNT-03     | All configuration parameters (program hours, holiday calendars, semester dates, submission deadlines, reminder intervals, similarity thresholds) must be configurable through the admin UI — never hardcoded.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| **NFR-MNT-04** | **Test Coverage:** Code must conform to documented standards with a minimum of ≥ 70% line coverage for all service modules, and ≥ 90% for critical logic (hour computation, checklist gating, RBAC).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| NFR-MNT-05     | All third-party integrations must be implemented as abstracted service adapters allowing provider replacement without refactoring core logic.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| NFR-MNT-06     | Business logic must never be placed directly in page files or route handlers; all logic must be extracted into service modules under `/src/lib/services/`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |

#### AI Quality & Evaluation _(NEW)_

FR-AI-01/02 define a similarity-detection _mechanism_ and a threshold (0.70, configurable 0.60–0.85) but v1.2 never specified how that threshold's correctness would be established or verified. These NFRs close that gap.

| ID            | Requirement                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **NFR-AI-01** | **Golden Set:** Before Phase 4 is considered complete, a labeled golden set of at least 30 report-accomplishment pairs must be assembled and labeled by the Faculty Adviser (or a delegated faculty reviewer) into two classes: true near-duplicate submissions, and legitimate boilerplate/templated phrasing that should _not_ be flagged. This set is the ground truth for everything below.                                                                                                      |
| **NFR-AI-02** | **Accuracy Target:** Evaluated against the NFR-AI-01 golden set at the default 0.70 threshold, similarity detection (FR-AI-02) must achieve ≥ 80% precision (of items flagged, how many are true near-duplicates) and ≥ 70% recall (of true near-duplicates, how many get flagged). The resulting confusion matrix must be documented as a Phase 4 deliverable. If the target isn't met at 0.70, the default threshold must be adjusted and re-evaluated before Phase 4 sign-off, not shipped as-is. |
| **NFR-AI-03** | **Calibration Procedure:** Any Super Admin adjustment of the similarity threshold (0.60–0.85 range, per FR-AI-02) must be preceded by re-running the NFR-AI-01 golden set evaluation at the new value, and the resulting precision/recall figures must be shown to the admin before the change is confirmed. Every threshold change and its associated precision/recall must be recorded in the immutable audit log.                                                                                 |
| **NFR-AI-04** | **Sentiment Confidence Guardrail:** Sentiment analysis outputs (FR-AI-03) below a configurable minimum confidence score (default 0.60) must be suppressed from the faculty dashboard rather than displayed as low-confidence noise, since an unqualified "Negative" flag on a false-low-confidence read risks unfairly coloring a faculty adviser's read of a student's report.                                                                                                                      |

---

#### Scalability

| ID         | Requirement                                                                                                                                |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| NFR-SCL-01 | Architecture must support additional academic departments without requiring structural changes to the database schema or application core. |
| NFR-SCL-02 | System must support multiple semesters, academic years, and departments.                                                                   |
| NFR-SCL-03 | Full historical data must be stored without performance degradation.                                                                       |
| NFR-SCL-04 | The AI feature layer must support horizontal scaling for concurrent requests.                                                              |

---

## Recommended Stack

| Layer              | Technology                                                      | Notes / Version Pinning                                                                                                                                                                                                                                                                 |
| ------------------ | --------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Framework**      | Next.js 14 (App Router)                                         | Full-stack React framework for routing, SSR, server actions, and API routes                                                                                                                                                                                                             |
| **Language**       | TypeScript                                                      | Type safety across frontend and backend                                                                                                                                                                                                                                                 |
| **Styling**        | Tailwind CSS                                                    | Utility-first CSS framework for consistent design system                                                                                                                                                                                                                                |
| **Database**       | PostgreSQL 15 via Supabase                                      | Relational database for all structured internship data                                                                                                                                                                                                                                  |
| **ORM**            | Prisma                                                          | Type-safe database access with schema-driven migrations _(Requires custom raw SQL migration to enable `vector` extension before schema generation)_                                                                                                                                     |
| **Authentication** | **NextAuth.js v4.24.x**                                         | Session management, credential provider, **database session strategy via Prisma Adapter**, RBAC hooks _(Pinned to v4 to ensure App Router compatibility and avoid v5 breaking changes. Database strategy — not JWT — chosen specifically for instant session revocation; see FR-UM-11)_ |
| **File Storage**   | Supabase Storage                                                | Secure bucket-based file storage with scoped access via signed URLs _(Capped at 5MB per PDF, 2MB per image to manage free-tier limits)_                                                                                                                                                 |
| **Email**          | Resend + React Email                                            | Transactional email API with JSX-based template design _(Monitored for 100 emails/day free tier limit; batching applied where possible)_                                                                                                                                                |
| **PDF Generation** | Puppeteer + `@sparticuz/chromium`                               | Headless Chrome for consistent server-rendered PDF output                                                                                                                                                                                                                               |
| **AI: Embeddings** | **Gemini `text-embedding-004`**                                 | 768-dimensional vector embeddings for similarity detection _(Replaces incorrect OpenAI reference)_                                                                                                                                                                                      |
| **AI: Analysis**   | Gemini 2.5 Flash                                                | Sentiment analysis (Positive/Neutral/Negative + confidence score)                                                                                                                                                                                                                       |
| **Vector Storage** | pgvector (Supabase extension)                                   | Stores and queries embedding vectors within PostgreSQL                                                                                                                                                                                                                                  |
| **Testing**        | Jest + Testing Library (unit/integration); Cypress (end-to-end) |                                                                                                                                                                                                                                                                                         |
| **Deployment**     | Vercel                                                          | Serverless Next.js deployment with automatic preview deployments and edge CDN _(Hobby tier cron limited to 1x/day; deadline reminders consolidated into a single daily evaluation)_                                                                                                     |
| **CI/CD**          | GitHub Actions                                                  | Automated test runs on pull requests; auto-deploy to Vercel on merge to main                                                                                                                                                                                                            |

---

## System Architecture

IDSMS-CIS uses a **Modular Monolith** pattern within a single Next.js application. All functional modules reside in the same codebase but are organized as independently testable, loosely coupled feature modules.

### Architecture Layers

```text
Layer 1 — Client / Browser
├── React components — Vercel edge CDN
├── Desktop & mobile browser interfaces
└── Student UI / Faculty UI / Coordinator UI / Admin UI / SSE polling

Layer 2 — Next.js 14 Application Layer
├── App Router — page routing, SSR, server actions
├── API route handlers (/api/*)
├── Zod validation (shared schemas)
└── Service modules in /src/lib/services/:
    reportService.ts | checklistService.ts | companyService.ts
    aiService.ts | userService.ts | notificationService.ts
    documentService.ts | auditService.ts | calendarService.ts

Layer 3 — Authentication & RBAC
├── NextAuth.js v4.24.x — /src/middleware.ts intercepts every request
├── Database session strategy (Prisma Adapter) — opaque session token (HttpOnly, Secure)
├── Session validated against live `sessions` table row on every protected request (enables instant revocation — FR-UM-11)
├── Route-level RBAC enforcement
├── First-login password redirect
└── Record-level ownership validated in service layer

Layer 4 — Data Layer
├── PostgreSQL 15 via Supabase
├── Prisma ORM (type-safe queries, schema-driven migrations)
├── Supabase Row Level Security (second enforcement layer, append-only for audit_logs)
└── pgvector $queryRaw (bound params) for similarity search

Layer 5 — Storage Layer              Layer 6 — AI & Notification Layer
├── Supabase Storage                 ├── Gemini API (text-embedding-004)
├── 8 access-controlled buckets      ├── Gemini 2.5 Flash (sentiment)
├── Time-limited signed URLs         ├── Resend (transactional email)
└── MIME-type validated uploads      └── Vercel Cron Jobs (scheduled notifications)

External Services:
Vercel (CDN/serverless) | Supabase (DB/Storage/RLS) | Gemini API | Resend | Puppeteer (@sparticuz/chromium) | GitHub Actions
```

### Folder Structure Convention

```text
/src
  /app                    # Next.js App Router pages and layouts
  /components             # Shared UI components
  /lib
    /services             # All business logic (never in pages/routes)
      reportService.ts
      checklistService.ts
      companyService.ts
      aiService.ts
      userService.ts
      notificationService.ts
      documentService.ts
      auditService.ts
      calendarService.ts
    /utils                # Utility functions
    /validators           # Zod schemas
  /types                  # TypeScript type definitions
  middleware.ts           # NextAuth RBAC middleware (intercepts all requests)
```

---

## Database Schema

18 tables, all primary keys as UUIDs, all tables include `createdAt`/`updatedAt` timestamps, soft deletes via nullable `deletedAt`/`archivedAt` fields.

| Table                                            | Key Fields                                                                                                                                                                                                                                                       |
| ------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `users`                                          | id (UUID), hashedPassword, role, isActive, deletedAt, createdAt                                                                                                                                                                                                  |
| **`sessions`** _(NEW — NextAuth Prisma Adapter)_ | id (UUID), sessionToken (unique), userId (FK), expires. Deleting a row invalidates that session immediately — this is the enforcement mechanism for FR-UM-11.                                                                                                    |
| **`accounts`** _(NEW — NextAuth Prisma Adapter)_ | id (UUID), userId (FK), type, provider, providerAccountId. Required by the Prisma Adapter schema even though this project uses only the Credentials provider (no OAuth); left empty in practice.                                                                 |
| `student_profiles`                               | id, userId, studentNumber, program (BSIT/BSCS/BMMA), classGroupId, semesterId, companyId, scheduleId, requiredHours, renderedHours, internshipFaceType, internshipStartDate                                                                                      |
| `class_groups`                                   | id, name, startDate, endDate, program, classType, deletedAt                                                                                                                                                                                                      |
| **`faculty_class_groups`** _(NEW)_               | id (UUID), facultyId (FK to users), classGroupId (FK to class_groups), semesterId (FK to semesters). _Enables many-to-many relationship for faculty overseeing multiple groups._                                                                                 |
| `semesters`                                      | id, name, startDate, endDate, academicYear, isActive, archivedAt                                                                                                                                                                                                 |
| `companies`                                      | id, name, address, workModality, supervisorName, supervisorContact, isVerified, deletedAt                                                                                                                                                                        |
| `moa_records`                                    | id, companyId, documentUrl, status (Drafting→Archived), validFrom, validTo, programsCovered, archivedAt                                                                                                                                                          |
| `pre_deployment_checklist_items`                 | id, studentProfileId, requirementType (9 types), status (Pending/Approved/Returned), fileUrl, reviewerId, reviewDate, comments, archivedAt                                                                                                                       |
| `work_plans`                                     | id, studentProfileId, status, plannedTasks, scheduleConfig, scheduleChangeHistory, approvalMetadata, coordinatorId                                                                                                                                               |
| `weekly_reports`                                 | id, studentProfileId, weekStart, weekEnd, totalHours, runningTotal, remainingHours, status (Pending/Approved/Returned/Regarded/Disregarded), facultyAction, revisionHistory, similarityScore, similarityFlag, sentimentLabel, sentimentConfidence, aiProcessedAt |
| `daily_report_entries`                           | id, weeklyReportId, reportDate, attendanceStatus, scheduledHours, actualHours, accomplishments (text), toolsUsed, embeddingVector (pgvector)                                                                                                                     |
| `deviation_reports`                              | id, studentProfileId, date, deviationType (Absence/Overtime/Undertime), reason, proofUrl, validationStatus, facultyId                                                                                                                                            |
| `generated_documents`                            | id, studentProfileId, documentType (EndorsementLetter/WeeklyReport/MonthlyReport/FinalReportCover), fileUrl, referenceCode, generatedAt, status (pending_draft/generated/failed)                                                                                 |
| `notifications`                                  | id, userId, triggerType, channel (email/in-app), status (sent/pending/failed), payload, sentAt                                                                                                                                                                   |
| `audit_logs`                                     | id, userId, action, entityType, entityId, ipAddress, timestamp, detail (immutable, append-only RLS)                                                                                                                                                              |
| `holiday_calendar`                               | id, date, name, holidayType (National/Regional), semesterId, studentProfileId (nullable, for company-specific)                                                                                                                                                   |
| `system_config`                                  | id, configKey, configValue, updatedAt, updatedBy                                                                                                                                                                                                                 |

---

## Development Phases & Sprint Plan

To ensure systematic delivery, mitigate risks, and accommodate the 8-person capstone team structure, development is divided into **6 distinct phases**. Each phase spans approximately 2 weeks, with adviser-guided milestone checkpoints replacing traditional Scrum sprint reviews.

### Phase 0: Project Initialization & Environment Setup

**Objective:** Establish a robust, secure, and collaborative foundation for the entire development lifecycle.  
**Duration:** 1.5 Weeks  
**Key Tasks:**

- **Repository & CI/CD:** Initialize Git repository, configure branch protection rules (`main`, `develop`), and set up GitHub Actions for automated linting, type-checking, and Vercel preview deployments.
- **Database Setup:** Provision Supabase project. Manually execute `CREATE EXTENSION IF NOT EXISTS vector;` in the SQL editor. Configure Row Level Security (RLS) policies, specifically the append-only policy for `audit_logs`.
- **Schema Definition:** Draft and finalize `schema.prisma` including the new `faculty_class_groups` junction table and `pgvector` custom types. Run initial `prisma db push`.
- **Environment Configuration:** Set up `.env.local` templates with placeholders for `DATABASE_URL`, `NEXTAUTH_SECRET`, `GEMINI_API_KEY`, and `RESEND_API_KEY`.
- **Code Quality:** Configure ESLint, Prettier, and Husky pre-commit hooks to enforce coding standards (NFR-MNT-04).

**Deliverables:** Live Vercel preview environment, initialized Prisma schema with successful migration, CI/CD pipeline passing on all pull requests.  
**Acceptance Criteria:** Developers can clone the repo, run `npm install`, and start the dev server without errors. Supabase RLS is active, and the `vector` extension is verified.

---

### Phase 1: Core Identity, RBAC & User Management

**Objective:** Build a secure, role-gated authentication system and user onboarding workflow.  
**Duration:** 2 Weeks  
**Key Tasks:**

- Implement NextAuth.js v4.24.x with credential provider and **database session strategy (Prisma Adapter)** — add `sessions`/`accounts` tables to `schema.prisma`.
- Build bulk student CSV/Excel import utility for Coordinators.
- Develop first-login password enforcement and `/auth/reset-password` magic link flow (1-hour expiry).
- Implement middleware route protection and service-layer record ownership validation, including the live `sessions` table check (NFR-SEC-09).
- Implement instant session revocation (FR-UM-11): deleting `sessions` rows on lockout, deactivation, forced logout, and password reset.
- Build basic profile views for all four roles.
- **Design and enable RLS policies on all 18 domain tables (NFR-SEC-11), matching the RBAC roles being built in this same phase.** Deferred here deliberately from Phase 0, when Supabase's security advisor first flagged RLS as disabled — same design problem as the middleware, so do it once.

**Deliverables:** Functional login, registration, password reset, role-gated routing, and RLS policies on every domain table.  
**Acceptance Criteria:** A student cannot access another student's data via crafted API requests. Faculty advisers only see students linked via the `faculty_class_groups` junction table. Accounts lock after 5 failed attempts, and any already-active session for that account is invalidated on its very next request — not merely blocked from a _new_ login. Supabase's security advisor (`get_advisors`) reports zero `rls_disabled_in_public` findings.

---

### Phase 2: Pre-Deployment & Compliance Workflow

**Objective:** Digitize and enforce the pre-deployment checklist and MOA management.  
**Duration:** 2 Weeks  
**Key Tasks:**

- Build Company Profile registration with autocomplete and duplicate detection.
- Implement MOA lifecycle tracking (Drafting → Approved/Active → Expiring/Expired) with automated expiry alerts.
- Develop the 9-item Pre-Deployment Checklist UI for students and Faculty review (Approve/Return with comments).
- Implement Work Plan submission and Coordinator approval workflow.
- **Crucial Logic:** Implement FR-WP-05 (Draft queuing) and FR-CK-04 (Strict 9/9 gating) to ensure endorsement letters cannot be generated until all items are approved.

**Deliverables:** Complete pre-deployment module, MOA tracking, and strict endorsement letter gating.  
**Acceptance Criteria:** Endorsement letter generation is physically blocked in the UI and API until all 9 checklist items show "Approved" status.

---

### Phase 3: Active Deployment, Attendance & Unified Calendar

**Objective:** Enable active internship tracking, hour computation, and intuitive timeline management.  
**Duration:** 2.5 Weeks  
**Key Tasks:**

- Build schedule configuration and deviation report submission (Absence/Overtime/Undertime) with Faculty validation.
- Implement automated hour computation logic (rendered, remaining, projected completion) that only updates upon validated reports.
- Develop Weekly Report submission with **client-side copy-paste detection** (FR-WR-04) and Late Submission Protocol (FR-WR-05).
- Implement Faculty Review actions: Approve, Return, Regard, Disregard (FR-WR-06).
- Build Monthly Report aggregation logic (Calendar month basis, requiring Approved/Regarded weekly reports).
- **New:** Develop the Unified Calendar module for all roles (FR-CAL-01 to FR-CAL-04) displaying deadlines, holidays, and projected completion dates.

**Deliverables:** Functional attendance tracking, report submission/review workflows, and the Unified Calendar.  
**Acceptance Criteria:** Approved schedule changes do not retroactively alter past validated hours. Monthly reports cannot be submitted if any weekly report in that calendar month is "Returned" or "Pending".

---

### Phase 4: AI Integration, Document Generation & Notifications

**Objective:** Integrate intelligence layers, automate PDF generation, and establish the notification backbone.  
**Duration:** 2 Weeks  
**Key Tasks:**

- Implement server-side similarity detection using **Gemini `text-embedding-004`** + `pgvector` (FR-AI-01, FR-AI-02).
- **New:** Assemble the 30+ pair golden set with the Faculty Adviser and run the precision/recall evaluation before enabling the feature (NFR-AI-01, NFR-AI-02).
- Implement sentiment analysis using Gemini 2.5 Flash, caching results to avoid live API calls on page load (FR-AI-05), suppressing low-confidence outputs per NFR-AI-04.
- Build Puppeteer server-side PDF generation for Endorsement Letters, Weekly/Monthly Reports, and Final Cover Pages, including reference codes and **failure recovery retry logic** (FR-DG-07).
- Configure Resend email templates and Vercel Cron Jobs (consolidated into a single daily evaluation to respect Hobby tier limits).
- Enforce file upload size caps (5MB PDF, 2MB Image) to manage Supabase storage limits.

**Deliverables:** AI advisory panels on Faculty Review pages, functional PDF generation with retry logic, automated email notifications, and the NFR-AI-01 golden set + NFR-AI-02 precision/recall report.  
**Acceptance Criteria:** AI flags are strictly advisory and do not auto-reject reports. The similarity threshold meets ≥80% precision / ≥70% recall against the golden set (NFR-AI-02) before the feature is enabled for faculty use. Failed PDF generations log an error, set status to `failed`, and provide a "Regenerate" button.

---

### Phase 5: Dashboards, Archiving, UAT & Hardening

**Objective:** Polish role-specific dashboards, ensure compliance, and prepare for final deployment.  
**Duration:** 2 Weeks  
**Key Tasks:**

- Finalize role-specific dashboards (Student, Faculty, Coordinator, Super Admin) with real-time KPI cards and export functions.
- Implement Super Admin Export Center with MFA confirmation and DSAR workflow (NFR-DP-07).
- Verify append-only RLS on `audit_logs` and implement quarterly file retention/cleanup job (NFR-DP-08).
- Conduct Performance Testing (p95 TTFB ≤ 800ms) and Test Coverage validation (≥ 70% services, ≥ 90% critical logic).
- Execute User Acceptance Testing (UAT) scenarios with selected interns, faculty, and coordinators.

**Deliverables:** Fully polished dashboards, verified security/compliance measures, and UAT sign-off.  
**Acceptance Criteria:** All UAT task scenarios pass. Audit logs cannot be updated or deleted by any user or service role. System meets all defined NFR thresholds.

---

## UI/UX Specifications & Screen Inventory

> **Note to frontend agents:** Each screen below defines the visible components, data displayed, pre-conditions, process flow, and documents produced. Use these specifications as the source of truth for component design. The color-coded status language used throughout the system is: **Green = Approved/Active**, **Yellow = Pending**, **Red = Returned/Overdue/Expired**, **Blue = Linked/System-tracked**, **Gray = Not Yet Submitted/Locked**.

### Authentication

- **Login Page (`/login`):** Left panel (IDSMS logo, branding). Right panel (SLU Email, Password, "Forgot password?", "Log in" CTA, security notices).
- **Password Reset (`/auth/reset-password`):** Email input, "Send Reset Link" CTA. 1-hour magic link validity.

### Student Role Screens

- **Student Dashboard (`/student/dashboard`):** KPI cards (Hours Rendered, Pre-Deployment Docs, Est. Completion). Pre-Deployment Requirements table, Weekly Reports table.
- **My Documents (`/student/documents`):** 9-item checklist with Upload/Re-upload actions. Endorsement Letter lock status.
- **Weekly Reports (`/student/reports/weekly`):** Auto-filled report info, daily accomplishment rows, AI Quality Assessment panel, Preview PDF, Submit Report.
- **Attendance Log (`/student/attendance`):** Summary cards, filter tabs, grouped attendance table, Export CSV button.
- **Student Calendar (`/student/calendar`):** Full-month view. Red dots (Deadlines), Gray blocks (Holidays), Yellow blocks (Approved Deviations). Prominent "Projected OJT Completion" banner.
- **My Profile & Settings:** Personal info, read-only internship assignment, notification toggles, DSAR "Request my data" button.

### Faculty Adviser Role Screens

- **Faculty Dashboard (`/faculty/dashboard`):** KPI row, class group tabs, student compliance table (Hours, Docs, WR Status, AI Flag, Actions), Bulk Endorse/Export.
- **Class Groups (`/faculty/class-groups`):** Group cards with expanded student directory.
- **Report Review (`/faculty/reports/review/[reportId]`):** Daily entries, AI Quality Assessment panel (vague indicator, similar phrasing, sentiment), Revision note area, Approve/Return/Regard/Disregard buttons.
- **Pre-Deployment Checklists (`/faculty/checklists`):** Pending/Returned/Complete filter tabs, checklist item table with View/Approve/Return actions.
- **Endorsement Letters (`/faculty/endorse-letters`):** Summary cards, Bulk endorsement bar, student table showing 9/9 checklist requirement for generation.
- **Faculty Calendar (`/faculty/calendar`):** Aggregated deadlines for all assigned `faculty_class_groups`, highlighting high-volume submission weeks.

### Department Coordinator Role Screens

- **Department Compliance Dashboard (`/coordinator/dashboard`):** Program KPI cards, MOA expiry alert banner, All Students Compliance Overview table with filters and Excel export.
- **Companies & MOA (`/coordinator/companies`):** Summary cards, MOA expiry banner, Partner Companies table with Renew/View actions.
- **Work Plans (`/coordinator/work-plans`):** Summary cards, Pending Work Plan Reviews table, Recently Approved section.
- **Reports & Export (`/coordinator/reports`):** Export Builder, Quick Export Templates (Compliance Master List, Hours Summary, Checklist Status, Flagged Students), Recent Export History.
- **Coordinator Calendar (`/coordinator/calendar`):** Department-wide milestones, MOA expirations, clustered projected completion dates.

### Super Admin Role Screens

- **System Settings (`/admin/system-settings`):** Required Hours Configuration, User Management Table, Audit Log, Semester Management.
- **Role Assignments (`/admin/Role-assignments`):** Summary bar, filter tabs, All Users table, immutable audit logging banner.
- **Holiday Calendar (`/admin/holiday-calendar`):** Holiday List table, Calendar widget, Calendar Settings (Auto-populate toggle).
- **Export Center (`/admin/export-center`):** MFA Requirement banner, 6 Bulk Export cards, Audit Log table.
- **Settings — Super Admin (`/admin/settings`):** Notification Intervals, AI Module Settings (Similarity threshold, toggles), Security (Session timeout).

---

## Acceptance Criteria

### Authentication & Access Control

- [ ] A student can log in using their SLU institutional email and system-generated default password.
- [ ] The system forces a password change on first login before any other action is possible.
- [ ] A user can successfully request a password reset via magic link, which expires in 1 hour.
- [ ] A student cannot access another student's reports, documents, or profile — even with a crafted API request.
- [ ] A faculty adviser can only see students linked to them via the `faculty_class_groups` junction table.
- [ ] A coordinator can see all students across all programs for their department.
- [ ] MFA challenge is presented when configured for sensitive operations.
- [ ] Accounts lock after 5 consecutive failed login attempts.
- [ ] An account lockout, Super Admin deactivation, or forced logout invalidates that user's active session immediately (verified by deleting the `sessions` row and confirming the next request redirects to login) — not dependent on token expiry.
- [ ] All login attempts and role changes are recorded in the immutable audit log.

### Pre-Deployment Compliance

- [ ] A student's endorsement letter cannot be generated until all 9 pre-deployment checklist items have status "Approved". Work plan approval only creates a `pending_draft` record.
- [ ] Each checklist item can be individually approved or returned (with comments) by the faculty adviser.
- [ ] Student checklist completion percentage updates in real time.
- [ ] MOA records display correct lifecycle stage and trigger expiry alerts at the configured threshold.

### Weekly Reports & AI

- [ ] Weekly report forms are auto-populated based on the student's approved schedule and semester calendar.
- [ ] Client-side copy-paste detection blocks submission if text exactly matches the prior week, requiring student revision.
- [ ] Server-side vector similarity (Gemini `text-embedding-004`) correctly flags reports with similarity score ≥ 0.70 as advisory indicators on the faculty review page.
- [ ] The 0.70 default threshold has been validated against the ≥30-pair golden set at ≥80% precision / ≥70% recall (NFR-AI-01, NFR-AI-02), with the confusion matrix documented.
- [ ] Adjusting the similarity threshold in Super Admin settings re-runs the golden set evaluation and shows updated precision/recall before the change is confirmed (NFR-AI-03).
- [ ] Sentiment analysis output (Positive/Neutral/Negative + confidence) is displayed inline on the faculty review page; outputs below the confidence floor are suppressed, not shown (NFR-AI-04).
- [ ] AI results are served from cache on page load — no live API call is made during page render.
- [ ] AI flags do not prevent report approval or rejection — all decisions remain with faculty.
- [ ] Monthly reports can only be submitted when all constituent weekly reports for that calendar month are "Approved" or "Regarded".

### Hour Computation & Schedule

- [ ] Total hours rendered, remaining hours, and projected completion date update automatically after each validated weekly report and deviation report.
- [ ] Only validated deviation reports affect hour computation.
- [ ] Approved schedule changes do not retroactively alter previously validated hours; they only affect future computation and update the projected completion date.
- [ ] Required hours per program are configurable from the admin UI and not hardcoded.

### Document Generation & Storage

- [ ] Generated endorsement letters include: student name, ID number, company name and address, supervisor name and position, endorsement date, institution letterhead.
- [ ] All generated PDFs include a system-generated reference code and timestamp.
- [ ] Puppeteer-generated PDFs render consistently across Chrome, Firefox, and Safari.
- [ ] Bulk PDF export for a class group produces a downloadable ZIP archive.
- [ ] If PDF generation fails, the system logs the error, sets status to `failed`, and provides a "Regenerate" button (max 3 retries).
- [ ] File uploads are strictly limited to 5MB (PDF) and 2MB (Images) to manage Supabase free-tier limits.

### Notifications

- [ ] All 12 notification trigger events fire correctly.
- [ ] Notification interval values are configurable via Super Admin settings and take effect without a code deployment.

### Data Privacy & Security

- [ ] All uploaded files are inaccessible without a valid, time-limited signed URL.
- [ ] MIME-type validation rejects uploads outside the allowed file types.
- [ ] All client-server communication is over HTTPS/TLS 1.2+.
- [ ] Student health documents are accessible only to assigned faculty and coordinators.
- [ ] Soft deletes are implemented — no records are permanently deleted; all are recoverable for audit.
- [ ] A student can trigger a DSAR from Settings, which logs a ticket and notifies the Super Admin.
- [ ] The `audit_logs` table cannot be updated or deleted by any user or service role (append-only RLS enforced).

### UAT Task Scenarios

- [ ] Student can complete full pre-deployment flow: login → change password → upload all 9 documents → have all approved → endorsement letter generated.
- [ ] Faculty can: review a weekly report with AI flags visible → add a revision note → return the report → student notified.
- [ ] Faculty can use the "Regard" action on a report, which counts the hours but flags it for minor improvement without requiring student revision.
- [ ] Coordinator can: approve a work plan → verify endorsement letter lock releases → export compliance report to Excel.
- [ ] Super Admin can: change required hours for BSIT → archive current semester → bulk export audit log with MFA confirmation.
- [ ] Student can view their Unified Calendar and see their dynamically updating "Projected OJT Completion Date."

---

## Testing Strategy

### Unit Testing (Jest + Testing Library)

- Individual service functions: `checklistService.ts` (item status updates, endorsement gating), `hourComputationService.ts` (rendered hours, projected date), `reportService.ts` (validation, status transitions), `moaService.ts` (stage transitions, expiry detection), `notificationService.ts` (trigger firing), `aiService.ts` (result caching, similarity threshold).

### Integration Testing (Jest)

- Approved work plan → weekly report schedule auto-generation.
- Validated deviation report → hour computation update.
- All 9 checklist items approved → endorsement letter unlock.
- MOA stage change → coordinator notification trigger.
- `faculty_class_groups` RBAC logic validation.
- Account lockout / deactivation / forced logout → `sessions` row deleted → next request redirects to login (FR-UM-11).

### End-to-End Testing (Cypress)

- Full student pre-deployment flow.
- Faculty weekly report review with AI panel.
- Coordinator work plan approval.
- Super Admin system configuration.
- Append-only audit log RLS verification.

### Performance Testing

- Page load times (p95 TTFB ≤ 800ms) under simulated concurrent academic-hour load (50 users).
- PDF generation speed, consistency, and failure/retry mechanism validation.
- AI similarity/sentiment processing time during Tuesday peak submission window.
- Bulk export generation with 100+ student dataset (async queue validation).

### User Acceptance Testing (UAT)

- Guided task scenarios with selected student interns, faculty advisers, and coordinators.
- Feedback recorded and incorporated before sprint is considered complete.
- Evaluation criteria: ease of use, dashboard clarity, status indicator accuracy, reduction vs. Google Classroom baseline, export usefulness, overall satisfaction.

---

## Ethical Considerations

- All AI features are explicitly advisory only. Sentiment analysis and similarity detection outputs must never be used as the sole basis for grading, approval, or rejection decisions.
- Students must provide explicit informed consent to AI-assisted analysis of their submitted documents, logged during the orientation flow, in accordance with RA 10173.
- Role-based access control ensures students can only see their own records; faculty see only assigned students; coordinators see only their department.
- All communications are SSL-encrypted. Personal documents (medical, psychological, parental consent) are encrypted at rest.
- The system will not be used to track students beyond the scope of internship compliance management.

---

## Constraints

- Capstone project context: developed by an 8-person fourth-year team; architecture must avoid operational overhead of full microservices.
- **Storage Constraint:** Supabase free tier (1GB) will be actively monitored. File size caps (5MB PDF, 2MB Image) are enforced. At 800MB consumed, the Super Admin will receive an alert to consider a tier upgrade or manual archival.
- **Vercel Cron Constraint:** Hobby tier allows only 1 cron run per day. Deadline reminders (48h/24h) are consolidated into a single daily cron job that evaluates upcoming deadlines, rather than two separate cron triggers.
- Institutional stakeholders (faculty, coordinators, student interns) are not available for sprint review sessions throughout development; adviser-guided milestone checkpoints replace standard Scrum sprint reviews.
- System must deploy as a single project (modular monolith); independent microservice hosting is out of scope for v1.0.
- Puppeteer on Vercel requires `@sparticuz/chromium` — cold start latency for PDF generation must be acknowledged in performance planning and mitigated via async retry logic.

---

## Dependencies

| Dependency                                          | Purpose                                                           | Risk & Mitigation                                                                                                                                                                                                                                                                                                                                             |
| --------------------------------------------------- | ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Supabase (PostgreSQL 15 + pgvector + Storage + RLS) | Primary database, vector search, file storage, row-level security | **Risk:** Free tier row/storage limits. **Mitigation:** Strict file size caps (5MB/2MB), quarterly cleanup job (NFR-DP-08), upgrade alert at 800MB.                                                                                                                                                                                                           |
| Next.js 14 (App Router)                             | Full-stack framework                                              | **Risk:** Breaking changes. **Mitigation:** Strict adherence to App Router patterns; no Pages Router mixing.                                                                                                                                                                                                                                                  |
| Gemini API (`text-embedding-004` + 2.5 Flash)       | AI embeddings and sentiment analysis                              | **Risk:** Rate limits. **Mitigation:** Async queuing post-submission; no live API calls on page load.                                                                                                                                                                                                                                                         |
| Puppeteer / `@sparticuz/chromium`                   | Server-side PDF generation                                        | **Risk:** Cold start latency/timeouts. **Mitigation:** FR-DG-07 retry logic with exponential backoff; async processing.                                                                                                                                                                                                                                       |
| Resend                                              | Transactional email delivery                                      | **Risk:** 100 emails/day free tier limit. **Mitigation:** Batch notifications where possible; daily usage monitoring.                                                                                                                                                                                                                                         |
| Vercel                                              | Deployment, CDN, Cron Jobs                                        | **Risk:** 1x/day cron limit on Hobby tier. **Mitigation:** Consolidate 48h/24h reminder logic into a single daily evaluation cron.                                                                                                                                                                                                                            |
| **NextAuth.js v4.24.x**                             | Authentication, session management, RBAC                          | **Risk:** v5 (Auth.js) breaking changes. **Mitigation:** Explicitly pinned to v4.24.x in `package.json`. **Secondary risk:** database session strategy adds one indexed query per protected request vs. stateless JWT. **Mitigation:** accepted tradeoff for instant revocation (FR-UM-11); revisit only if NFR-PERF-01 testing shows it's a real bottleneck. |
| Prisma                                              | ORM, schema migrations                                            | **Risk:** pgvector requires custom setup. **Mitigation:** Documented raw SQL migration (`CREATE EXTENSION vector`) required before `prisma generate`.                                                                                                                                                                                                         |
| GitHub Actions                                      | CI/CD pipeline                                                    | **Risk:** Network access to Vercel deployment API. **Mitigation:** Standard Vercel GitHub integration.                                                                                                                                                                                                                                                        |

---

## Notes and References

### Related Prior Systems (Comparative Context)

| System                                                 | Institution/Source                                       | Key Features                                                   | Gap IDSMS Addresses                                               |
| ------------------------------------------------------ | -------------------------------------------------------- | -------------------------------------------------------------- | ----------------------------------------------------------------- |
| Web-Based Student Internship Portal                    | Health colleges, Saudi Arabia (Alsolais, 2022)           | Online submission, supervisor assignment, status monitoring    | No AI review, no MOA monitoring, no hour computation              |
| Internship Monitoring and Supervising Web-Based System | Universitas Nasional (Jaafar et al., 2017)               | Schedule monitoring, supervisor assignment, progress reporting | No document creation or pre-deployment checklist enforcement      |
| Student Internship Attendance Application System       | Indonesian University (Nurfaizi & Hindarto, 2023)        | Automated hour computation, web-based attendance tracking      | Attendance only; no report management or compliance monitoring    |
| Electronic Document and Records Management System      | Public sector, St. Vincent & the Grenadines (John, 2023) | Access control, audit logging, centralized document storage    | Not internship-specific; no dashboard or workflow enforcement     |
| Google Classroom (current SLU setup)                   | Saint Louis University SAMCIS                            | Assignment submission, file uploading, basic communication     | No MOA management, no hours calculation, no compliance monitoring |

### Regulatory Reference

- **CHED CMO No. 104, Series of 2017** — Student Internship Program in the Philippines (SIPP): governing framework for all internship requirements, documentation, supervision, and compliance.
- **Republic Act No. 10173** — Data Privacy Act of 2012: governs collection, storage, and processing of personal data, including health and psychological records.

### Academic References

- Alsolais (2022) — centralized portals reduce administrative burden and improve communication vs. manual processes.
- Jaafar et al. (2017) — purpose-built systems outperform general-purpose tools for internship management.
- Nurfaizi & Hindarto (2023) — web-based attendance monitoring reduces computation errors.
- Dewi & Hanifah (2024) — web-based internship monitoring system achieved 87.53% user satisfaction score in UAT.
- Russell & Norvig (2021); Madanchian & Taherdoost (2023) — NLP tools (sentiment analysis, similarity detection) in educational document management.
- Tan et al. (2023); Munezero et al. (2013) — sentiment analysis utility in educational settings for student engagement and welfare monitoring.
- Kumar & Saxena (2024) — adviser-as-proxy model for academic software development, supporting the adapted Agile approach used in this project.

---

_End of IDSMS-CIS Product Requirements Document v1.2_
