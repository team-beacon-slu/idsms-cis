# IDSMS-CIS: status, decisions and questions for the adviser

_SAMCIS Internship Document Submission and Monitoring System (IDSMS-CIS). Prepared by the project team. Last updated: 12 October 2026._

This document explains what IDSMS does today, what the team decided recently (mostly from SLU's internship orientation slides), and what still needs the adviser's decision. **Section 5 lists the questions**, numbered so you can answer by number.

---

## 1. Where the project stands

| Area                                                                                                   | Status                                   |
| ------------------------------------------------------------------------------------------------------ | ---------------------------------------- |
| Accounts, roles and security (Phase 1)                                                                 | Done                                     |
| Pre-deployment checklist, companies and MOAs (Phase 2)                                                 | Done (checklist now status-only, see D7) |
| Attendance, weekly/monthly reports, calendar (Phase 3)                                                 | Done                                     |
| Server-generated PDFs (weekly, monthly, endorsement letter, final report cover)                        | Done                                     |
| Notifications (in-app; email when a sending domain is configured)                                      | Done                                     |
| Role dashboards and Excel exports; semester activate/archive; audit log                                | Done                                     |
| Data privacy and compliance (Export Center, "Request my data", file retention, tamper-proof audit log) | Done                                     |
| **Leave & Time Requests + SLU weekly report format + SLU hours rules** (Workstream L1)                 | **In progress**                          |
| Checklist & MOA settings (optional items, faculty endorsement override, MOA without uploads)           | Next                                     |
| Conduct and deductions: SLU deduction matrix (Workstream L2)                                           | Planned                                  |
| Final Technical Report, HTE evaluation, certificates (Workstream H)                                    | Planned                                  |
| AI advisory: report similarity and sentiment (Workstream D)                                            | Last; optional                           |
| Hosting on the lab computer (Phase 5)                                                                  | After Phase 4                            |

Automated checks on every change: type checking, linting, about 700 tests and a production build. Each feature is code-reviewed before it is merged.

---

## 2. What each role can do today

**Student intern**

- Pre-deployment checklist: sees the status of each requirement (documents are submitted in Google Classroom).
- Work plan and schedule.
- Daily time record, weekly reports (due Tuesday of the following week, with late flags) and monthly reports.
- Downloadable PDFs.
- Hours progress and projected completion date.
- Calendar with PH holidays.
- Notifications.
- "Request my data" (Data Privacy Act).

**Faculty adviser**

- Dashboard of assigned students: hours, checklist progress and weekly report status.
- Review weekly reports (Approve / Return / Regard).
- Mark checklist items Approved or Returned (a note is required when returning).
- Generate endorsement letters, individually or in bulk.
- Excel exports.

**Department coordinator**

- Department dashboard by program, MOA expiry alerts, filters and Excel exports.
- Companies and MOAs.
- Semesters.

**Super Admin**

- Users and roles; required hours per program; semesters (activate/archive).
- Searchable audit log.
- **Export Center**: six Excel exports, each needing a password re-check and recorded in the audit log.
- Data-request queue; review of old files.

---

## 3. Decisions already made

| #                                      | Decision                                                                                                                                                                                                                               | Why / effect                                                                                                                                                                                                                                                            |
| -------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D2                                     | IDSMS never stores signed or sensitive documents (supervisor-signed copies, signatures)                                                                                                                                                | They go to **Google Classroom**                                                                                                                                                                                                                                         |
| **D7**                                 | **All pre-deployment checklist items, and the post-internship certificates (Attendance from the CPO, Completion from the HTE), are status tracking only**                                                                              | Students submit files in Google Classroom; staff record Approved or Returned in IDSMS. No medical or psychological records are stored in IDSMS. Provisional: the adviser may revise this                                                                                |
| Hours                                  | BSIT **600**, BMMA **500** (as on SLU's slide); BSCS default **240**                                                                                                                                                                   | Defaults only; the Super Admin can change required hours per program                                                                                                                                                                                                    |
| Shift                                  | **Each student has their own shift** (start, end, lunch break) in their work plan, e.g. 8:00–5:00 with a 1-hour lunch                                                                                                                  | Used to compute hours and detect lateness                                                                                                                                                                                                                               |
| Credited hours                         | Only time **within the shift** counts. Time before or after the shift counts **only as approved overtime of at least 30 minutes**. **No offsetting**: extra time is never credited on a day the intern was late                        | Faculty-confirmed example: shift 8–5 with lunch, in at 7:55, out at 5:15, gives **8 hours, not 8 h 20 m**                                                                                                                                                               |
| Grace period                           | **None**: any time-in after the shift start is late                                                                                                                                                                                    | The intern must file an undertime (or leave) request for that day before submitting the week                                                                                                                                                                            |
| Overtime timing                        | Before or after the shift, or on a non-scheduled day such as Saturday, **at the faculty's discretion**                                                                                                                                 | The adviser's approval of the request is the ruling                                                                                                                                                                                                                     |
| Half days                              | A planned half day is **leave** (with a time range); an unplanned short day is **undertime**                                                                                                                                           | Both are filed in the new "Leave & Time Requests" tab                                                                                                                                                                                                                   |
| Week numbers                           | **Week 1 is set by the faculty for each semester** (e.g. Week 1 starts on the 11th)                                                                                                                                                    | A student who deploys later starts at Week 2 or 3                                                                                                                                                                                                                       |
| Name on reports                        | Taken from the school email; the student can correct it in their Profile                                                                                                                                                               | Printed as "Last, First M." on the weekly report                                                                                                                                                                                                                        |
| Weekly report format                   | Follows **SLU's Weekly Work Report template**                                                                                                                                                                                          | Two time ranges per day, "N hrs M mins", beginning and ending totals, and an Overtime / Under Time section, each signed by the supervisor                                                                                                                               |
| Deductions                             | Follows **SLU's deduction matrix** (ADVISER and WWR points). **The faculty can edit the matrix** in IDSMS                                                                                                                              | Late or missing reports and unsupported undertime/absences are counted automatically. Warnings, demerits, violations and suspensions are entered by staff. "Excused" exceptions are allowed for HTE-attested documentation or circumstances beyond the intern's control |
| Demerit hours                          | A demerit can also deduct rendered hours, **default 0**, adjustable                                                                                                                                                                    | Flexible, not hard-coded                                                                                                                                                                                                                                                |
| Endorsement letter before MOA approval | **The faculty decides per student**                                                                                                                                                                                                    | Planned: an "Allowed to start before MOA approval" switch, set by the adviser or coordinator with a reason                                                                                                                                                              |
| Checklist items                        | Add **Proof of corporate legitimacy** (foreign-owned HTEs) and **Internship agreement** (irregular students); keep Company Reply Form, DP Orientation and Internship Orientation; **the Super Admin decides which items are required** | The endorsement gate counts only the required items                                                                                                                                                                                                                     |
| MOA document                           | Status, dates and a Google Drive link only; **no upload of the wet-signed MOA**. Companies get a "foreign HTE" flag                                                                                                                    | Different MOA template for HTEs outside the Philippines                                                                                                                                                                                                                 |

---

## 4. Data privacy at a glance (RA 10173)

- No signed copies, signatures, medical certificates or psychological records are stored in IDSMS (D2/D7).
- Every export of student data needs the Super Admin's password and is recorded in an **audit log that cannot be edited or deleted**, even by the system itself.
- Any user can **request a copy of their data**; the Super Admin has **15 days** and gets reminders.
- Stored files older than **3 years after their semester** are flagged for review. **Nothing is deleted automatically**, and deletion needs the admin's password.

---

## 5. Questions for the adviser

Please answer by number. Items marked **(default)** already have a working default, so the team can proceed without an answer.

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

---

## 6. Noted for later (not being built yet)

- Monitoring log (supervisor checks, OJT visitations) — see Q13.
- Flag for **habitual tardiness or absences** on the faculty dashboard.
- "University suspension" calendar type — see Q14.
- Coordinator-posted department events (orientation, medical exam, psych assessment schedules) on students' calendars.
