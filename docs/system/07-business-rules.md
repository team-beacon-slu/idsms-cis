# 07. Business rules

_Last updated: 12 October 2026. Status labels: **Built**, **In progress**, **Planned** (see the [index](README.md))._

Every rule IDSMS enforces, with its source. Sources are PRD requirement IDs (`PRD.md`), SLU internship guideline slides, or decisions recorded in [11. Decisions and open questions](11-decisions-and-open-questions.md). Rules are enforced on the server, so they hold even if someone bypasses the screens.

## 1. Accounts and access

| Rule                                                                                                                                                                                              | Source                              | Status    |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------- | --------- |
| Four roles: Student intern, Faculty adviser, Department coordinator, Super Admin. Each screen and action checks the role.                                                                         | FR-UM-01, FR-UM-09                  | **Built** |
| A student sees only their own records. A faculty adviser sees only students in their assigned class groups for that semester. Coordinator and Super Admin see all students.                       | FR-UM-09, NFR-SEC-01                | **Built** |
| Students are created by bulk import of the class list. Default passwords are derived from the student number with a secret key and shown once to the importer.                                    | FR-UM-02, FR-UM-03                  | **Built** |
| A new password must be set at first login before any other page opens.                                                                                                                            | FR-UM-04                            | **Built** |
| Sessions expire after **30 minutes** of inactivity.                                                                                                                                               | FR-UM-06                            | **Built** |
| **5** consecutive failed sign-ins lock the account for **15 minutes** and end its active sessions. A Super Admin can unlock early.                                                                | FR-UM-07, FR-UM-10, FR-UM-11        | **Built** |
| Password reset links are valid for **1 hour**; completing a reset ends all sessions. A locked account stays locked until the lock expires.                                                        | FR-UM-10, FR-UM-11                  | **Built** |
| Deactivation, forced logout, lockout and password reset end the user's sessions immediately.                                                                                                      | FR-UM-11                            | **Built** |
| Sensitive actions (Export Center downloads, data request exports, deleting retained files, bulk endorsement letters) require the user's password again. Wrong passwords count toward the lockout. | NFR-SEC-05 (MFA deferred, FR-UM-05) | **Built** |

## 2. Required hours

| Rule                                                                                                                                                                     | Source                                                        | Status    |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------- | --------- |
| Default required hours: **BSIT 600, BMMA 500, BSCS 240**.                                                                                                                | SLU slide (IT 600, MMA 500); PRD (BSCS 240); open question Q5 | **Built** |
| The Super Admin can change required hours per program. Hours are never hard-coded. A change applies to students imported afterwards; existing students keep their value. | FR-AT-06, NFR-MNT-03                                          | **Built** |
| Each student's required hours come from the import file.                                                                                                                 | FR-UM-02                                                      | **Built** |

## 3. Pre-deployment checklist and endorsement letter

