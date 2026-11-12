# 04. User guide: faculty adviser

> Draft for adviser review — flows and rules may change; see [README](README.md).

_Last updated: 12 November 2026. Status labels: **Built**, **In progress**, **Planned** (see the [index](README.md))._

A faculty adviser sees only the students in the class groups they are assigned to for a semester. The left menu shows **Dashboard**, **My students**, **Review queue** and **Search entries**, then **Reference:** Companies, Calendar, Help. At the bottom of the menu, the **account menu** (your name and initials) opens **Account settings**, the theme (light, dark or system), the privacy notice, the terms of use and **Sign out**. The notification bell sits at the top; on a computer the menu can be collapsed to icons. Every page ends with a footer linking to the SLU website, SLU Portal, Library and Data Protection Office. Student pages (checklist, work plan, attendance, weekly and monthly reports) open from the dashboard or **My students**.

Class groups and class group assignments (which adviser handles which class group in which semester) are managed by the coordinator or Super Admin on the **Class groups** page. When an intern requests a schedule change, you get a notification; validate or reject it on the intern's **Attendance** page.

## 1. Dashboard (`/`)

- **Summary cards:** total students, reports submitted this week, reports pending review, reports not yet submitted.
- **My students table:** one row per student with confirmed hours (progress bar, plus pending hours), checklist progress (approved / required items), the state of the report that is due now (Not started, Draft, Submitted, Returned, Approved, Regarded) and an overall status:

  | Status              | Meaning                                                                                       |
  | ------------------- | --------------------------------------------------------------------------------------------- |
  | **Not deployed**    | No company on file yet.                                                                       |
  | **Needs attention** | Checklist not fully approved, or the report due this week is not submitted (or was returned). |
  | **On track**        | Checklist complete and the due report is submitted or reviewed.                               |
  | **Completed**       | Confirmed hours have reached required hours.                                                  |

- Exports and endorsement letters are on **My students**, not the dashboard.

## 2. My Students (`/my-students`)

- **Roster:** student number, program, company and links to each student's pages.
- **Export to Excel:** the compliance table for your students. **Weekly summary (Excel):** report states per week.
- **Class checklist** (`/my-students/checklist`): checklist items for your class groups in one grid.
- **Endorsement letters:** a bulk-generate button for each of your class groups.

## 2a. Review queue (`/review-queue`) and Search entries (`/search`)

- **Review queue:** submitted weeks, checklist uploads and overtime, under time and absence reasons waiting for you. Weeks with nothing flagged can be approved in one go; **Approve & next** opens the next week.
- **Search entries:** search what your interns wrote in their weekly reports.

## 3. Checklist review (`/students/{id}/checklist`)

- Lists the required items with status, reviewer and comments.
- **Status only (D7):** the student uploads the document to **Google Classroom** and marks it **Uploaded to Classroom** here. Check it there, then record **Approve** or **Return** here. A **note is required when returning**, because it is the only way the student learns what to fix.
- **Work Plan** and **MOA** can only be approved once the student's work plan is approved and the company has an **Approved / Active** MOA covering the student's program. Returning is always allowed.
- Every decision is recorded in the audit log, and the student is notified.
- **Endorsement letter** section: generate or regenerate the student's letter once every required item is approved (section 5).
- The Super Admin chooses which items are required. **Start before MOA approval:** you can set **Allow to start** per student with a reason; it satisfies only the MOA part of the gate and can be removed (Q4).

## 4. Weekly report review (`/students/{id}/weekly-reports/{report}/review`)

Open a submitted report from the dashboard or the student's weekly report list. You see each day's status, time in/out, hours and accomplishments, the week's totals, the submission time, the reference code, and the **reason for delay** if it was late.

| Action        | Effect                                                                                                                                                      |
| ------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Approve**   | Hours count. The report is final.                                                                                                                           |
| **Return**    | A note is required. The student edits and resubmits. Hours do not count yet.                                                                                |
| **Regard**    | Acknowledged: hours count, marked for minor improvement, no revision needed.                                                                                |
| **Disregard** | Invalid submission (for example, the wrong week). A note is required. The report is removed; hours do not count and the student must start that week again. |

