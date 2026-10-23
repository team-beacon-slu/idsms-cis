# 06. User guide: Super Admin

> Draft for adviser review — flows and rules may change; see [README](README.md).

_Last updated: 23 October 2026. Status labels: **Built**, **In progress**, **Planned** (see the [index](README.md))._

The Super Admin has every coordinator capability (see the [coordinator guide](05-user-guide-coordinator.md)) plus system settings and the privacy tools. The left menu shows **Dashboard**; **Manage:** Users, Class groups, Semesters, Final reports; **Records:** Audit log, Export center, Settings; **Reference:** Companies, Calendar, Help. At the bottom of the menu, the **account menu** (your name and initials) opens **Account settings**, the theme (light, dark or system), the privacy notice, the terms of use and **Sign out**. The notification bell sits at the top; on a computer the menu can be collapsed to icons. Every page ends with a footer linking to the SLU website, SLU Portal, Library and Data Protection Office.

> **Password re-check.** Sensitive actions (Export Center downloads, data request exports, deleting a retained file, bulk endorsement letters) ask for **your password again**. Wrong passwords count toward the 5-attempt lockout, the same as at sign-in.

## 1. Dashboard (`/`)

The department dashboard (see the coordinator guide): summary cards, program cards, the all-students compliance table with filters, Excel export and weekly summary.

## 2. Users (`/users`)

| Action                    | What it does                                                                                                                       |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| **Deactivate / Activate** | A deactivated user is signed out immediately and cannot sign in. Users are never hard-deleted (the audit log must keep its links). |
| **Force logout**          | Ends all of the user's sessions immediately.                                                                                       |
| **Unlock**                | Clears a lockout after 5 failed sign-ins (otherwise it lifts after 15 minutes).                                                    |
| **Import**                | Bulk student import from CSV or Excel (see the coordinator guide).                                                                 |

**Settings cards on this page (Super Admin only):**

- **Required internship hours** per program. Defaults: **BSIT 600, BMMA 500, BSCS 240** (BSCS is open question Q5). A change applies to students imported afterwards; it does not rewrite existing students' required hours.
- **Notification settings:** reminder hours before the weekly report deadline (1 to 3 values, each 16 to 168 hours; default 48 and 24) and the MOA expiry warning window (1 to 180 days; default 30).

Create a single faculty, coordinator or Super Admin account with **New staff account** on the Users page; the temporary password is shown once. Students are created only by the class-list import. Class groups and adviser assignments are managed on the **Class groups** page (also available to the coordinator).

## 3. Semesters (`/semesters`)

- **New semester:** name, academic year, start and end dates.
- **Activate:** makes this the only active semester (the previously active one is deactivated in the same step).
- **Archive:** marks the semester archived and inactive. **Nothing is deleted**; students, reports and documents stay attached for audit and accreditation. Archived semesters cannot be re-activated.

## 4. Audit log (`/audit-log`)

- A searchable list of security and data events, newest first: timestamp, user email, action (for example `LOGIN_FAILED`, `CHECKLIST_ITEM_APPROVED`, `WEEKLY_REPORT_SUBMITTED`, `DATA_EXPORTED`, `DSAR_REQUESTED`), entity type and id, IP address and details.
- Filter by date range and other fields; export the filtered list to Excel (up to 10,000 rows).
- The log is **append-only**: nobody, including the system itself, can edit or delete entries. See [09](09-security-and-privacy.md).

## 5. Export Center (`/admin/export-center`)

### Exports

Six Excel exports, each optionally limited to one semester, each needing your password and each recorded in the audit log as `DATA_EXPORTED`:

| Export         | Contents                                                                      |
| -------------- | ----------------------------------------------------------------------------- |
| **Users**      | Every account: email, role, active state, lockout and timestamps.             |
| **Students**   | Per-student compliance snapshot: hours, checklist, due-week report, status.   |
| **Attendance** | Daily attendance with time in/out and scheduled versus actual hours.          |
| **Reports**    | Weekly reports with submission time and reference code, plus monthly reports. |
| **Checklist**  | Pre-deployment checklist status and reviewer per requirement.                 |
| **Companies**  | Partner companies with supervisor details and latest MOA status.              |

Exports never include passwords, tokens or storage file paths. Cells that a spreadsheet could run as a formula are neutralised.

### Data requests (Data Privacy Act)

- **Open data requests**, soonest due first, with the requester, request date and **days left** (counted in Manila calendar days). Each request is due **15 days** after it was made.
- **Export** (password required) downloads an Excel workbook of that person's personal data. **Mark fulfilled** closes the request after you have given it to them.
- **Recently fulfilled** requests are listed below.
- You receive a notification for each new request, and daily reminders when a request is due within 3 days or overdue.

### File retention review

- Stored files (deviation proofs, legacy checklist files and generated PDFs) from semesters that ended more than **3 years** ago are flagged by a scan that runs every 90 days.
- For each flagged file you see the student, file type, semester end and when it was flagged. Choose **Keep** or **Delete** (password required). **Nothing is deleted automatically.**

## 6. Everything else

Companies, MOAs, checklist review, work plan approval, schedule-change final approval, deviation validation, endorsement letters (single and bulk) and calendars work as described in the faculty and coordinator guides, for all students.

## 7. Coming later

| Feature                                                                                                                                                 | Status                           |
| ------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------- |
| Choose which checklist items are required (dashboards show "x/required")                                                                                | **Built** (#105)                 |
| Class group & staff management screens (create, rename, delete class groups; assign advisers; create staff accounts)                                    | **Built**                        |
| Edit the SLU deduction matrix (categories, tiers, ADVISER and WWR points, total-at-count or per-incident) and the default hours per demerit (default 0) | **Built** (L2)                   |
| "Week 1 starts" date per semester (Semesters page)                                                                                                      | **Built** (L1)                   |
| AI similarity threshold (0.60 to 0.85) with golden-set evaluation shown before each change                                                              | **Built** (D; off until enabled) |
| Move hosting to the SAMCIS lab computer; backups, monitoring, operations runbook                                                                        | **Planned** (Phase 5)            |
