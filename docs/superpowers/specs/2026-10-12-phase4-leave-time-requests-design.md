# Phase 4 Workstream L — Leave & Time Requests (design)

Date: 2026-10-12. Status: design approved in chat by Jay (2026-10-12). It is built after the D7 checklist change.
Source: SLU's internship guidelines slides "Leaves and Absences" and "Under Time (UT) and Over Time (OT)", shared by Jay 2026-10-12. PRD FR-AT-03/04/05. Decisions D2 and D7 (no signed or sensitive documents stored in IDSMS).

## Intent

Make leaves, absences, overtime and undertime a uniform, trackable process in IDSMS, the same way weekly reports work:

1. The student files a written request in IDSMS.
2. IDSMS generates a request form PDF.
3. HR or the supervisor signs the paper.
4. The signed form and any proof go into that week's report in Google Classroom.
5. The faculty adviser approves or returns the request in IDSMS.
6. Rendered hours follow SLU's rules exactly.

## The SLU rules this must enforce

1. **Leave/absence:** anticipated leave needs prior written communication or an HR-approved form. For emergencies, the written communication comes first and any form follows on return. Medical concerns need a medical certificate; non-medical concerns need proof of leave or absence. Documents are attached to the weekly report that covers those dates.
2. **Overtime (OT):** needs a written request to HR or the supervisor **before** working off-duty hours. Hours after the shift are not credited without that approval. OT is credited only when it is **at least 30 minutes**; less is not credited.
3. **Undertime (UT):** a written request is needed when rendering less than the required daily hours, approved by HR or the supervisor.
4. Every request states **why** the OT or UT is needed.
5. **No offsetting:** extended time rendered to cover unwarranted tardiness or undertime is **not credited, even if the weekly report is signed by HR or the supervisor**.

## Decisions (Jay, 2026-10-12)

- Approved OT of at least 30 minutes **adds** to the rendered-hours total toward required hours. Answered "yes"; the goal is that it is uniform and tracked in IDSMS.
- No uploads (D2/D7). Medical certificates and signed forms never enter IDSMS.
- Built after the checklist status-only change.

## Design

### Data

- Rework the existing `DeviationReport` into the request record. It already has `deviationType` (ABSENCE/OVERTIME/UNDERTIME), `date`, `reason`, `validationStatus` and `facultyId`. Add nullable columns, so existing rows stay valid:
  - `requestKind` (`ANTICIPATED | EMERGENCY`)
  - `endDate` (multi-day leave)
  - `startTime` / `endTime` ("HH:MM" Manila, for OT/UT)
  - `requestedMinutes`
  - `proofType` (`MEDICAL_CERTIFICATE | PROOF_OF_LEAVE | WRITTEN_NOTICE`, for absences)
  - `referenceCode` (`LR-YYYYMMDD-XXXXXXXX`)
  - `submittedAt`
  - `reviewNote`
- Status mapping: the existing `ValidationStatus` PENDING/VALIDATED/REJECTED stays. The UI shows it as Pending / Approved / Returned, with a note on Returned. A Returned request can be edited and resubmitted, as with weekly reports.
- `proofUrl` is no longer written. Legacy values stay readable to staff. The upload route is removed.
- `WorkPlan.scheduleConfig` gets an optional `startTime` ("HH:MM"). It is a JSON field, so no migration. Without it, tardiness can't be detected, and the no-offsetting rule falls back to "credit only within scheduled hours unless an approved OT request exists".
- One migration: `008_leave_time_requests.sql` (the nullable columns plus a `DocumentType` value `LEAVE_TIME_REQUEST`). It is applied with Jay's OK, as with 007.

### Student: new "Leave & Time Requests" tab (nav, student only)

- Lists the student's requests: date(s), type, kind, status, reference code, and actions (Edit while Pending or Returned, Download form).
- A form to create or edit a request:
  - type, kind, date or date range;
  - for OT/UT, time range, with minutes computed;
  - reason (required, 10–500 characters);
  - proof type (absence only);
  - help text that quotes the SLU rules above, including "OT must be requested before it is worked" and "OT under 30 minutes is not credited".
