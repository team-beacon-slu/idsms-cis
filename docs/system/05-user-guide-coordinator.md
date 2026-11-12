# 05. User guide: internship coordinator

> Draft for adviser review — flows and rules may change; see [README](README.md).

_Last updated: 12 November 2026. Status labels: **Built**, **In progress**, **Planned** (see the [index](README.md))._

The coordinator oversees the whole department. The left menu shows **Dashboard**; **Manage:** Users, Class groups, Semesters, Final reports, Search entries, Settings; **Reference:** Companies, Calendar, Help. At the bottom of the menu, the **account menu** (your name and initials) opens **Account settings**, the theme (light, dark or system), the privacy notice, the terms of use and **Sign out**. The notification bell sits at the top; on a computer the menu can be collapsed to icons. Every page ends with a footer linking to the SLU website, SLU Portal, Library and Data Protection Office. The coordinator can open every student's pages (checklist, work plan, attendance, weekly and monthly reports) from the dashboard or the Users list.

## 1. Department dashboard (`/`)

- **Waiting on you:** work plans, final schedule approvals, final reports, disputes, companies and MOAs that need your decision.
- **Program cards:** students, deployed students, average hours and students needing attention for BSIT, BSCS and BMMA.
- **Host companies:** registered and verified companies, and **MOAs expiring** soon.
- **All students compliance table:** confirmed hours (with pending hours), checklist progress, the state of the report due this week, reports awaiting review and an overall status (**Not deployed, Needs attention, On track, Completed**; definitions in the [faculty guide](04-user-guide-faculty.md#1-dashboard-)).
- **Filters:** semester (active by default), program and status.
- **Export to Excel** (the filtered table) and **Weekly summary** (report states per week).

## 2. Users (`/users`)

- Lists all accounts with role and status. Staff actions per user: **Deactivate / Activate**. Deactivating signs the user out immediately.
- **Import** (`/users/import`): upload the class list (CSV or Excel) with columns for student number, email, program and required hours, and choose the class group and semester. Each row is validated; failed rows are listed with the reason. After the import, download the **credentials sheet** (student number, email, temporary password) and give it to students privately. Passwords are never emailed. Each new student gets the checklist items automatically.
- The Unlock and Force logout actions are **Super Admin only**.

## 2a. Settings (`/settings`)

- **Required internship hours** per program (defaults **BSIT 600, BMMA 500, BSCS 320**). A change applies to students imported afterwards; existing students keep their value.
- Other settings (notifications, checklist, deductions, AI) are the Super Admin's.

## 3. Semesters (`/semesters`)

The coordinator can view all semesters (name, academic year, dates, number of students, active or archived). Creating, activating and archiving are Super Admin actions.

The coordinator can set a **"Class week 1 starts"** date per semester. It no longer numbers the weekly reports: WWR01 is each intern's own first OJT week.

## 4. Companies and MOAs (`/companies`)

- **Companies list** with search. Open a company to see its details and MOA records.
- **Register a company** (`/companies/new`) and edit company details.
- **Verify** a company (confirms the organisation is cleared to host interns).
- **Outside the Philippines:** mark a foreign HTE (different MOA template, proof of corporate legitimacy). Its interns get no Philippine holidays.
- **Add MOA record** (`/companies/{id}/moa/new`): a Google Drive link, valid from and to dates, and programs covered. The wet-signed MOA is never uploaded (D2).
- **MOA stages:** Drafting → Pending → For HTE Review → For University Review → Approved / Active → Expiring / Expired → Archived. Only an **Approved / Active** MOA covering the student's program lets the checklist's MOA item be approved.
- **Expiry alerts:** the daily job notifies coordinators and Super Admins about MOAs expiring within the warning window (default 30 days).
- **Visits and supervisor check-ins:** on a company's page, record the date, who, notes and how (visit on site, online meeting or phone call) (Q13).

## 5. Work plan approval (`/students/{id}/work-plan`)

Open a student's latest work plan, then **Approve** or **Return** with feedback. An approved plan is locked and lets the student set their schedule; it also satisfies the checklist's Work Plan item. Faculty advisers cannot approve work plans; the coordinator and Super Admin can.

## 5a. Class groups and companies

- **Class groups** (`/class-groups`): create one per section (name, program, class type, dates), rename or delete it (only while it has no interns), and assign faculty advisers for a semester. Advisers see only the interns in groups they're assigned to, so set these up before importing a class list.
- **Duplicate companies** (`/companies`): interns are offered matching companies while registering, but copies can still appear. A **Possible duplicates** card lists them; choose the one to keep and **Merge** moves its interns and MOAs onto it and hides the rest (audit-logged; nothing is deleted).

## 6. Schedule changes, overtime and absences

- **Schedule change** (`/students/{id}/attendance`): after the faculty adviser approves a student's request, you get a notification and give **final approval** (or reject it) with the buttons on the student's Attendance page. Approved changes apply from then on; past approved hours never change.
- **Overtime, under time and absences** (`/students/{id}/leave-requests`): interns report them on the day in the weekly report, with remarks. Like the adviser, you can **Accept** one or mark it **Not accepted**.

## 7. Checklist and endorsement letters

The coordinator can record checklist status and generate endorsement letters for any student, and bulk letters for any class group (bulk needs a password re-check). See the [faculty guide](04-user-guide-faculty.md) for the same screens.

## 8. Calendar (`/calendar`)

Department-wide deadlines, MOA expiry dates and **expected endorsement letter demand** (clusters of projected completion dates) to plan workload. You also add **company days off** (one host company's non-working days, with a reason) and **department events** (orientation, medical exam, psych assessment). Interns follow their host company's days off, not the school's.

## 9. Notifications

Coordinators receive MOA expiry warnings. Email copies are sent when the host's email (SMTP) is set up (Q15); each user can switch email off in **Account settings**.

## 10. Status of later features

| Feature                                                                                                            | Status           |
| ------------------------------------------------------------------------------------------------------------------ | ---------------- |
| SLU credited-hours rules and SLU weekly report layout; OT, UT and absences reported on the day (no request forms)  | **Built**        |
| Choose required checklist items; new items; per-student endorsement override (adviser or coordinator, with reason) | **Built** (#105) |
| Class group screens: create, rename, delete class groups; assign advisers per semester                             | **Built**        |
| Conduct records and the SLU deduction matrix; "Excused" exceptions                                                 | **Built** (L2)   |
| Final Technical Report review (approve or return), HTE evaluation, certificates                                    | **Built** (H)    |
| Department events (orientation, medical exam, psych assessment) on students' calendars                             | **Built**        |
| Visits and supervisor check-ins log                                                                                | **Built** (Q13)  |

## 11. Tips

- Import each class list into the correct class group and semester; the import cannot guess them.
- Keep MOA validity dates accurate; expiry alerts and the checklist gate depend on them.
- Use the status filter "Needs attention" weekly to find students who are behind.
