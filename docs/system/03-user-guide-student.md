# 03. User guide: student intern

> Draft for adviser review — flows and rules may change; see [README](README.md).

_Last updated: 22 October 2026. Status labels: **Built**, **In progress**, **Planned** (see the [index](README.md))._

This guide describes every screen a student sees. The left menu (a slide-out menu on phones) shows, in order: **Dashboard, Companies, Calendar, Checklist, Work Plan, Attendance, Weekly Reports, Monthly Reports, Profile**, plus the notification bell and **Sign out**.

> **Golden rule (decisions D2 and D7):** never upload signed documents, signatures, medical certificates or psychological records to IDSMS. Those go to **Google Classroom**. IDSMS records their status and produces the PDFs you print for signing.

## 1. Signing in

| Screen                                           | What it shows / what you do                                                                                                                                                           |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Sign in** (`/login`)                           | Enter your SLU email and password. After **5 wrong passwords in a row** the account locks for **15 minutes**.                                                                         |
| **Set a new password** (`/change-password`)      | Shown on your first login (or after a reset). You must set your own password before using anything else. You can return here later from your Profile to change it.                    |
| **Reset your password** (`/auth/reset-password`) | Enter your email to receive a reset link, valid for **1 hour**. Using the link signs you out everywhere. A locked account stays locked until the 15 minutes pass, even after a reset. |

Your session ends after **30 minutes of inactivity**. Sign in again to continue.

## 2. Dashboard (`/`)

- **Needs attention** (amber card): counts of weekly reports returned for revision, weekly reports due within 48 hours, deviation reports awaiting validation, and checklist items not yet approved. Each line links to the right page.
- **Hours:** confirmed hours over required hours (for example "212 / 600"), with "+N hrs pending review" for submitted weeks the adviser has not reviewed yet.
- **Pre-deployment requirements:** the status of each checklist item.
- **Weekly report history:** your weeks, newest first, with status and reference code.
- **Final report cover:** locked until your confirmed hours reach the threshold (shown as "Unlocks at N confirmed hours (x / N so far)"); then a button generates the PDF.
- **Quick links** to your main pages.

## 3. Companies (`/companies`)

- Lists registered host companies (HTEs) with their work modality. You can search and open a company.
- **Register a company** (`/companies/new`): company name, address, work modality (on-site, work from home, hybrid), supervisor name and contact, and your position title.
- MOA records are visible to staff only.

## 4. Calendar (`/calendar`)

Shows your weekly report deadlines (red), Philippine holidays (gray), approved deviations (yellow) and your **projected OJT completion date** (green), which updates as hours are confirmed.

## 5. Checklist (`/checklist`)

- The 9 pre-deployment requirements with their status: **Pending**, **Approved** or **Returned**, plus the reviewer's note when returned.
- **Status only (D7):** submit the documents in Google Classroom. Your adviser records the status here. There is no upload button.
- **Work Plan** and **MOA** show "Tracked automatically": they follow your work plan's approval and your company's MOA.
- The **endorsement letter** section stays locked until all 9 items are Approved; once your adviser generates it, you can download it here.
- **Planned:** the Super Admin will choose which items are required; some items (for example "Proof of corporate legitimacy" or "Internship agreement") will only apply to some students.

## 6. Work Plan (`/work-plan`)

- **Submit a work plan:** enter your planned tasks.
- **Latest work plan:** its status (Submitted, Approved, Returned) and **reviewer feedback** from the coordinator.
- **History:** earlier submissions.
- An approved plan is locked. To change it, submit a new one for approval.

## 7. Attendance (`/attendance`)

- **Hours rendered** (confirmed), **hours remaining** and **projected completion**. If you have submitted weeks still under review you will see "+N hrs pending faculty review".
- **Deployment Schedule:** once your work plan is approved, set your **working days** and **hours per day**. Later changes go through **Schedule change requested**: give a reason; your adviser validates it and the coordinator approves it; you get a notification with the result. A change only affects future days.
- **Holidays:** Philippine holidays are pre-loaded; mark which ones apply to your company.
- **Report a Deviation:** report an absence, overtime or undertime for a date, with a reason. Today an optional proof file (PDF up to 5 MB, JPG/PNG up to 2 MB) can be attached. L1 proposes replacing deviation proof uploads with status-only requests (proof in Google Classroom); pending confirmation (Q19). Today students can still upload a proof file.
- **Deviation report history:** all your reports and their validation status.
- **Export:** download your attendance log as a CSV file.

