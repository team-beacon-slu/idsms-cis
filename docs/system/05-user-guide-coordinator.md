# 05. User guide: department coordinator

_Last updated: 12 October 2026. Status labels: **Built**, **In progress**, **Planned** (see the [index](README.md))._

The coordinator oversees the whole department. The left menu shows: **Dashboard, Users, Semesters, Companies, Calendar, Profile**, plus the notification bell and **Sign out**. The coordinator can open every student's pages (checklist, work plan, attendance, weekly and monthly reports) from the dashboard or the Users list.

## 1. Department dashboard (`/`)

- **Summary cards:** total users, students, deployed students, average hours, students needing attention, registered and verified companies, and **MOAs expiring soon**.
- **Program cards:** a summary for BSIT, BSCS and BMMA.
- **All students compliance table:** confirmed hours (with pending hours), checklist progress, the state of the report due this week, reports awaiting review and an overall status (**Not deployed, Needs attention, On track, Completed**; definitions in the [faculty guide](04-user-guide-faculty.md#1-dashboard-)).
- **Filters:** semester (active by default), program and status.
- **Export to Excel** (the filtered table) and **Weekly summary** (report states per week).

## 2. Users (`/users`)

- Lists all accounts with role and status. Staff actions per user: **Deactivate / Activate**. Deactivating signs the user out immediately.
- **Import** (`/users/import`): upload the class list (CSV or Excel) with columns for student number, email, program and required hours, and choose the class group and semester. Each row is validated; failed rows are listed with the reason. After the import, download the **credentials sheet** (student number, email, temporary password) and give it to students privately. Passwords are never emailed. Each new student gets the 9 checklist items automatically.
- Settings on this page (required hours, notification timing) and the Unlock and Force logout actions are **Super Admin only**.

## 3. Semesters (`/semesters`)

The coordinator can view all semesters (name, academic year, dates, number of students, active or archived). Creating, activating and archiving are Super Admin actions.

**Planned (L1):** a "Week 1 starts" date per semester, used to number weekly reports (who sets it is open question Q8).

## 4. Companies and MOAs (`/companies`)

- **Companies list** with search. Open a company to see its details and MOA records.
- **Register a company** (`/companies/new`) and edit company details.
- **Verify** a company (confirms the organisation is cleared to host interns).
- **Add MOA record** (`/companies/{id}/moa/new`): a Google Drive link or a PDF (up to 5 MB), valid from and to dates, and programs covered.
- **MOA stages:** Drafting → Pending → For HTE Review → For University Review → Approved / Active → Expiring / Expired → Archived. Only an **Approved / Active** MOA covering the student's program lets the checklist's MOA item be approved.
- **Expiry alerts:** the daily job notifies coordinators and Super Admins about MOAs expiring within the warning window (default 30 days).

**Planned (Checklist & MOA settings):** MOA records hold status, dates (for example approved or notarized) and a Google Drive link only, with no upload of the wet-signed MOA (D2); companies get a **foreign HTE** flag (different MOA template, proof of corporate legitimacy).

## 5. Work plan approval (`/students/{id}/work-plan`)

Open a student's latest work plan, then **Approve** or **Return** with feedback. An approved plan is locked and lets the student set their schedule; it also satisfies the checklist's Work Plan item. Faculty advisers cannot approve work plans; the coordinator and Super Admin can.

## 6. Schedule changes and deviations (`/students/{id}/attendance`)

- **Schedule change:** after the faculty adviser validates a student's request, the coordinator gives **final approval** (or rejects it). Approved changes apply from then on; past approved hours never change.
- **Deviation reports:** the coordinator can validate or reject them, like the adviser.

## 7. Checklist and endorsement letters

The coordinator can record checklist status and generate endorsement letters for any student, and bulk letters for any class group (bulk needs a password re-check). See the [faculty guide](04-user-guide-faculty.md) for the same screens.

## 8. Calendar (`/calendar`)

Department-wide deadlines, MOA expiry dates and **expected endorsement letter demand** (clusters of projected completion dates) to plan workload.

## 9. Notifications

Coordinators receive MOA expiry warnings. Email copies arrive once SLU provides a sending domain (Q15).

## 10. Coming later

| Feature                                                                                                                           | Status                                 |
| --------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------- |
| SLU credited-hours rules, Leave & Time Requests, SLU weekly report layout                                                         | **In progress** (L1)                   |
| Choose required checklist items; new items; per-student endorsement override (adviser or coordinator, with reason)                | **Planned** (Checklist & MOA settings) |
| Class group & staff management screens (faculty or Super Admin can create class groups, assign faculty and create staff accounts) | **Planned** (after L1; Q20)            |
| Conduct records and the SLU deduction matrix; "Excused" exceptions                                                                | **Planned** (L2)                       |
| Final Technical Report review (approve or return), HTE evaluation, certificates                                                   | **Planned** (H)                        |
| Department events (orientation, medical exam, psych assessment) on students' calendars                                            | Backlog                                |
| Monitoring log of supervisor checks and OJT visitations                                                                           | Backlog (Q13)                          |

## 11. Tips

- Import each class list into the correct class group and semester; the import cannot guess them.
- Keep MOA validity dates accurate; expiry alerts and the checklist gate depend on them.
- Use the status filter "Needs attention" weekly to find students who are behind.
