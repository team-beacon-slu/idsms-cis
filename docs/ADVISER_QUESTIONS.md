# Questions for our adviser

_IDSMS-CIS (SAMCIS Internship Document Submission and Monitoring System), Saint Louis University. Prepared by Team BEACON. Last updated: 23 October 2026._

This is the **only** list of open questions for the adviser. It replaces the older "Adviser briefing" and the question list in the system docs, so there is one place to read and answer.

## How to use this document

1. Read the one-minute status below.
2. Go through the questions. Each one says **what we are asking**, **why**, **what IDSMS does today**, the **options** and **what we recommend**.
3. Write your answers in the **answer sheet** at the end (a letter, "yes/no", or a short note is enough). Please answer by number.

Every question has one of two tags:

| Tag                       | Meaning                                                                                                    |
| ------------------------- | ---------------------------------------------------------------------------------------------------------- |
| **Has a working default** | IDSMS already works a sensible way. If you agree, write "OK". We only change it if you choose differently. |
| **Needs your answer**     | We cannot finish this part, or we would be guessing about an SLU rule. These matter most before launch.    |

Nothing here is final. Everything already built, including the rules below, follows the project manager's reading of SLU's internship instructions and can still change on your advice.

## Where the project stands (one minute)

- **Built and working:** accounts and roles; the pre-deployment checklist (status only, files stay in Google Classroom); companies and MOAs; attendance with SLU's hours rules; leave, overtime and undertime requests; weekly and monthly reports in SLU's format with PDFs; endorsement letters; the final technical report; conduct records and SLU's deduction matrix; notifications; dashboards and Excel exports; data-privacy tools (privacy notice and terms, "Request my data", tamper-proof audit log, file retention review); a help page; light and dark themes.
- **Built but switched off:** AI hints for faculty (similar or vague reports). It stays off until you decide on question 16.
- **Next:** Phase 5, moving IDSMS from the free cloud services to a SAMCIS lab computer, then testing with real interns, faculty and the coordinator. No new features are planned in Phase 5.
- **Quality:** every change passes type checks, linting, about 1,100 automated tests and a production build, and is reviewed before it is merged.

More detail: [system documentation](system/README.md), starting with the [product overview](system/01-product-overview.md).

---

## A. Policy

### Q1. May IDSMS track pre-deployment documents by status only? — _Has a working default_

