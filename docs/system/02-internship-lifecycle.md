# 02. The internship lifecycle in IDSMS

> Draft for adviser review — flows and rules may change; see [README](README.md).

_Last updated: 12 November 2026. Status labels: **Built**, **In progress**, **Planned** (see the [index](README.md))._

This document follows one student from account creation to completion and shows who does what at each step. The rules behind each step are listed in [07. Business rules](07-business-rules.md).

## 1. The journey at a glance

```mermaid
flowchart TD
    A["1. Semester set up<br/>(Super Admin)"] --> B["2. Accounts created<br/>bulk import of class list<br/>(Coordinator / Super Admin)"]
    B --> C["3. First login<br/>student sets own password"]
    C --> D["4. Company and MOA<br/>student registers HTE;<br/>staff record MOA status"]
    C --> E["5. Pre-deployment checklist<br/>files go to Google Classroom;<br/>faculty records Approved / Returned"]
    C --> F["6. Work plan<br/>student submits;<br/>coordinator approves"]
    F --> G["7. Work schedule<br/>student sets working days<br/>and hours per day"]
    D --> H{"8. Endorsement gate<br/>all required checklist items<br/>Approved?"}
    E --> H
    F --> H
    H -- "No" --> E
    H -- "Yes" --> I["9. Endorsement letter PDF<br/>(faculty / coordinator;<br/>bulk needs password)"]
    I --> J["10. Deployment at the HTE"]
    J --> K["11. Daily time record and<br/>weekly report<br/>due Tuesday 11:59 PM"]
    K --> L{"12. Faculty review"}
    L -- "Return (with note)" --> K
    L -- "Disregard" --> K
    L -- "Approve / Regard" --> M["Hours confirmed;<br/>PDF signed by supervisor<br/>and posted to Google Classroom"]
    M --> N["13. Monthly report<br/>when every week of the<br/>month is Approved/Regarded"]
    N --> K
    M --> O{"14. Confirmed hours reach<br/>final report threshold?"}
    O -- "Yes" --> P["15. Final report cover PDF (Built)<br/>Final Technical Report (Built)"]
    P --> Q["16. Completion<br/>required hours met;<br/>certificates tracked as status (D7)"]

    classDef planned stroke-dasharray: 5 5;
```

Steps 11 and 12 follow SLU's rules (Workstream L1 and the 11-12 Nov 2026 adviser changes, all built): AM and PM time ranges per day, overtime, under time and absences reported on the day with remarks, and SLU's credited-hours rules. See section 3.

## 2. Step by step

### Before deployment