| Rule                                                                                                                                                                                                                                                               | Source                                         | Status                                 |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------- | -------------------------------------- |
| Nine items per student: Medical Certificate, Psychological Clearance, Parent's Consent and Undertaking, Company Reply Form, DP Orientation Certification, Internship Orientation Completion, Government-Issued Company Permits, Work Plan, MOA.                    | FR-CK-01                                       | **Built**                              |
| **Status only:** documents are submitted in Google Classroom; IDSMS records Pending / Approved / Returned. No checklist files are uploaded or stored.                                                                                                              | Decision D7 (PR #85)                           | **Built**                              |
| Staff (assigned faculty adviser, coordinator, Super Admin) record Approve or Return. **Returning requires a note** (up to 500 characters).                                                                                                                         | FR-CK-02, D7                                   | **Built**                              |
| The **Work Plan** item can be approved only if the student's latest work plan is Approved. The **MOA** item only if the student's company has an **Approved / Active** MOA covering the student's program.                                                         | FR-CK-04                                       | **Built**                              |
| Completion percentage is shown in real time.                                                                                                                                                                                                                       | FR-CK-03                                       | **Built**                              |
| **Endorsement gate:** the endorsement letter cannot be generated until **all 9 items are Approved**. The letter also needs the student's legal name and a host company.                                                                                            | FR-CK-04, FR-DG-01                             | **Built**                              |
| Bulk endorsement: per class group, up to 40 students per run, password re-check; ineligible students are skipped.                                                                                                                                                  | FR-DG-02, NFR-SEC-05                           | **Built**                              |
| The Super Admin chooses which items are **required**; the gate counts only required items. New items: Proof of corporate legitimacy (foreign-owned HTEs), Internship agreement (irregular students).                                                               | Decision (checklist items), Q2                 | **Planned** (Checklist & MOA settings) |
| **Endorsement override:** the adviser (or coordinator / Super Admin) can mark a student "Allowed to start before MOA approval" with a reason; it satisfies only the MOA part of the gate, is audited and can be withdrawn.                                         | Decision (endorsement before MOA approval), Q4 | **Planned**                            |
| Post-internship certificates (Attendance from the CPO, Completion from the HTE) are tracked as status only.                                                                                                                                                        | D7                                             | **Planned** (H)                        |
| **Consent is handled under D7:** consent forms (Parent's Consent and Undertaking, Data Privacy orientation) are submitted in Google Classroom; IDSMS records only their status as checklist items. No separate consent capture is built.                           | FR-CK-05, NFR-DP-03, D7                        | **Built** (status only)                |
| A faculty member or the Super Admin can create class groups, assign faculty to class groups and create staff accounts from screens. Today staff accounts can be created only via `POST /api/users` (Super Admin), and class groups and assignments have no screen. | PM decision                                    | **Planned**                            |

## 4. Hours counting

### 4.1 Current rule (Built)

- Each day in a weekly report is **Present**, **Absent** or **Holiday**. Absent and holiday days count **0 hours**. A present day's hours are entered by the student and cannot exceed the time between time in and time out.
- **Confirmed hours** = the sum of daily hours in weekly reports with status **Approved** or **Regarded**. Only confirmed hours count toward required hours, the projected completion date, the final report threshold and the "Completed" status. (FR-AT-05, FR-WR-06)
- **Pending hours** = hours in submitted reports still waiting for faculty review. They are shown separately ("+N hrs pending review") and do not count. (Phase 4 B, adviser feedback)
- **Projected completion date** = today plus the number of scheduled working days needed to cover the remaining hours at the scheduled hours per day (Manila weekdays). (FR-AT-05)
- Approved schedule changes apply only from then on; past approved hours never change. (FR-AT-10)
- Deviation reports (absence, overtime, undertime) are validated by staff; the hours effect comes from the daily entries in approved weeks. (FR-AT-03, FR-AT-04)

### 4.2 SLU credited-hours rules (In progress, Workstream L1; not active yet)

Source: SLU slides "Leaves and Absences" and "Under Time (UT) and Over Time (OT)", the SLU Weekly Work Report sample, and faculty answers relayed on 12 October 2026.

| Rule                                                                                                                                                                                                                                                               | Source                                |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------- |
| Each student has their own **shift** (start, end, lunch break) in the work-plan schedule; new schedules default to **8:00–5:00 with a 1-hour lunch**.                                                                                                              | Decision (shift)                      |
| A day can have **two time ranges** (morning and afternoon). Hours are shown as "N hrs M mins".                                                                                                                                                                     | SLU Weekly Work Report template       |
| Only time **inside the shift** counts, minus the break, capped at the scheduled hours.                                                                                                                                                                             | Decision (credited hours), SLU sample |
| Time outside the shift counts **only as approved overtime** of **at least 30 minutes**, capped at the approved minutes. 29 minutes is not credited; 30 minutes is.                                                                                                 | SLU OT/UT slide                       |
| Overtime must be requested **before** it is worked; a request for a past date is accepted but labelled "Filed after the fact" for the adviser. Overtime may be before or after the shift, or on a non-scheduled day such as Saturday, at the faculty's discretion. | SLU OT/UT slide; decision (OT timing) |
| **No offsetting:** on a day the intern was late, extra time is never credited, even if the supervisor signed the report.                                                                                                                                           | SLU OT/UT slide                       |
| **No grace period:** any time-in after the shift start is late. Lateness and leaving early become **undertime**, which needs an undertime or leave request with a reason before the week can be submitted.                                                         | Decision (grace period), Q6           |
| A planned partial day is **leave** with a time range; an unplanned short day is **undertime**.                                                                                                                                                                     | Decision (half days)                  |
| Approved leave shows in the daily time record (for example "Approved leave") with 0 hours. Proof in Google Classroom (proposed, pending confirmation, Q19).                                                                                                        | SLU leave slide, D2/D7                |
| Week numbers count from a **"Week 1 starts"** date set for the semester; a student who deploys later starts at Week 2 or 3.                                                                                                                                        | Decision (week numbers), Q8           |
| Existing approved weeks are recomputed under the new rules; the change lists students whose totals change.                                                                                                                                                         | Decision (existing data)              |

**Worked examples** (shift 8:00–12:00 and 1:00–5:00, 1-hour lunch). These are test cases in the L1 plan:

| Day                                  | Time record                     | Credited                                              | Why                                                                                                                |
| ------------------------------------ | ------------------------------- | ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Early arrival, slightly late leaving | 7:35–12:10 and 1:00–5:05        | **8 hrs**                                             | Time before 8:00 and after 12:00/5:00 is outside the shift.                                                        |
| Late arrival                         | 8:30–12:00 and 1:00–5:00        | **7 hrs 30 mins** + **30 mins undertime** (8:00–8:30) | Late by 30 minutes; the gap becomes an undertime entry that needs a reason before the week can be submitted.       |
| Faculty-confirmed FAQ                | 7:55 in, 5:15 out               | **8 hrs** (not 8 hrs 20 mins)                         | The 5 minutes before and 15 minutes after are outside the shift, and 20 minutes is below the 30-minute OT minimum. |
| Approved overtime on a Saturday      | 8:00–12:00, approved OT request | **4 hrs**                                             | Non-scheduled day: all time counts only as approved OT (at least 30 minutes).                                      |

## 5. Weekly reports

| Rule                                                                                                                                                                                                                                                                                                                                             | Source                             | Status           |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------- | ---------------- |
| A weekly report covers Monday to Sunday and lists the student's scheduled working days, skipping holidays the student marked. One report per student per week.                                                                                                                                                                                   | FR-WR-01                           | **Built**        |
| Only the student enters hours and accomplishments. Every day must be filled before submitting.                                                                                                                                                                                                                                                   | FR-WR-03                           | **Built**        |
| **Deadline: Tuesday 11:59 PM (Manila)** of the following week. After that the submission is flagged **late** and a **reason for delay** is required.                                                                                                                                                                                             | FR-WR-05, SLU guidelines           | **Built**        |
| Each submission gets a reference code `WR-YYYYMMDD-XXXXXXXX` and a timestamp.                                                                                                                                                                                                                                                                    | FR-WR-10, FR-DG-04                 | **Built**        |
| A near-identical day (compared with other days and with the previous week) triggers a warning before submitting.                                                                                                                                                                                                                                 | FR-WR-04                           | **Built**        |
| A report is editable only as a draft or after being returned; it is locked while under review and after a final decision.                                                                                                                                                                                                                        | FR-WR-06                           | **Built**        |
| **Review actions (assigned faculty adviser only):** **Approve** (hours count, final); **Return** (note required, student revises, hours do not count yet); **Regard** (hours count, minor improvement noted, no revision); **Disregard** (invalid submission; the report is removed and the student starts that week again; hours do not count). | FR-WR-06; Q3 (second confirmation) | **Built**        |
| The PDF printed for the supervisor's signature shows only confirmed (submitted) content. The signed copy goes to Google Classroom, never to IDSMS.                                                                                                                                                                                               | FR-DG-05, D2                       | **Built**        |
| Late or missing reports count toward deductions.                                                                                                                                                                                                                                                                                                 | SLU deduction matrix               | **Planned** (L2) |

## 6. Monthly reports

| Rule                                                                                                       | Source   | Status     |
| ---------------------------------------------------------------------------------------------------------- | -------- | ---------- |
| Monthly reports group weekly reports by **calendar month**.                                                | FR-WR-08 | **Built**  |
| A monthly report can be submitted only when **every** weekly report in that month is Approved or Regarded. | FR-WR-08 | **Built**  |
| Each monthly report gets a PDF with reference code `MR-YYYYMM-XXXXXXXX`.                                   | FR-DG-04 | **Built**  |
| Layout will follow SLU's monthly journal template if one exists.                                           | Q7       | To confirm |

## 7. Work plans, schedules and deviations

| Rule                                                                                                                                                                                               | Source              | Status               |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------- | -------------------- |
| The coordinator or Super Admin approves or returns work plans (faculty cannot).                                                                                                                    | FR-WP-02            | **Built**            |
| An approved work plan is locked; changes need a new submission and re-approval.                                                                                                                    | FR-WP-06            | **Built**            |
| The work schedule (working days, hours per day) can be set only after the work plan is approved.                                                                                                   | FR-AT-01, FR-WP-04  | **Built**            |
| A schedule change needs a reason, the adviser's validation, then the coordinator's (or Super Admin's) final approval. It is recorded in the work plan's change history.                            | FR-AT-08, 09, 11    | **Built**            |
| Deviation reports are validated by staff before they are considered.                                                                                                                               | FR-AT-04            | **Built**            |
| Proposed: deviation proof uploads are replaced by status-only leave, OT and UT requests with a reason (proof in Google Classroom). Pending confirmation; today a proof file can still be uploaded. | D2/D7, L1 spec, Q19 | Pending confirmation |

## 8. Documents (PDFs)

| Rule                                                                                                                                                                                                                                              | Source           | Status    |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------- | --------- |
| PDFs are generated on the server: weekly report, monthly report, endorsement letter (`EL-YYYYMMDD-XXXXXXXX`), final report cover (`FC-YYYYMMDD-XXXXXXXX`).                                                                                        | FR-DG-03, 04, 06 | **Built** |
| On failure IDSMS retries up to **3 times** (waiting 1, 2 and 4 seconds), then marks the document **Failed** and offers **Regenerate**. The submission itself is never lost.                                                                       | FR-DG-07         | **Built** |
| The final report cover unlocks when confirmed hours reach the threshold: configurable per program; default **500 for BSIT**, otherwise **five-sixths of required hours**; never above the student's required hours. It also needs the legal name. | FR-FT-01         | **Built** |
| Files are capped at **5 MB** (PDF) and **2 MB** (JPG/PNG).                                                                                                                                                                                        | PRD constraints  | **Built** |

## 9. Notifications

In-app notifications are always created; email is sent only when a sending domain is configured (Q15). Notifications never block the action that caused them. Duplicate reminders are prevented.

| Trigger                                                                                                                                                                    | Recipients                          | Source                 | Status                           |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------- | ---------------------- | -------------------------------- |
| Account created (bulk import)                                                                                                                                              | The new user (no password included) | FR-NT-01 #1            | **Built**                        |
| Password reset requested                                                                                                                                                   | The user (reset link)               | FR-NT-01 #2            | **Built**                        |
| Weekly report submitted                                                                                                                                                    | Student and assigned faculty        | FR-NT-01 #3            | **Built**                        |
| Weekly report returned (with note)                                                                                                                                         | Student                             | FR-NT-01 #4            | **Built**                        |
| Report approved, regarded or returned (email)                                                                                                                              | Student and assigned faculty        | FR-WR-07               | **Built** (email needs a domain) |
| Deadline reminders, default **48 h and 24 h** before Tuesday 11:59 PM (configurable 16–168 h, up to 3 windows), including students who have not started last week's report | Student                             | FR-NT-01 #5, #6, #12   | **Built**                        |
| Endorsement letter ready                                                                                                                                                   | Student                             | FR-NT-01 #7            | **Built**                        |
| MOA expiring within the warning window (default **30 days**)                                                                                                               | Coordinators and Super Admins       | FR-NT-01 #8, FR-MOA-05 | **Built**                        |
| Checklist item approved or returned                                                                                                                                        | Student                             | FR-NT-01 #9            | **Built**                        |
| Work plan approved or returned                                                                                                                                             | Student                             | FR-NT-01 #10           | **Built**                        |
| Deviation validated or rejected                                                                                                                                            | Student                             | FR-NT-01 #11           | **Built**                        |
| New data request; request due within 3 days or overdue (daily)                                                                                                             | Super Admins                        | NFR-DP-07              | **Built**                        |
| Files flagged for retention review                                                                                                                                         | Super Admins                        | NFR-DP-08              | **Built**                        |
| Leave/time request returned                                                                                                                                                | Student                             | L1 spec                | **In progress**                  |
| Conduct record issued                                                                                                                                                      | Student                             | L2 spec                | **Planned**                      |

All scheduled checks run in **one daily job at 8:00 AM Manila** (FR-NT-05).

## 10. Privacy and records

| Rule                                                                                                                                                                                                       | Source                 | Status    |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------- | --------- |
| IDSMS never stores signed copies, signatures, medical certificates or psychological records.                                                                                                               | D2, D7                 | **Built** |
| **Data requests (DSAR):** any user can request a copy of their data; it is due **15 days** later; one open request per user; the Super Admin is reminded from 3 days before the due date.                  | NFR-DP-07              | **Built** |
| **File retention:** stored files from semesters that ended more than **3 years** ago are flagged (scan every 90 days) for Super Admin review. Nothing is deleted automatically; deletion needs a password. | NFR-DP-06, NFR-DP-08   | **Built** |
| Every export of student data needs a password re-check and is recorded in the audit log.                                                                                                                   | NFR-SEC-05, NFR-SEC-07 | **Built** |
| The audit log is append-only: no edits or deletions by anyone, including the system.                                                                                                                       | NFR-SEC-10             | **Built** |
| Archiving a semester deletes nothing.                                                                                                                                                                      | FR-DB-07, FR-DB-08     | **Built** |
| Users are deactivated, never hard-deleted.                                                                                                                                                                 | Audit log integrity    | **Built** |

## 11. Conduct and deductions (Planned, Workstream L2)

Source: SLU "Deduction Matrix" and "Issues" slides; decisions of 12 October 2026. Not available yet.

- Deductions are **grade points** in two columns, **ADVISER** and **WWR** (Weekly Work Report), by count tier.
- The matrix is **editable configuration** (the faculty will revise it). Initial values from the slide:

  | Category                    | Tiers (count → ADVISER / WWR)              | Extra if no valid reason | Entry     |
  | --------------------------- | ------------------------------------------ | ------------------------ | --------- |
  | Written warnings            | 1 → −2/−2; 2 → −3/−3                       | —                        | Manual    |
  | Demerits                    | 1 → −3/−3; 2 → −4/−4; 3 → −5/−5; 4 → −6/−7 | —                        | Manual    |
  | Late WWR / monthly journals | 1 → −3/−5; 2 → −4/−6; 3 → −5/−7; 4 → −6/−8 | −2 for a missing one     | Automatic |
  | Unsupported UT / absences   | 1 → −2/−2; 2 → −3/−3; 3 → −4/−4; 4 → −5/−5 | −2                       | Automatic |
  | Major violations            | 1 → −4/−5; 2 → −5/−6                       | —                        | Manual    |
  | Suspensions                 | To be filled in by the faculty (Q10)       | —                        | Manual    |

- A "First and Final" warning, or a "Final" warning without a "First", counts as 2 warnings.
- Tier values are the **total** at that count by default; "per incident" is also supported (Q9).
- Submitting a late or missing deliverable afterwards does **not** remove its deduction. Staff can mark an automatic item **Excused** for HTE-attested documentation or circumstances beyond the intern's control, with a note; excuses are audited and can be withdrawn.
- Records are never deleted, only revoked with a reason; the intern is notified and can see their tally.
- A record can also deduct rendered hours (default **0**, adjustable; Q12).
- IDSMS shows the tally; it does **not** compute the final grade (Q11).