Approved and Regarded weeks become the student's **confirmed hours**; weeks waiting for you are shown as **pending hours** on dashboards. The student is notified of the outcome (in-app, and by email when email is set up).

Weekly report review is limited to the assigned faculty adviser. Whether a second confirmation is required is open question Q3 (default: faculty only).

### SLU layout and overtime, under time and absences

- The review page and PDF follow **SLU's Weekly Work Report** layout: two time ranges per day, "N hrs M mins", beginning and ending totals, and Overtime and Under Time sections.
- **Overtime, under time and absences** are reported by the intern on the day inside the weekly report, with remarks (there are no request forms). Approving the week accepts the pending ones; you can mark any one **Not accepted** (on the Overtime & absences page or in the Review queue), and hours follow. Weeks with undecided reasons are flagged in the review queue.
- Credited hours follow SLU's rules automatically (see [07](07-business-rules.md), section 4).

## 5. Endorsement letters

- **One student:** on the student's checklist page, generate the letter once every required item is Approved. It includes the student's legal name, student ID, company name and address, supervisor name and position, the date and a reference code (EL-…). If the student has not set their legal name, or has no host company on file, generation stops with a clear message.
- **Bulk:** from My Students, choose a class group, **re-enter your password**, and generate letters for every eligible student (up to 40 per run). Ineligible students are skipped and listed.
- The student is notified when their letter is ready.

## 6. Other student pages you can open

| Page                    | What you can do                                                                                                                                                       |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Work plan**           | View the student's work plan and history (approval is the coordinator's job).                                                                                         |
| **Attendance**          | See confirmed, pending and remaining hours and the projected completion date. **Approve** or reject a schedule change request (the coordinator gives final approval). |
| **Overtime & absences** | Every overtime, under time and absence the intern reported, with its reason. **Accept** or mark **Not accepted**.                                                     |
| **Weekly reports**      | List of the student's weeks, with preview, review and PDF download.                                                                                                   |
| **Monthly reports**     | The student's monthly reports and PDFs.                                                                                                                               |

## 7. Companies and MOAs (`/companies`)

You can register companies, add MOA records (Google Drive link, validity dates, programs covered; the wet-signed MOA is never uploaded), move an MOA through its stages (Drafting → Pending → For HTE Review → For University Review → Approved / Active → Expiring / Expired → Archived) and mark a company as verified.

A company can be marked as **outside the Philippines** (foreign HTE): its interns get no Philippine holidays. On a company's page, **Visits and supervisor check-ins** records each monitoring contact: date, who, notes and how (visit on site, online meeting or phone call) (Q13).

## 8. Calendar (`/calendar`)

Deadlines for all your students, holidays, approved deviations and projected completion dates. Weeks with a **high submission volume** are highlighted so you can plan review time.

## 9. Notifications

You are notified when one of your students submits a weekly report. Email copies are sent when the host's email (SMTP) is set up (Q15); you can switch email off in **Account settings**.

## 10. Conduct and AI hints

- **Conduct and deductions (L2, built):** record written warnings, demerits, major violations and suspensions for your own students; automatic counts of late or missing reports and unsupported undertime/absences appear with them; mark an item **Excused** with a reason. When an intern **disputes** an item you get a notification and see their reason under it: excuse the item or revoke the record to accept, or choose **Keep deduction** and tell them why. Deducted hours show as their own figure on the weekly report.
- **AI hints (built, off until the Super Admin enables them):** advisory only, shown on the review page above a confidence threshold (Q16).

## 11. Tips

- Use **Return** with a specific note instead of Disregard whenever the student can fix the report; Disregard removes the submission entirely.
- Review by Wednesday so students' confirmed hours stay current; pending hours are visible but do not count.
- Check documents in Google Classroom before approving a checklist item; IDSMS does not hold the files.
