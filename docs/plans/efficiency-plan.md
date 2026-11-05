# Efficiency plan: fewer clicks, no lost work, less waiting

Written 5 Nov 2026 from seven read-only audits of `develop` at cd52f15 and the live beta
(student, adviser and coordinator test accounts; nothing was submitted or changed):

| Audit                             | Plugins / skills used                                                                                    |
| --------------------------------- | -------------------------------------------------------------------------------------------------------- |
| Workload critique (29/40 Nielsen) | `impeccable` critique, detector                                                                          |
| Flows, forms, clicks              | `marketing-skills:form-cro`, `onboarding-cro`, `design:ux-copy`, `product-skills:ux-researcher-designer` |
| Accessibility (WCAG 2.2 AA, axe)  | `a11y-audit`, `design:accessibility-review`                                                              |
| Speed                             | `vercel:performance-optimizer`, `vercel:react-best-practices`, `cloudflare:web-perf`, Supabase advisors  |
| UI states                         | `break-ui`, `design-taste-frontend`, `emil-design-eng`, `design:design-critique`, `impeccable` audit     |
| Silent failures                   | `pr-review-toolkit:silent-failure-hunter`, `engineering-skills:senior-qa`                                |
| Security and privacy              | `security-review`, `security-guidance`, `supabase`, Supabase advisors                                    |

Not usable this session: chrome-devtools and Playwright MCP (failed to connect; puppeteer used
instead), Semgrep (login refused), PostHog/Sentry/Datadog (not set up for IDSMS).

Rule for every item: fewer steps or less typing **without** dropping a check the guidelines
require. Anything that removes a human check (signed copy in Classroom, adviser review) is out.

## What the audits agree on

- The server is fast (50-200 ms, every query under 7 ms). Pages feel slow because of ~200
  background link prefetches per roster view, redirect pages in the student menu, and a footer
  that jumps on load (layout shift 0.227, target < 0.1).
- Most staff time goes to **remembering what is waiting** and **doing one item at a time**.
- Long forms other than the weekly report have **no draft backup**; a 30-minute session timeout
  loses final report and journal text.
- Security: no high or medium issues. Accessibility: no blockers.

## Phase 1: quick wins (one PR, all S)

Speed