- An OT request filed for a date in the past is accepted but labelled **"Filed after the fact"** for the adviser, because SLU requires OT requests to be filed before the work.
- _(Superseded by the OT/UT report sections below: no separate request form PDF. Requests print inside that week's weekly report.)_

### Faculty adviser / staff

- Requests appear on the student's attendance page and in a "Pending requests" count on the faculty dashboard.
- Approve, or Return with a note: the existing validate route, extended with a note. Notifications reuse `DEVIATION_VALIDATED`, plus a new `REQUEST_RETURNED`. Every action is audited.

### Hours (`calculateRenderedHours`): SLU rules

For each daily entry in an APPROVED or REGARDED weekly report:

- `base = min(actualHours, scheduledHours)`.
- `extra = actualHours − scheduledHours` (if > 0) is credited **only if** all of these hold:
  - an APPROVED OVERTIME request covers that date;
  - `extra ≥ 0.5 h` (30 minutes);
  - the day has **no offsetting**: if a schedule `startTime` exists and the entry's `timeIn` is later than it, the day was tardy, so the extra is not credited.
  - Credited extra = `min(extra, approved requestedMinutes / 60)`.
- **Undertime** needs no special maths: `base` already reflects the shorter day. Without an approved UT request, the day is flagged "Undertime without request" on staff views. It is not blocked, because the hours simply weren't rendered.
- **Absence:** an approved leave marks the day as excused on the calendar and weekly report (0 hours). The projected completion date already moves, because remaining hours stay higher.
- **Effect on current data:** any existing approved week with hours over the schedule and no approved OT request stops crediting those extra hours. This is the intended SLU rule. The PR lists the dev DB students whose totals change.

### Weekly report link

The weekly report preview/PDF lists that week's requests and their reference codes, so the signed forms attached in Google Classroom can be matched to the report.

### SLU Weekly Work Report template (sample shared by Jay 2026-10-12; resolves roadmap decision D3)

The sample report shows the official layout and how SLU counts hours. L adopts it.

- **Header:** "School of Accountancy, Management, Computing and Information Studies / IT-MMA/CS-CAD Department / Saint Louis University, Baguio City". Then "Weekly Work Report", "Week No. N (date range)", "Name: Last, First M.", and "Company:".
- **Detailed Time Record table:** Date (Day) | Actual Work Times | Hours Rendered | Work Accomplishment.
  - **Actual Work Times allows up to two ranges a day**, a morning and an afternoon session, e.g. "8:00 am – 12:00 pm" and "1:00 pm – 5:00 pm".
  - **Hours Rendered is shown as "N hrs M mins".**
  - Holiday rows read "Holiday (PH Calendar)" with 0 hours.
  - Saturday rows appear when they are in the schedule.
- **Totals:** "Total work-hours rendered" (this week), "TOTAL work-hours (beginning)" (before this week), and "TOTAL rendered so far (ending)".
- **Signature block:** supervisor name and date signed.
- **Note lines:** "The sample follows an 8am - 5pm shift with a 1-hour lunch break." and "Overtime should be logged in the DTR."
- **Attachments** such as a company holiday memo go into Google Classroom with the signed report (D2/D7).

Consequences for the data and the hours rules:

- **Schedule:** `scheduleConfig` gains `startTime`, `endTime` and `breakMinutes`, all optional JSON, so no migration (e.g. 08:00 / 17:00 / 60 → 8 h). `hoursPerDay` stays as the fallback.
- **Daily time record:** `DailyReportEntry` gains `timeIn2` / `timeOut2` (nullable) for the afternoon session. The existing `timeIn` / `timeOut` become the morning session. Actual hours are the sum of both sessions.
- **Credited hours per day:**
  - The time inside the scheduled shift window counts, minus the break, capped at the scheduled hours.
  - Time outside the window counts only as approved OT, at least 30 minutes and capped at the approved minutes.
  - On a tardy day (first time-in later than `startTime`), OT is never credited (no offsetting).
  - Worked examples from the sample (8:00–5:00 shift, 1 h lunch):
    - Jun 15: 7:35–12:10 and 1:00–5:05 gives **8 hrs**.
    - Jun 16: 8:30–12:00 and 1:00–5:00 gives **7 hrs 30 mins**.
  - Faculty-confirmed FAQ (SLU slide "What if I logged in before my shift and logged out after my shift?", answered **"no"** by the internship faculty, relayed by Jay 2026-10-12):
    - Shift 8:00–12:00 / 1:00–5:00, log in 7:55, log out 5:15. The answer is **8 hours, not 8 hours 20 mins**.
    - The 5 minutes before the shift and the 15 minutes after it are outside the shift window.
    - Those 20 minutes are also under the 30-minute OT minimum, so they are not credited even with an approved OT request.
  - All three cases become test cases.
- **Weekly report PDF:** uses this template and lists that week's L request reference codes, so the signed forms can be matched.

### SLU OT/UT report sections (second sample shared by Jay 2026-10-12): replaces the separate request form PDF

OT and UT are not separate forms. They are **optional sections of the weekly report**, each with its own supervisor signature line ("<name of supervisor>, <date>"):

- **"Report on Overtime Hours (this section is only included if the student rendered over time)":**
  - columns: Date | Time in – Time out | Hours Rendered | Remarks (reasons for off-duty work, plus the necessary documentation such as a screenshot or copy of the communication or request);
  - example: "Jun 17 (Saturday) | 8:00 am – 12:00 pm | 4 hrs | In lieu of the holiday last 12 July".
- **"Report on UNDER TIME Hours (this section is only included if the student incurred an under time)":**
  - columns: Date | UNDERTIME HOURS (time range) | Total UT Hours | Remarks (reasons, provide necessary documentation), plus a "TOTAL UT Hours" row;
  - examples: "Jun 13 (Tuesday) | 1:00 pm – 5:00 pm | 4 hrs | Need to submit my waiver and undertaking", "Jun 16 (Friday) | 8:00 am – 8:30 am | 30 mins | Woke up late", total "4 hrs 30 mins".
- **Notes printed:** "An overtime is credited when the Intern has incurred at least 30 minutes of off-duty time. Less than the minimum time will not be credited." and "Extending the hours to compensate for tardiness is impermissible."

Design changes from this sample:

- **No separate request form PDF:**
  - The "Leave & Time Requests" tab still records each request: the reason is the written request, and OT is filed beforehand.
  - The weekly report PDF prints that week's OT and UT entries as the two sections above, omitted when empty.
  - The supervisor signs the weekly report.
  - `referenceCode` and `DocumentType LEAVE_TIME_REQUEST` are dropped from the data plan.
- **Tardiness is undertime:**
  - When a day's first time-in is later than the schedule `startTime`, IDSMS creates a draft UT entry for the gap, e.g. 8:00–8:30 for 30 mins.
  - The student must add a reason before the weekly report can be submitted.
  - Leaving early before `endTime` is handled the same way.
- **Non-scheduled days** (e.g. a Saturday outside a Mon–Fri schedule): all time worked counts only as OT, which needs an approved request and at least 30 minutes.
- **Remarks/proof:** the student types the reason, and the proof (screenshot, memo) is attached in Google Classroom (D2/D7).
- **Leaves and absences:** shown in the daily time record with a status label, like "Holiday (PH Calendar)", e.g. "Approved leave", with 0 hours. Proof goes in Google Classroom with that week's report.

### Demerits (Jay, 2026-10-12: "once incurred, a demerit reduces rendered hours"; "both can be set so it is flexible, not hard-fixed")

- **Deduction:** a **default deduction per demerit**, configurable by the Super Admin (SystemConfig `demerit:default_hours`, initial value 0 until SLU's figure is known; the settings form follows the existing required-hours and notification settings pattern). The issuer can **override it per case**, from 0 up to a sane cap of 40 h.
- **Who issues:** the **faculty adviser** (for their own students only) **and the coordinator / Super Admin**.
- **Record:** a new `demerits` table with `studentProfileId`, `issuedBy`, `date`, `category` (free text), `reason` (required, 10–500 characters), `hoursDeducted`, an optional `revokedAt` / `revokedBy` / `revokeReason`, and `createdAt`.
  - A demerit is never deleted, only revoked with a reason.
  - Every issue and revoke is audited (`DEMERIT_ISSUED`, `DEMERIT_REVOKED`), and the intern is notified (`DEMERIT_ISSUED`).
- **Hours:** rendered hours = the credited hours from the rules above, **minus the sum of active (non-revoked) demerit deductions**, floored at 0. The projected completion date moves accordingly.
- **Visibility:** the intern sees their demerits (date, category, reason, hours) on their attendance page. Staff see them on the student's page, and the faculty dashboard shows a count per student.
- Migration 008 adds the table, with RLS on.

### Deduction matrix: grade points (SLU "Deduction Matrix" slide; Jay 2026-10-12: "these are points", "they will update the matrix")

SLU deducts **grade points** in two columns, **ADVISER** and **WWR** (Weekly Work Report), according to how many times something happened. The faculty will revise the matrix, so **IDSMS stores it as editable configuration, not code**.

- **Matrix (SystemConfig `deduction_matrix`, JSON, edited by the Super Admin in settings):**
  - a list of categories, each with a label;
  - its count tiers `[{ count, adviser, wwr }]`;
  - an optional `extraIfNoValidReason: { adviser, wwr }`;
  - whether it is `automatic` or `manual`.
  - Initial values come from the slide:
    - **written warnings** 1 → −2/−2, 2 → −3/−3 (manual). Note: "First and Final/Last" or a "FINAL" warning without a "FIRST" counts as 2 warnings; the issuer picks a weight of 1 or 2.
    - **demerits** 1 → −3/−3, 2 → −4/−4, 3 → −5/−5, 4 → −6/−7 (manual).
    - **late WWR / monthly journals** 1 → −3/−5, 2 → −4/−6, 3 → −5/−7, 4 → −6/−8, plus 2 extra points for a missing one with no valid reason (automatic).
    - **unsupported UT/absences** 1 → −2/−2, 2 → −3/−3, 3 → −4/−4, 4 → −5/−5, plus 2 extra for no valid reason (automatic).
    - **major violations** 1 → −4/−5, 2 → −5/−6 (manual).
    - **suspensions**: rows to be filled in by the faculty (manual).
  - Admins can add categories.
- **Tier semantics (assumption, adjustable):** a tier value is the **total** deduction at that count (e.g. 3 demerits = −5 in total, not −3−4−5). A count above the last tier uses the last tier.
- **Manual entries:** stored in the `demerits` table, renamed `conduct_records`, with a `category` key, `weight` (1 or 2), date, reason, issuer, and revoke fields.
  - Issued by the faculty adviser (own students) or coordinator / Super Admin.
  - Never deleted, only revoked; audited and notified to the intern.
- **Automatic counts:**
  - late or missing weekly reports, from the existing late flag (FR-WR-05) and missing due weeks; monthly journals once that deliverable exists;
  - UT/absences with no approved L request.
  - "No valid reason" means the item was never justified (no approved request, or a missing report).
- **Tally:**
  - per intern: each category's count and the resulting ADVISER and WWR point deductions;
  - shown on the intern's page (staff), on the faculty dashboard (per-student totals), and to the intern on their own attendance page.
  - IDSMS **does not compute the final grade**; it reports the deductions. A grading formula can be added later.
- **Exceptions (SLU slide, shared 2026-10-12):** "Submitting a late or missing deliverable does not mean that the intern is absolved from receiving penalties or deductions in their evaluation. However, an exception is granted to those with formal written documentation attested by their respective HTE representatives, or under certain circumstances beyond the intern/student's control."
  - Late submission still counts: submitting a missing or late report afterwards does **not** remove its deduction.
  - Staff (the assigned adviser, or coordinator / Super Admin) can mark an individual automatic item as **Excused**. Automatic items are a late or missing weekly report or journal, or an unsupported UT/absence.
  - Excusing requires a reason: `HTE_ATTESTED_DOCUMENTATION` or `BEYOND_INTERN_CONTROL`, plus a note of 10–500 characters. The documentation itself is in Google Classroom (D2/D7).
  - Excused items are excluded from the tally and listed as "Excused" with the reason. An excuse can be withdrawn.
  - Excusing and withdrawing are audited (`DEDUCTION_EXCUSED`, `DEDUCTION_EXCUSE_WITHDRAWN`) and stored in a small `deduction_exceptions` table keyed by item type and id. It is never deleted, only withdrawn.
- **Hours:** a conduct record may also carry an optional `hoursDeducted` (default 0; the default is set by the Super Admin, overridable per case). Rendered hours subtract the active records' hours. This keeps Jay's earlier "a demerit reduces rendered hours" possible without forcing it.

## Out of scope

- Uploads of any kind (D2/D7).
- Company-specific leave forms. IDSMS's form is the standard SLU request; the company's own form can be attached in Classroom too.
- Automatic tardiness from biometric data.

## Testing (TDD)

- Credited-hours rules:
  - OT is credited only with an approved request;
  - 29 minutes is not credited, 30 minutes is;
  - credit is capped at the approved minutes;
  - tardy day plus extra time gives no OT credit (no offsetting);
  - no `startTime` means no tardiness check;
  - undertime reduces hours;
  - legacy approved weeks recompute as expected.
- "Filed after the fact" label.
- Resubmit after Return.
- Request form PDF includes the reference code.
- Role checks: only the student files their own requests; only an assigned adviser or staff can approve.
- No upload route remains.
