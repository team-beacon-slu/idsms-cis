# 04. User guide: faculty adviser

_Last updated: 12 October 2026. Status labels: **Built**, **In progress**, **Planned** (see the [index](README.md))._

A faculty adviser sees only the students in the class groups they are assigned to for a semester. The left menu shows: **Dashboard, Companies, Calendar, My Students, Profile**, plus the notification bell and **Sign out**. Student pages (checklist, work plan, attendance, weekly and monthly reports) open from the dashboard or **My Students**.

Class groups and class group assignments (which adviser handles which class group in which semester) have no screen yet; today they are set up directly in the database by the project team. **Planned:** class group & staff management screens, where a faculty member or the Super Admin can create class groups, assign faculty and create staff accounts (after L1, alongside Checklist & MOA settings; whether faculty may do this is Q20).

## 1. Dashboard (`/`)

- **Summary cards:** total students, reports submitted this week, reports pending review, reports not yet submitted.
- **My students table:** one row per student with confirmed hours (progress bar, plus pending hours), checklist progress (x/9), the state of the report that is due now (Not started, Draft, Submitted, Returned, Approved, Regarded) and an overall status:

  | Status              | Meaning                                                                                       |
  | ------------------- | --------------------------------------------------------------------------------------------- |
  | **Not deployed**    | No company on file yet.                                                                       |
  | **Needs attention** | Checklist not fully approved, or the report due this week is not submitted (or was returned). |
  | **On track**        | Checklist complete and the due report is submitted or reviewed.                               |
  | **Completed**       | Confirmed hours have reached required hours.                                                  |

- **Export to Excel:** the compliance table for your students. **Weekly summary:** an Excel summary of report states per week.
- **Bulk endorsement** per class group (see section 5).

## 2. My Students (`/my-students`)

- **Roster:** student number, program, company and links to each student's pages.
- **Endorsement letters:** a bulk-generate button for each of your class groups.

## 3. Checklist review (`/students/{id}/checklist`)

- Lists the 9 requirements with status, reviewer and comments.
- **Status only (D7):** the student submits the document in **Google Classroom**. Check it there, then record **Approve** or **Return** here. A **note is required when returning**, because it is the only way the student learns what to fix.
- **Work Plan** and **MOA** can only be approved once the student's work plan is approved and the company has an **Approved / Active** MOA covering the student's program. Returning is always allowed.
- Every decision is recorded in the audit log, and the student is notified.
- **Endorsement letter** section: generate or regenerate the student's letter once all 9 items are approved (section 5).
- **Planned:** required/optional items chosen by the Super Admin, and an **"Allowed to start before MOA approval"** switch you can set per student with a reason (decision on endorsement before MOA approval; see Q4).

## 4. Weekly report review (`/students/{id}/weekly-reports/{report}/review`)

Open a submitted report from the dashboard or the student's weekly report list. You see each day's status, time in/out, hours and accomplishments, the week's totals, the submission time, the reference code, and the **reason for delay** if it was late.

| Action        | Effect                                                                                                                                  |
| ------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| **Approve**   | Hours count. The report is final.                                                                                                       |
| **Return**    | A note is required. The student edits and resubmits. Hours do not count yet.                                                            |
| **Regard**    | Acknowledged: hours count, marked for minor improvement, no revision needed.                                                            |
| **Disregard** | Invalid submission (for example, the wrong week). The report is removed; hours do not count and the student must start that week again. |

Approved and Regarded weeks become the student's **confirmed hours**; weeks waiting for you are shown as **pending hours** on dashboards. The student is notified of the outcome (in-app; email once a sending domain exists).

Weekly report review is limited to the assigned faculty adviser. Whether a second confirmation is required is open question Q3 (default: faculty only).

### Coming with Workstream L1 (In progress, not available yet)

- The review page and PDF follow **SLU's Weekly Work Report** layout: two time ranges per day, "N hrs M mins", beginning and ending totals, and Overtime and Under Time sections.
- **Leave & Time Requests:** students file leave, overtime and undertime requests. You **Approve**, or **Return** with a note. An overtime request filed after the date is labelled **"Filed after the fact"**. Pending requests appear on the student's attendance page and as a count on your dashboard.
- Credited hours follow SLU's rules automatically (see [07](07-business-rules.md), section 4).

## 5. Endorsement letters

- **One student:** on the student's checklist page, generate the letter once all 9 items are Approved. It includes the student's legal name, student ID, company name and address, supervisor name and position, the date and a reference code (EL-…). If the student has not set their legal name, or has no host company on file, generation stops with a clear message.
- **Bulk:** from My Students or the dashboard, choose a class group, **re-enter your password**, and generate letters for every eligible student (up to 40 per run). Ineligible students are skipped and listed.
- The student is notified when their letter is ready.

## 6. Other student pages you can open

| Page                | What you can do                                                                                                                                                                                        |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Work plan**       | View the student's work plan and history (approval is the coordinator's job).                                                                                                                          |
| **Attendance**      | See confirmed, pending and remaining hours and the projected completion date. **Validate** or reject deviation reports. **Validate** a schedule change request (the coordinator gives final approval). |
| **Weekly reports**  | List of the student's weeks, with preview, review and PDF download.                                                                                                                                    |
| **Monthly reports** | The student's monthly reports and PDFs.                                                                                                                                                                |

## 7. Companies and MOAs (`/companies`)

You can register companies, add MOA records (Google Drive link or PDF, validity dates, programs covered), move an MOA through its stages (Drafting → Pending → For HTE Review → For University Review → Approved / Active → Expiring / Expired → Archived) and mark a company as verified.

**Planned (Checklist & MOA settings):** MOA records become status, dates and a Google Drive link only (no upload of the wet-signed MOA), and companies get a "foreign HTE" flag.

## 8. Calendar (`/calendar`)

Deadlines for all your students, holidays, approved deviations and projected completion dates. Weeks with a **high submission volume** are highlighted so you can plan review time.

## 9. Notifications

You are notified when one of your students submits a weekly report. Email copies arrive once SLU provides a sending domain (Q15).

## 10. Coming later (Planned)

- **Conduct and deductions (Workstream L2):** record written warnings, demerits, major violations and suspensions for your own students; see automatic counts of late or missing reports and unsupported undertime/absences; mark individual items **Excused** (HTE-attested documentation or circumstances beyond the intern's control) with a reason. IDSMS shows the ADVISER and WWR point tally; it does not compute the final grade (Q11).
- **Monitoring log** of supervisor checks and OJT visitations (backlog, Q13).
- **AI hints** on the review page (optional, advisory only, Q16).

## 11. Tips

- Use **Return** with a specific note instead of Disregard whenever the student can fix the report; Disregard removes the submission entirely.
- Review by Wednesday so students' confirmed hours stay current; pending hours are visible but do not count.
- Check documents in Google Classroom before approving a checklist item; IDSMS does not hold the files.
