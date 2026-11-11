# Weekly report: adviser feedback, intern grill and the plan (11 Nov 2026)

Source: Ria Andrea Fernandez's findings, the team lead's follow-ups, and a walkthrough of the
intern flow on local dev (`:3100`, test intern `student.test`), done as a first-time intern with
low computer literacy, on a phone (360 px) and a laptop (1280 px), with deliberately bad input.
Research: NN/g (progressive disclosure, mobile accordions, defaults), Baymard (inline
validation), GOV.UK (check answers), Workday/Harvest/Clockify/Sprout HR (timesheets).

## 1. What the adviser reported, and what changed

| Finding                                       | Cause                                                                                                             | Fix                                                                                                                                                                                                                                                                                                                          |
| --------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The week stops at Thursday                    | The intern's approved schedule is Mon–Thu, 10 h/day; the report followed it but never showed Friday at all        | The schedule is now a **timetable** (Mon–Sun cells) on the weekly reports page, the Attendance page and the schedule-change form; days off read "Off" and can be tapped to add a worked day                                                                                                                                  |
| Changing Day 1's time out changed every day   | `updateTimes` copied a time to every later "untouched" day; since #196 every day starts prefilled, so all of them | A time change applies to **that day only**                                                                                                                                                                                                                                                                                   |
| OT / UT / absence need separate request forms | Requests filed elsewhere, approved one by one                                                                     | Reported **on the day**: the report notices overtime, a late arrival, an early leave or a short day from the times, and asks for the reason there; an absent day asks why, what proof and whether it was planned                                                                                                             |
| The adviser may overrule an excuse            | —                                                                                                                 | Each reason starts **waiting for the adviser**; approving the week accepts the ones left alone; the adviser can mark any one **not accepted** with a note, before or after, and change it back. Hours follow: rejected overtime is taken off credited hours, a rejected absence or early leave stays unexcused               |
| Night shifts (US companies)                   | Times past midnight were refused ("Time out must be after time in")                                               | A day belongs to the date its shift starts; a time out earlier than the time in is the next morning (schedule, daily times, lateness, undertime, overtime and credited hours all agree)                                                                                                                                      |
| 8 hours a day (DOLE)                          | —                                                                                                                 | A schedule over 8 working hours a day (or with no rest day) is **flagged**: on the timetable, the schedule card, the weekly report and the adviser's roster, and the adviser and coordinator are notified when it is set or requested. Never a block; single overtime days are not flagged (they are reported with a reason) |

## 2. The grill: pain points found while testing, and their fixes

1. **Too long, too much at once.** Every day showed seven inputs; every past week was open.
   Now: one line per day (times, hours, status chip), only the first unfinished day open, older
   weeks folded to one line ("Continue this report" / "Show the days"), a coloured week strip on
   top that opens a day when tapped. Hours are worked out from the times (no Hours box); the
   second time range only appears when used.
2. **"Save draft" refused to save.** With prefilled days, saving Monday was blocked until every
   other day had text. Now Save draft saves every finished day and says which days are still to
   do; what the intern typed stays on the device (it survived a closed browser in the test).
3. **"Unsaved" on days the intern never touched.** Shown only after the intern changes a day.
4. **Silent overtime.** Overtime without a reason was simply not credited. The day now says
   "Say why for overtime" in amber, and the panel explains it counts once the adviser accepts it.
5. **Undertime invisible on schedules without times** (the test intern's). A day with fewer
   hours than scheduled is now undertime and asks why.
6. **Developer error text.** 6,000 characters produced "Too big: expected string to have <=5000
   characters". Boxes now stop at their limit and messages say "Keep this under 5,000
   characters".
7. **Phone cut-offs.** Day lines were truncated ("8:00 am – 12:00 p…") and strip cells wrapped
   over three lines; phones now get compact times ("8a–12p, 1p–7p") and one-word cells.
8. **Old wording everywhere.** "Leave & time requests" became "Overtime & absences"; the FAQ,
   the Attendance card and stat strip (now overtime and undertime hours, absence days) and the
   adviser roster say what happened, not where a request stands.
9. **Adviser couldn't see the reasons** on the review page. Each day now shows its reason, its
   decision and Accept / Not accepted controls; totals update the moment a decision changes.

Verified live: overtime, early leave, absence with proof, a 22:00–06:00 shift, emoji and a
`<script>` tag (stored as text, escaped on screen and in the PDFs), a 6,000-character entry,
reload from the server with the device draft cleared, reject → 16 h, accept again → 18 h,
reject → totals 16 h on screen.

## 3. Hard lines (what must not change)

- **The server decides.** Every rule the form shows is checked again on save and submit
  (`dailyEntrySchema`, `assertUndertimeFiled`); the form is a convenience, never the gate.
- **No credit without a reason and the adviser's yes.** Overtime counts only when it has a
  reason, is 30 minutes or more, and is accepted (with the week or on its own).
- **The adviser's decision stands until the intern changes that day.** Re-saving an unchanged
  day keeps the decision; editing the day's times or reason sends it back to the adviser.
- **Never block a schedule for its hours.** Over 8 h/day is a flag for people to act on.
- **One day never edits another.** No copying times across days.
- **Limits:** what you did ≤ 5,000 characters, reasons and tools ≤ 500, reason ≥ 10; times
  are HH:MM, a day's span ≤ 24 h, equal in/out refused, a second range can't overlap the first.
- **Submitted weeks are read-only** until returned or withdrawn; a disregarded week takes its
  reported overtime, undertime and absences with it.
- **Leave approval belongs to the company supervisor**; IDSMS records it and the reason.

## 4. Next (not built yet), in order of value

1. **Intern home: this week's strip** on the dashboard (the same coloured Mon–Sun cells), so
   the first screen answers "what do I still need to write?" in one glance.
2. **Adviser roster: a 4-week attendance strip per intern** (present / absent / overtime), so
   patterns show before reading any text.
3. **Work plan page: the same timetable** beside the uploaded file, with the 8-hour flag.
4. **Multi-day leave in one go**: "Same reason for the other absent days this week".
5. **Live check of the night-shift schedule form and the 8-hour notification** on the beta
   (both are unit-tested; neither was submitted on the shared test account).
6. **Submit on a real week** with the adviser watching, end to end (submit, PDF, approve week,
   see the reasons accepted), once the adviser is ready to receive a test report.

## 5. Test data left on the shared test intern

The Oct 26 – Nov 1 draft week of `student.test` now holds test entries (Mon overtime marked not
accepted, Tue early leave, Wed absence, Thu night shift unsaved). To clear them:

```sql
delete from deviation_reports
where student_profile_id = '8a213754-eeaf-4ddb-abf2-b78af4a2af61'
  and date between '2026-10-26' and '2026-11-01'
  and review_note like 'Reported in the weekly report%';
update daily_report_entries
set attendance_status = 'SCHEDULED', actual_hours = null, credited_hours = null,
    accomplishments = null, tools_used = null,
    time_in = null, time_out = null, time_in_2 = null, time_out_2 = null
where weekly_report_id = '3a1eb9e0-10a2-4b3c-8ea0-f8183da1e5a3';
update weekly_reports set total_hours = 0 where id = '3a1eb9e0-10a2-4b3c-8ea0-f8183da1e5a3';
```
