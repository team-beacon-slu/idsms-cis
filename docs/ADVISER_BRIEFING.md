# IDSMS-CIS: executive summary for the adviser

_SAMCIS Internship Document Submission and Monitoring System (IDSMS-CIS), Saint Louis University. Prepared by the project team. Last updated: 12 October 2026._

This is a short summary. The full documentation is in [`docs/system/`](system/README.md). **The open questions are numbered 1–17 in section 5; please answer by number.**

## 1. What IDSMS does

IDSMS replaces the Google Classroom, email and spreadsheet routine for BSIT, BSCS and BMMA internships with one website. Students record attendance and weekly work reports; faculty advisers review them; the coordinator manages companies and MOAs; the system computes hours, flags late reports, sends reminders and produces the official PDFs with reference codes. Signed and sensitive documents stay in Google Classroom (decisions D2 and D7). Details: [Product overview](system/01-product-overview.md) and [Internship lifecycle](system/02-internship-lifecycle.md).

## 2. Where the project stands

| Area                                                                                                   | Status                                   |
| ------------------------------------------------------------------------------------------------------ | ---------------------------------------- |
| Accounts, roles and security (Phase 1)                                                                 | Done                                     |
| Pre-deployment checklist, companies and MOAs (Phase 2)                                                 | Done (checklist status-only, D7, PR #85) |
| Attendance, weekly/monthly reports, calendar (Phase 3)                                                 | Done                                     |
| Server-generated PDFs (weekly, monthly, endorsement letter, final report cover)                        | Done                                     |
| Notifications (in-app; email when a sending domain is configured)                                      | Done                                     |
| Role dashboards and Excel exports; semester activate/archive; audit log                                | Done                                     |
| Data privacy and compliance (Export Center, "Request my data", file retention, tamper-proof audit log) | Done                                     |
| **Leave & Time Requests + SLU weekly report format + SLU hours rules** (Workstream L1)                 | **In progress**                          |
| Checklist & MOA settings (required items, endorsement override, MOA without uploads)                   | Next                                     |
| Conduct and deductions: SLU deduction matrix (Workstream L2)                                           | Planned                                  |
| Final Technical Report, HTE evaluation, certificates (Workstream H)                                    | Planned                                  |
| AI advisory: report similarity and sentiment (Workstream D)                                            | Last; optional                           |
| Hosting on the lab computer (Phase 5)                                                                  | After Phase 4                            |

Every change passes type checking, linting, about 700 automated tests and a production build, and is code-reviewed before merging. Details: [Roadmap and status](system/10-roadmap-and-status.md).

## 3. Key rules and decisions

- **Required hours:** BSIT 600, BMMA 500, BSCS 240 (defaults; the Super Admin can change them).
- **Endorsement gate:** no endorsement letter until all pre-deployment checklist items are Approved.
- **Weekly reports:** due **Tuesday 11:59 PM (Manila)**; late ones need a reason. Faculty Approve, Return (with a note), Regard or Disregard. Only Approved and Regarded weeks count as confirmed hours.
- **SLU hours rules (In progress, L1):** only time within the student's shift counts; overtime counts only if approved and at least 30 minutes; no offsetting on a late day; no grace period. Example: shift 8–5 with lunch, in at 7:55, out at 5:15 gives **8 hours**.
- **Deductions (Planned, L2):** SLU's deduction matrix (ADVISER and WWR points), editable by the faculty.

All rules with their sources: [Business rules](system/07-business-rules.md). All decisions: [Decisions and open questions](system/11-decisions-and-open-questions.md).

## 4. Data privacy at a glance (RA 10173)

- No signed copies, signatures, medical certificates or psychological records are stored in IDSMS (D2/D7).
- Every export of student data needs the Super Admin's password and is recorded in an **audit log that cannot be edited or deleted**, even by the system itself.
- Any user can **request a copy of their data**; the Super Admin has **15 days** and gets reminders.
- Stored files older than **3 years after their semester** are flagged for review. **Nothing is deleted automatically**, and deletion needs the admin's password.

Details: [Security and privacy](system/09-security-and-privacy.md).

## 5. Questions for the adviser

Please answer by number. Items marked **(default)** already have a working default, so the team can proceed without an answer. Background for each question is in [Decisions and open questions](system/11-decisions-and-open-questions.md), which uses the same numbering.

**Policy**

1. **D7 (status-only checklist):** is it acceptable that IDSMS only tracks the status of pre-deployment documents, with the files kept in Google Classroom? **(default: yes)**
2. **Required checklist items:** which items should be **required** for the endorsement letter, and which optional? Proposed required: Medical Certificate, Psychological Clearance, Parent's Consent and Undertaking, Government-Issued Company Permits, Work Plan, MOA. Proposed optional: Company Reply Form, DP Orientation, Internship Orientation, Proof of corporate legitimacy (foreign-owned only), Internship Agreement (irregular students only).
3. **Final hour approval:** is the faculty adviser's approval of a weekly report final, or should a second confirmation (coordinator or admin) be required before hours count? **(default: faculty only)**
4. **Endorsement before MOA approval:** is a per-student faculty switch the right control? Should the coordinator also be able to use it? **(default: adviser and coordinator)**

**Hours and reports**

5. **BSCS required hours:** is the default of **240** correct, or should BSCS follow "IT: 600"? (Admins can change it either way.)
6. **Grace period for lateness:** confirm there is none. **(default: none)**
7. **Monthly Journal:** is there an SLU template for the monthly journal? IDSMS currently produces a monthly report from the approved weeks; we will match a template if one exists.
8. **Week 1 date:** who should set the "Week 1 starts" date each semester: the coordinator, or each faculty adviser for their class? **(default: coordinator or Super Admin)**

**Deductions (SLU matrix)**

9. **Tier values:** is each value the **total** deduction at that count (e.g. 3 demerits = −5 in total), or **added per incident**? IDSMS supports both. **(default: total at that count)**
10. **Suspensions:** what are the point values for suspensions? The slide was cut off there.
11. **Final grade:** should IDSMS compute the **final internship grade**, or only show the deduction tally? If it should compute it, please share the formula (base scores and how ADVISER and WWR combine). **(default: tally only)**
12. **Demerit hours:** should a demerit also deduct rendered hours by default, and by how much? **(default: 0)**

**Other**

13. **Monitoring:** should IDSMS keep a log of **supervisor checks and OJT visitations** (date, who, notes)? It is currently noted for later.
14. **University suspensions:** should the calendar support "University suspension" days (in addition to PH holidays) so they count like holidays?
15. **Email notifications:** IDSMS can email students once the department provides a **sending email domain**. Can SLU provide one? Until then, notifications are in-app only.
16. **AI advisory (optional):** the AI feature (vague or similar-report hints for faculty) needs (a) approval to send report text to Google's AI, with names removed, under RA 10173, and (b) about 30 sample report pairs labelled by a faculty member to test accuracy. Should we pursue it, or leave it out?
17. **Hosting:** confirm the plan to run IDSMS on a **dedicated lab computer** in Phase 5, and who in the department or IT office will manage that machine.

## 6. Where to read more

| If you want to…                        | Read                                                      |
| -------------------------------------- | --------------------------------------------------------- |
| See every document and who it is for   | [System documentation index](system/README.md)            |
| Follow a student from start to finish  | [Internship lifecycle](system/02-internship-lifecycle.md) |
| See what faculty do on each screen     | [Faculty adviser guide](system/04-user-guide-faculty.md)  |
| Check a specific rule and its source   | [Business rules](system/07-business-rules.md)             |
| Look up a term (HTE, DTR, WWR, OT/UT…) | [Glossary](system/12-glossary.md)                         |