| Step | What happens                                                                                                                                                                                                                                                                                                                                                                 | Who                                                                             | Status                                                                                                                   |
| ---- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| 1    | **Semester set up.** A semester (name, academic year, start and end dates) is created and made active. Only one semester is active at a time.                                                                                                                                                                                                                                | Super Admin                                                                     | **Built**                                                                                                                |
| 2    | **Accounts created.** The class list (student number, email, program, required hours) is uploaded as CSV or Excel for a chosen class group and semester. Each student gets a default password and one checklist item per requirement type is created (11 items; 9 are required by default). The default password is shown once to the person who imported it, never emailed. | Coordinator or Super Admin                                                      | **Built**                                                                                                                |
| 3    | **First login.** The student signs in with the school email and default password and must set a new password before using anything else. They should also enter their legal name in Account settings (needed on letters and reports).                                                                                                                                        | Student                                                                         | **Built**                                                                                                                |
| 4    | **Company and MOA.** The student registers their host company (name, address, work modality, supervisor). Staff add the MOA record (status, validity dates, programs covered) and move it through its stages until "Approved / Active". Staff can mark the company as verified.                                                                                              | Student; faculty, coordinator or Super Admin                                    | **Built**. MOA as a Drive link, foreign HTE flag: **Built** (#105)                                                       |
| 5    | **Pre-deployment checklist.** The student submits each document (medical certificate, psychological clearance, parent's consent, etc.) **in Google Classroom**, not in IDSMS. Faculty record each item as Approved or Returned (a note is required when returning). Work Plan and MOA items can only be approved once the underlying work plan and MOA are approved.         | Student (Google Classroom); faculty adviser, coordinator or Super Admin (IDSMS) | **Built** (status-only, D7)                                                                                              |
| 6    | **Work plan.** The student submits planned tasks. The coordinator approves or returns it with feedback. An approved plan is locked; changes need a new submission.                                                                                                                                                                                                           | Student; coordinator or Super Admin                                             | **Built**                                                                                                                |
| 7    | **Work schedule.** After approval, the student sets working days and hours per day. Interns follow the host company's days off and holidays: the coordinator adds a company's own days off on Calendar, with a reason. Philippine holidays apply only to interns at companies in the Philippines (not foreign companies); the student can mark which apply.                  | Student                                                                         | **Built**. Shift start/end and lunch break: **Built** (#87)                                                              |
| 8    | **Endorsement gate.** IDSMS blocks the endorsement letter until every required checklist item is Approved (the original nine by default).                                                                                                                                                                                                                                    | System                                                                          | **Built**. Required/optional items and the per-student "allowed to start before MOA approval" override: **Built** (#105) |
| 9    | **Endorsement letter.** A PDF with a reference code (EL-…) is generated for one student, or for a whole class group in bulk (bulk needs the staff member's password). The student is notified.                                                                                                                                                                               | Faculty adviser, coordinator or Super Admin                                     | **Built**                                                                                                                |

### During deployment

| Step | What happens                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | Who                                                 | Status                                   |
| ---- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------- | ---------------------------------------- |
| 10   | **Deployment.** The student starts at the HTE.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | Student                                             | —                                        |
| 11   | **Daily time record and weekly report.** For each week (Monday to Sunday) the student opens a report that lists their scheduled days. For each day they choose Present, Absent or Holiday, enter the AM and PM Time In / Time Out and the List of Work Accomplished. Days before the first day of OJT show "OJT not yet started". Overtime, under time (including late arrival and early leave) and absences need remarks of at least 10 characters on that day before the week can be submitted. The Weekly reports page folds weeks into To do, Missing and Submitted; weeks are never created on their own. They submit by **Tuesday 11:59 PM (Manila)** of the following week. Late submissions require a reason for delay. A reference code (WR-…) is assigned. Reminders arrive 48 and 24 hours before the deadline. | Student                                             | **Built**                                |
| 11a  | **Overtime, under time and absences.** Reported on the day inside the weekly report, with remarks. There are no separate request forms and no proof upload: proof goes to Google Classroom and IDSMS records only the proof type (Q19). The adviser accepts each one or marks it Not accepted; approving the week accepts those still pending. The "Overtime & absences" page lists them.                                                                                                                                                                                                                                                                                                                                                                                                                                  | Student; faculty adviser or staff                   | **Built** (#209-#211)                    |
| 12   | **Faculty review.** The adviser opens the report and chooses Approve, Return (note required), Regard or Disregard. Approved and Regarded weeks become **confirmed hours**; submitted weeks waiting for review show as **pending hours**. The student downloads the PDF, has the supervisor sign it, and posts the signed copy in Google Classroom (D2).                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | Faculty adviser; student; HTE supervisor (on paper) | **Built**                                |
| 12a  | **Schedule change (if needed).** The student requests a new schedule with a reason. The adviser validates it, then the coordinator gives final approval. It applies from then on and never changes past approved hours.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | Student; faculty; coordinator                       | **Built**                                |
| 13   | **Monthly report.** For a calendar month, once every weekly report in it is Approved or Regarded, the student submits the monthly report and a PDF (MR-…) is produced.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | Student                                             | **Built**. SLU's JLE template (#162, Q7) |

### After deployment

| Step | What happens                                                                                                                                                                                                              | Who                  | Status                                                                 |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------- | ---------------------------------------------------------------------- |
| 14   | **Final report threshold.** When confirmed hours reach the threshold (default: 500 for BSIT; five-sixths of required hours for other programs, never above the student's required hours), the final report cover unlocks. | System               | **Built**                                                              |
| 15   | **Final report.** The student generates the final report cover PDF (FC-…). The Final Technical Report itself (company profile, evaluation scores, proof), its coordinator review and the HTE evaluation are built (#89).  | Student; coordinator | Cover **Built**. Report, HTE evaluation, certificates: **Built** (#89) |
| 16   | **Completion.** The student reaches required hours (shown as "Completed" on dashboards). Post-internship certificates (Attendance from the CPO, Completion from the HTE) are tracked as status only under D7.             | Student; staff       | Hours and status **Built**; certificate tracking **Built** (#89)       |

## 3. SLU hours and report rules (Workstream L1 and later)

All of the following is **built**:

- **Overtime, under time and absences** (built, 11 Nov 2026): reported on the day inside the weekly report with remarks; the adviser accepts them or not. Proof stays in Google Classroom (Q19).
- **Two time ranges per day** (AM and PM rows) in the daily time record, and a per-student shift (start, end, lunch break; default 8:00–5:00 with 1 hour).
- **SLU credited-hours rules:** only time inside the shift counts; time outside counts only as approved overtime of at least 30 minutes; no offsetting on a late day; no grace period; late arrival and early leave are under time and need remarks (10+ characters) before the week can be submitted.
- **SLU Weekly Work Report layout** for the preview and PDF (AM/PM Time In/Time Out, List of Work Accomplished): one combined PDF, with the Overtime, Under Time and Absences sections only when the week has them.
- **Week numbers** (built, 11 Nov 2026): WWR01 is the intern's own first OJT week.

The rules and worked examples are in [07. Business rules](07-business-rules.md), section 4.

## 4. Who does what: summary

| Activity                                                     | Student |         Faculty adviser          |  Coordinator   |  Super Admin   |
| ------------------------------------------------------------ | :-----: | :------------------------------: | :------------: | :------------: |
| Import class list / create accounts                          |         |                                  |      Yes       |      Yes       |
| Register a company                                           |   Yes   |               Yes                |      Yes       |      Yes       |
| Add and update MOA records; verify company                   |         |               Yes                |      Yes       |      Yes       |
| Record checklist status                                      |         |        Yes (own students)        |      Yes       |      Yes       |
| Submit work plan                                             |   Yes   |                                  |                |                |
| Approve or return work plan                                  |         |                                  |      Yes       |      Yes       |
| Set schedule; request schedule change                        |   Yes   |                                  |                |                |
| Approve schedule change                                      |         |    First step (own students)     |   Final step   |   Final step   |
| Report overtime, under time, absences (in the weekly report) |   Yes   |                                  |                |                |
| Accept or not accept reported overtime, under time, absences |         |        Yes (own students)        |      Yes       |      Yes       |
| Generate endorsement letter (one student)                    |         |        Yes (own students)        |      Yes       |      Yes       |
| Generate endorsement letters in bulk                         |         | Yes (own class groups, password) | Yes (password) | Yes (password) |
| Submit weekly and monthly reports                            |   Yes   |                                  |                |                |
| Review weekly reports                                        |         |        Yes (own students)        |                |                |
| Generate final report cover                                  |   Yes   |                                  |                |                |
| Activate or archive semesters                                |         |                                  |   View only    |      Yes       |
| Settings: required hours per program                         |         |                                  |      Yes       |      Yes       |
| Settings: reminders and other system settings                |         |                                  |                |      Yes       |
| Audit log, Export Center, data requests, retention           |         |                                  |                |      Yes       |
| Request a copy of own data                                   |   Yes   |               Yes                |      Yes       |      Yes       |

Weekly report review is limited to the assigned **faculty adviser** in the current build. Whether a second confirmation is needed is open question Q3.