## 8. Weekly Reports (`/weekly-reports`)

- **Start a weekly report:** pick the week. IDSMS creates one row per scheduled working day (holidays you marked are skipped).
- **For each day:** choose **Present**, **Absent** or **Holiday**; enter time in and time out (optional), hours, accomplishments and tools used. Absent and holiday days count 0 hours. Hours cannot exceed the time between time in and time out.
- **Copy-paste warning:** if a day's text is nearly identical to another day or to last week, IDSMS warns you to revise it.
- **Running totals:** this week, running total and remaining hours.
- **Preview** the report, then **Submit**. Every day must be filled in. You get a reference code (WR-…).
- **Deadline:** **Tuesday 11:59 PM (Manila)** of the following week. After that the report is marked **late** and you must type a **reason for delay** to submit.
- **After review:**
  - **Approved** or **Regarded:** hours count. Download the PDF, have your supervisor sign it, and post the signed copy in **Google Classroom**.
  - **Returned:** read the adviser's note, edit and resubmit. Hours do not count until approved.
  - **Disregarded:** the submission is removed (for example, the wrong week); start that week again.
- **Download / Regenerate PDF:** if the PDF failed to generate, use Regenerate.

### Coming with Workstream L1 (In progress, not available yet)

- **Two time ranges per day** (morning and afternoon), shown as "N hrs M mins".
- Only time **within your shift** counts. Arriving late or leaving early creates an **undertime** entry; you must add a reason (or a leave request) before the week can be submitted.
- The preview and PDF follow **SLU's Weekly Work Report** layout, with "Week No. N", beginning and ending totals, and the Overtime and Under Time sections for your supervisor to sign.

## 9. Leave & Time Requests (coming with Workstream L1)

**In progress, not available yet.** A new tab will let you:

- file **leave** (planned or emergency; whole day, several days or part of a day), **overtime** (file it **before** working it) and **undertime** requests, each with a reason;
- see each request's status (Pending, Approved, Returned with a note) and edit a returned request.

Rules: overtime counts only if approved and at least **30 minutes**; extra time on a day you were late is never credited (no offsetting). Under the L1 proposal (pending confirmation, Q19), proof (medical certificate, memo, screenshot) goes to Google Classroom with that week's report.

## 10. Monthly Reports (`/monthly-reports`)

- Submit a monthly report for a calendar month once **every weekly report in that month is Approved or Regarded**.
- Each monthly report gets a PDF with a reference code (MR-…).

## 11. Notifications (bell and `/notifications`)

The bell shows unread notifications: report submitted, report returned (with the note), deadline reminders (about 48 and 24 hours before), checklist status changes, work plan reviewed, deviation validated, endorsement letter ready. Click one to open the related page; mark one or all as read. Email copies arrive only once SLU provides a sending email domain.

## 12. Profile (`/profile`)

- **Account:** your email, role and student number. Link to change your password.
- **Legal name:** enter your full name as it should appear on the endorsement letter, reports and final report cover. Letter and cover generation refuse to run without it.
- **Your data:** **Request my data** sends a request to the Super Admin, who must provide a copy of your personal data within **15 days** (RA 10173). You can have one open request at a time.

## 13. Tips

- Submit every Monday or early Tuesday; the late flag uses Manila time, not your phone's time.
- Fill in each day as you go; you can save without submitting.
- If a week is returned, fix only what the note asks and resubmit quickly so your hours count.
- Keep your legal name correct on the Profile page before your adviser generates your endorsement letter.
- Never upload signed or medical documents to IDSMS; use Google Classroom.

## Privacy notice and company registration

- The first time you open IDSMS you'll see the **Data privacy notice**. Choose **I agree** to continue; **I disagree** signs you out (talk to your coordinator). If the notice changes, you'll be asked again.
- When you register your company, IDSMS lists companies already registered under a similar name. If yours is there, choose **This is my company** instead of adding a copy.
- On each weekly report, **Running total (worked)** is the hours you've worked; **Conduct deductions** are shown separately, and **Remaining** takes them into account.