1. `prefetch={false}` on roster and sidebar links (`my-students/page.tsx`, `_components/dashboard-nav.tsx`).
2. Student menu links straight to `/students/{id}/...` (add `id` to the layout's profile select);
   removes the redirect reload (~0.75 s) and the blank main area while loading.
3. `min-h-dvh` on `<main>` in `(dashboard)/layout.tsx`: footer stops jumping.

No lost work 4. Draft backup (`lib/utils/reportDraft.ts`) in the final report, journal and company evaluation
editors; a 401 says "Your session timed out. Your text is still here"; `beforeunload` guard
while unsaved. 5. Bulk import: block leaving until the credentials CSV is downloaded; say "shown only once". 6. "Fill rows with AI" asks before replacing typed rows; "Add to calendar" disables while sending.

Safer defaults 7. No silent first option: onboarding section, class-list import group, Assign adviser get an
empty "Choose..." placeholder. 8. Hide "Start a weekly report" when this week's draft exists; remove duplicate Help link;
fix student home stats ("Pending review —", streak 0, host company "Not yet").

Clear feedback 9. `sendJson` accepts `FormData`; work plan, schedule and MOA forms switch to it and show the
server's field errors; unexpected errors show a reference code; AI 429/5xx says
"AI assist is busy; type it yourself or try later"; paused AI hints say so to advisers;
the notifier's empty `catch {}` logs and still sends the in-app notice.

Accessibility 10. Password eye button dark contrast (3.61 -> 4.5:1), textarea focus ring, `<main>` on login,
heading levels (Clarity Coach, Conduct records), 24 px targets for checkboxes and row links.

Security (low) 11. Work plan upload checks role and ownership before storing the file; log `FILE_ACCESSED` on
work plan and proof downloads; block network requests in the PDF renderer.

## Phase 2: fewer adviser steps (S-M)

12. Notify the reviewer when a work plan, time request or journal is submitted (direct link).
13. **Approve & next** on the weekly review page (opens the next queue item).
14. Daily adviser digest at 08:00 ("N waiting, oldest X days") instead of one email per
    submission, plus a nudge for weeks waiting too long. _Decision needed._
15. One-tap return reasons that fill the note ("Accomplishments too vague", "Times don't match
    schedule", "Signed copy missing").
16. Work plan **Return** asks for a note (the API already accepts it).
17. **Disregard** asks for a reason and confirms "Exclude this week's hours?"; Reject schedule
    change asks for a reason; Merge companies confirms; approving a **flagged** week confirms;
    removing an added day offers Undo. _Label wording is a decision (Regard/Disregard may be SLU terms)._
18. My students: a "Waiting" count per intern; one "Open" menu instead of five links; card
    layout under 640 px (today 7,790 px tall on a phone).

## Phase 3: bulk work and queues (M)

19. Checklist: students mark an item **"Uploaded to Classroom"** (new status, migration); the
    adviser gets a class-wide grid (interns x requirements) with **Approve selected**. Return still
    needs a note. Saves ~360 single approvals per adviser per term.
20. Review queue holds every pending type for advisers: weeks, checklist items marked uploaded,
    time requests, schedule changes, journals.
21. Coordinator **"Waiting on you"** list: work plans, schedule changes at the coordinator stage,
    final reports, disputes, unverified companies, MOAs expiring.
22. Bulk time-request review across advisees, with proof preview.

## Phase 4: smarter intern forms (S-M)

23. A returned work plan opens prefilled with its rows; new row's period starts a week after the
    last; AI read starts when the PDF is picked; "Add all days off to calendar".
24. Weekly report carries "Tools used" over from the last filled day; Submit marks every bad day
    inline and scrolls to the first.
25. Time request "Kind" set from the date (past/same day = Emergency); hints only for their type;
    after sending from a weekly report, return to it.
26. Final report: "Insert from my approved weeks" for Tasks and Accomplishments; supervisors and
    company prefilled from the placement.
27. Company evaluation: "N of 22 left" jumps to the first gap.

## Phase 5: coordinator setup (S-M)

28. Class group form: name + adviser; dates from the active semester; program from the name.
29. "Copy adviser assignments from last semester".
30. CSV import: optional class group column, and a preview ("N new / M skipped") before writing.
31. MOA **Renew**: prefilled programs, starts the day after the old one ends.
32. Export center: one semester filter for the page, default the active semester.
33. Semester form derives the academic year; deduction matrix as a table, not raw JSON.
34. Failed emails: count of the last 7 days on settings, retried by the daily cron.

## Phase 6: polish

35. Semantic search: minimum score, so "no results" can appear.
36. One `displayName()` and date format everywhere; `title` on truncated names.
37. Privacy consent dialog: sticky "I agree" footer on phones.
38. Faculty and coordinator home: "Waiting for your review" as the one primary block; exports
    and endorsement letters move to My students; hours never clipped on phones.
39. Plurals ("2 planned tasks"), one button height, "30 more items" as a link.
40. Payload: mount weekly forms only for editable weeks; keep zod out of the login bundle;
    index the 11 unindexed foreign keys.

## Decisions for Jay

- **D1** Replace the per-submission adviser email with the daily digest (14)? Interns keep their receipt.
- **D2** Rename Regard/Disregard (17), or keep SLU's words and only add the reason + confirm?
- **D3** New checklist status "Uploaded to Classroom" (19) needs a migration on the beta DB.
- **D4** Accept the privacy consent on the coordinator test account so its pages can be audited
  (writes one consent row).
- **D5** Order: phases 1 -> 2 -> 3 recommended; 4-6 after.

## Not checked

Screen readers, 200 % zoom, throttled mobile network, real usage data, coordinator pages behind
the consent dialog, Vercel function logs for the 9.6 s cold start on `/users`.