- **The question:** Is it acceptable that students upload their pre-deployment documents (medical certificate, psychological clearance, parent's consent and so on) to **Google Classroom**, while IDSMS only records whether each one is **Approved** or **Returned**?
- **Why we ask:** These documents hold sensitive personal and health information. Keeping them out of IDSMS lowers the privacy risk under the Data Privacy Act (RA 10173).
- **What IDSMS does today:** Status only. Staff mark each item Approved or Returned (a return needs a note). No files are stored.
- **Options:** **A.** Keep status only. **B.** Let students upload the files into IDSMS as well.
- **We recommend:** A.
- **If you choose B:** We would add encrypted uploads, stricter access and a retention rule for health records. About one week of work.

### Q2. Which checklist items must be approved before the endorsement letter? — _Has a working default_

- **The question:** Which items should be **required** before a student can get an endorsement letter, and which are **optional**?
- **Why we ask:** The endorsement letter is blocked until every required item is approved, so this list decides when students can start.
- **What IDSMS does today:** The original **nine** items are required: Medical Certificate, Psychological Clearance, Parent's Consent and Undertaking, Company Reply Form, Data Privacy Orientation, Internship Orientation, Government-Issued Company Permit, Work Plan and MOA. Two newer items are optional: Proof of Corporate Legitimacy (foreign-owned companies only) and Internship Agreement (irregular students only). The Super Admin can change the list at any time in Settings.
- **Options:** **A.** Keep all nine required. **B.** Require only six (Medical Certificate, Psychological Clearance, Parent's Consent, Government Permit, Work Plan, MOA) and make the three orientation and reply items optional. **C.** Another list (please write it).
- **We recommend:** A, until you tell us otherwise.
- **If you choose B or C:** It is a setting, so the change takes minutes.

### Q3. Is the faculty adviser's approval of a weekly report final? — _Has a working default_

- **The question:** When a faculty adviser approves a weekly report, do its hours count straight away, or should the coordinator or an admin confirm them too?
- **Why we ask:** Confirmed hours decide when an intern finishes.
- **What IDSMS does today:** The adviser's approval is final. Approved and "Regarded" weeks count as confirmed hours.
- **Options:** **A.** Adviser only. **B.** Adviser, then a second confirmation by the coordinator.
- **We recommend:** A. A second step doubles the work and delays students.
- **If you choose B:** We add a "Confirm" step and a queue for the coordinator. About three days.

### Q4. Who may let an intern start before the MOA is approved? — _Has a working default_

- **The question:** Sometimes an intern needs to start before the company's MOA is fully approved. Who should be allowed to grant this?
- **What IDSMS does today:** The intern's faculty adviser, the coordinator or the Super Admin can switch on "Allowed to start before MOA approval" for one student. A reason is required, and every change is recorded in the audit log.
- **Options:** **A.** Keep it (adviser, coordinator, Super Admin). **B.** Coordinator and Super Admin only. **C.** Never allow it.
- **We recommend:** A.
- **If you choose B or C:** A small change (under a day).

---

## B. Hours and reports

### Q5. How many hours must BSCS interns complete? — _Needs your answer_

- **The question:** Is **240 hours** right for BSCS, or should BSCS follow IT at 600?
- **Why we ask:** SLU's slide lists BSIT 600 and BMMA 500 but not BSCS.
- **What IDSMS does today:** BSIT 600, BMMA 500, BSCS 240. The Super Admin can change any of them in Settings.
- **Options:** **A.** 240. **B.** 600. **C.** Another number.
- **If you choose B or C:** It is a setting; it takes a minute.

### Q6. Is there a grace period for lateness? — _Has a working default_

- **The question:** Please confirm there is **no grace period**: any time-in after the shift starts counts as late.
- **What IDSMS does today:** No grace period. A late intern files an undertime (or leave) request for that day before submitting the week. Time outside the shift only counts as approved overtime of at least 30 minutes, and extra time never makes up for a late day. Example: a shift of 8:00–5:00 with lunch, in at 7:55 and out at 5:15, gives **8 hours**.
- **Options:** **A.** No grace period. **B.** A grace period of ___ minutes.
- **If you choose B:** A setting plus a small rule change (about a day).

### Q7. Is there an SLU template for the monthly journal? — _Needs your answer_

- **The question:** Does SLU have an official template for the monthly journal or monthly report? If so, please share it.
- **What IDSMS does today:** It builds a monthly report PDF from the approved weekly reports, in a simple layout.
- **If you share a template:** We will match it exactly. About two days.

### Q8. Who sets the "Week 1 starts" date each semester? — _Has a working default_

- **The question:** Week numbers on the weekly report start from a "Week 1" date. Should the coordinator set one date for everyone, or should each faculty adviser set it for their own class?
- **What IDSMS does today:** The coordinator or Super Admin sets one date per semester. A student who deploys later starts at Week 2 or 3.
- **Options:** **A.** Coordinator or Super Admin, one date per semester. **B.** Each faculty adviser, one date per class group.
- **We recommend:** A.
- **If you choose B:** We move the date to each class group. About a day.

### Q21. May a student take back a weekly report they already submitted? — _Needs your answer_

- **The question:** If a student notices a mistake right after submitting, may they pull the report back to "draft" to fix it, as long as the adviser has not reviewed it yet?
- **Why we ask:** Today the only way to fix a submitted report is for the adviser to return it, which adds work for the adviser.
- **What IDSMS does today:** Once submitted, the student cannot change it. The adviser can return it with a note.
- **Options:** **A.** Keep it as is (only the adviser can return it). **B.** Allow "Withdraw to draft" until the adviser opens or reviews it, recorded in the report's history. **C.** Allow it only before the Tuesday 11:59 PM deadline.
- **We recommend:** C. It saves advisers work without letting students change a report after the deadline.
- **If you choose B or C:** About a day of work.

---

## C. Deductions (SLU's deduction matrix)

### Q9. How do the deduction tiers add up? — _Has a working default_

- **The question:** On the matrix, is each value the **total** deduction at that count (for example "3 demerits = −5 in total"), or is it **added for each incident** (−3, then −4, then −5, for −12 in total)?
- **What IDSMS does today:** "Total at that count". IDSMS supports both, and each category can be switched.
- **Options:** **A.** Total at that count. **B.** Added per incident.

### Q10. What are the point values for suspensions? — _Needs your answer_

- **The question:** The orientation slide was cut off at the suspension row. What are the ADVISER and WWR points for a suspension?
- **What IDSMS does today:** The suspension row exists but its values are blank until you tell us. Faculty can edit the matrix, so you can also enter them yourself.

### Q11. Should IDSMS calculate the final internship grade? — _Has a working default_

- **The question:** Should IDSMS compute the **final grade**, or only show the deduction tally that faculty use when grading?
- **What IDSMS does today:** It shows the tally only (ADVISER and WWR points per student).
- **Options:** **A.** Tally only. **B.** Compute the grade. If B, please share the formula: the base scores and how ADVISER and WWR points combine.
- **We recommend:** A, unless SLU wants one official formula applied the same way for everyone.

### Q12. Should a demerit also deduct rendered hours? — _Has a working default_

- **The question:** Besides points, should a demerit take hours away from the intern's rendered hours, and how many?
- **What IDSMS does today:** 0 hours by default. Staff can enter hours on each conduct record, and the default is a setting.
- **Options:** **A.** 0 by default. **B.** ___ hours per demerit.

---

## D. Monitoring and the internship's end

### Q13. Should IDSMS log supervisor checks and OJT visits? — _Needs your answer_

- **The question:** CHED's internship rules (CMO No. 104, s. 2017) expect the school to monitor interns. Should IDSMS keep a log of supervisor check-ins and faculty visits to the company (date, who, notes)?
- **What IDSMS does today:** Not built. It is on the list for later.
- **Options:** **A.** Not needed; it is recorded elsewhere. **B.** Add a simple monitoring log per student.
- **If you choose B:** About three days.

### Q22. What should happen when an intern is pulled out or moves to another company? — _Needs your answer_

- **The question:** CMO No. 104 lets the school pull an intern out of a company (for example for safety reasons). How should IDSMS handle a pull-out or a move to a new company in the middle of the internship?
- **Why we ask:** Hours, reports and the MOA are tied to one company. A move affects all three.
- **What IDSMS does today:** Not supported. Company transfers in mid-internship were left out of scope in the original requirements.
- **Options:** **A.** Keep it out of scope; staff handle these rare cases manually. **B.** Add a "Pulled out" status that freezes the record with a reason. **C.** Add B plus moving the intern to a new company, keeping the hours already confirmed.
- **We recommend:** A for now, B if pull-outs happen every semester.

### Q14. Should the calendar support "University suspension" days? — _Needs your answer_

- **The question:** When the university suspends work or classes (for example for weather), should those days count like holidays, so interns are not marked absent?
- **What IDSMS does today:** Philippine holidays are in the calendar. University suspensions are not.
- **Options:** **A.** No. **B.** Yes, the coordinator can add suspension days.
- **If you choose B:** About a day.

### Q18. What does "CPO" stand for? — _Needs your answer_

- **The question:** The Certificate of Attendance is issued by the "CPO". What does CPO stand for, so the screens and documents name it correctly?

### Q23. May SLU keep the proof of insurance offline? — _Has a working default_

- **The question:** Please confirm that interns' proof of insurance is collected and kept by SLU **outside** IDSMS.
- **Why we ask:** The insurance document contains personal and financial details we prefer not to store.
- **What IDSMS does today:** It does not collect or store the proof of insurance.
- **Options:** **A.** Keep it outside IDSMS. **B.** Track it as a status-only checklist item (like Q1). **C.** Store the file in IDSMS.
- **We recommend:** A, or B if you want IDSMS to show whether it was submitted.

---

## E. Email, AI, hosting and security

### Q15. Can SLU provide an email address IDSMS may send from? — _Needs your answer_

- **The question:** To email students and faculty (deadline reminders, review results), IDSMS needs a sending domain or address that SLU allows, for example `noreply@samcis.slu.edu.ph`. Can the department or IT office provide one?
- **What IDSMS does today:** All notifications appear inside IDSMS (the bell and inbox). Email turns on as soon as a sending domain is set up.

### Q16. Should we switch on the AI hints for faculty? — _Needs your answer_

- **The question:** IDSMS can warn faculty when a weekly report looks very similar to an earlier one, or is very vague. Should we turn this on?
- **What it needs from you:** (a) approval to send report text to Google's AI service, with names and personal details removed first, as allowed under RA 10173; and (b) about 30 pairs of sample reports that a faculty member labels as "similar" or "not similar", so we can measure accuracy before anyone relies on it.
- **What IDSMS does today:** Built and **switched off**. The hints are advice only and never change a grade or an approval.
- **Options:** **A.** Leave it off. **B.** Turn it on after the accuracy test passes.

### Q17. Who will look after the lab computer that hosts IDSMS? — _Needs your answer_

- **The question:** In Phase 5, IDSMS moves to a dedicated SAMCIS lab computer. Please confirm this plan and tell us who in the department or IT office will manage that machine (power, updates, backups) after the team finishes.
- **Why we ask:** A system without an owner stops working the first time something breaks. The full hosting plan has six more technical questions for the IT office ([Phase 5 plan](plans/phase5-lab-server-hosting.md)).

### Q19. Where should proof for leave, overtime and undertime go? — _Has a working default_

- **The question:** Should proof for an absence, overtime or undertime (for example a medical certificate) still be uploaded to IDSMS, or go to Google Classroom with IDSMS tracking only the status, as with Q1?
- **What IDSMS does today:** A proof file can be uploaded with the request.
- **Options:** **A.** Keep the upload. **B.** Status only; the file goes to Google Classroom.
- **We recommend:** B, for the same privacy reason as Q1.

### Q20. Who may create class groups and assign advisers? — _Has a working default_

- **What IDSMS does today:** The coordinator and Super Admin create, rename and delete class groups and assign faculty advisers. Only the Super Admin creates staff accounts.
- **The question:** Should faculty advisers also be able to create class groups or assign advisers?
- **Options:** **A.** Coordinator and Super Admin only. **B.** Faculty too.
- **We recommend:** A. It keeps one person responsible for the class list.

### Q24. Is a password enough for the Super Admin, or is two-step sign-in required? — _Has a working default_

- **The question:** The original requirements mention two-step sign-in (a code in addition to the password) for sensitive actions. Is that required for the capstone?
- **What IDSMS does today:** Sensitive actions (exports, deleting files, bulk endorsement letters) ask for the password again. Accounts lock after repeated failed sign-ins. There is no two-step sign-in.
- **Options:** **A.** The password re-check is enough. **B.** Add two-step sign-in for the Super Admin.
- **If you choose B:** About three days, plus a recovery process for lost phones.

---

## Answer sheet

Write a letter, "OK", or a short note. Questions are grouped by topic, so the numbers are not in order.

| #   | Topic                              | Default today            | Your answer |
| --- | ---------------------------------- | ------------------------ | ----------- |
| 1   | Checklist by status only           | A (status only)          |             |
| 2   | Required checklist items           | A (all nine)             |             |
| 3   | Adviser approval is final          | A (adviser only)         |             |
| 4   | Start before MOA approval          | A (adviser, coordinator) |             |
| 5   | BSCS required hours                | 240                      |             |
| 6   | Grace period for lateness          | A (none)                 |             |
| 7   | Monthly journal template           | — (please share)         |             |
| 8   | Who sets Week 1                    | A (coordinator)          |             |
| 9   | Deduction tiers                    | A (total at count)       |             |
| 10  | Suspension points                  | — (please give values)   |             |
| 11  | Final grade                        | A (tally only)           |             |
| 12  | Demerit hours                      | A (0)                    |             |
| 13  | Monitoring log                     | — (not built)            |             |
| 14  | University suspension days         | — (not built)            |             |
| 15  | Sending email address              | — (please provide)       |             |
| 16  | AI hints for faculty               | A (off)                  |             |
| 17  | Lab computer owner                 | — (please name)          |             |
| 18  | Meaning of "CPO"                   | —                        |             |
| 19  | Proof for leave, OT, UT            | A (upload kept)          |             |
| 20  | Class groups and advisers          | A (coordinator, admin)   |             |
| 21  | Withdraw a submitted weekly report | A (adviser returns it)   |             |
| 22  | Pull-out or company transfer       | A (out of scope)         |             |
| 23  | Proof of insurance                 | A (kept by SLU)          |             |
| 24  | Two-step sign-in                   | A (password re-check)    |             |

Thank you. We will update IDSMS and these documents within a week of receiving your answers.
