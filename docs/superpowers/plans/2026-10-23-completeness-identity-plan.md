# Completeness plan: identity, account, legal, orientation, CMO 104 (2026-10-23)

Status: **draft for Jay's approval**. Nothing below is built yet except Part 0, which is on
branch `feat/theme-sidebar-charts` (uncommitted).

Constraint: the Phase 4 roadmap declares a feature freeze ("after Phase 4, Phase 5 adds no
product features"). Every item below therefore states why it earns a place before the defense,
and the big CMO 104 modules are deliberately left for after it.

## What Jay asked, and the honest answers

| Question                        | Answer today                                                                                                                                                                           |
| ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Where is dark mode?             | Built on the branch (sidebar button + Profile → Appearance), not merged yet.                                                                                                           |
| Where are settings?             | Super Admin has System settings; nobody has _personal_ settings beyond Profile.                                                                                                        |
| Who am I? Where are the names?  | **Staff accounts have no name at all**: `users` stores only an email. Students' names live on `student_profiles`. The sidebar shows an email in small grey text.                       |
| Where is the privacy agreement? | It exists (PR #101): a blocking dialog after sign-in, versioned. Test accounts already agreed, so it doesn't reappear. There is **no Terms of Use** and no page to re-read the notice. |

## Research summary (sources at the end)

- **Account menu.** Where the main navigation is a sidebar, the identity block (avatar, name, role,
  email) sits in the sidebar footer and opens the account menu; with a top bar it sits top-right.
  The menu holds identity, account, settings, help, legal and sign-out last.
- **Theme.** Two camps: 2-state toggle vs Light / Dark / System. Agreed points: default to the
  device setting; never make users cycle through hidden states; a full choice belongs in settings.
- **Personal settings.** The common grouping is Profile · Notifications · Security · Preferences,
  each deep-linkable. Security should let users see and end other sessions (lost or shared device).
- **Sessions.** "Sign out everywhere else" exists for shared/public computers, forgotten sessions
  and suspected compromise; the current device is excluded.
- **Re-consent.** Store a version with each acceptance, block after sign-in when the stored version
  is behind, require an explicit action, define the decline path (sign out).
- **Onboarding.** Auto-started tours complete poorly (median about 23%); self-chosen ones and short
  checklists do far better; tours over 5 steps drop below 50%.
- **Notification preferences.** Fatigue is the main reason people tune out; keep 3–5 categories;
  security mail (password reset) is never optional.
- **Command palette.** Pays off in dense, keyboard-heavy tools (Linear, GitHub); an addition, not
  navigation; accessibility is hard.
- **CHED CMO 104 s.2017 (SIPP).** Student requirements include medical certificate, notarized
  parental consent, internship journal, exit presentation; the HEI keeps a pool of HTEs with MOAs,
  an internship plan, monitoring, and **insurance (travel, medical, health) for the internship's
  duration**; HTE performance evaluation. CMO 10 s.2023 covers internships abroad only.
  _To verify against the official CHED PDF: exact section numbers, hour limits, evaluation form._

## The debate: adopt, adapt or decline

| Common feature                                                                                 | Why apps have it                                                           | IDSMS verdict                                                                                                                                                                    |
| ---------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Names everywhere                                                                               | Accountability: "Returned by Prof. Cruz" means something, an email doesn't | **Adopt.** Add `users.full_name`                                                                                                                                                 |
| Avatar                                                                                         | Recognition at a glance                                                    | **Adapt:** initials only. Photos are personal data under the DPA, need storage and moderation, add nothing to monitoring                                                         |
| Account menu                                                                                   | One place for "me" things                                                  | **Adopt** in the sidebar footer (our nav is a sidebar)                                                                                                                           |
| Light / Dark / Device                                                                          | Comfort, battery, evening use                                              | **Adopt** (done): one-tap toggle in the menu, full choice in settings                                                                                                            |
| Personal settings page                                                                         | Users control their own experience                                         | **Adopt:** Profile · Appearance · Notifications · Security · Privacy                                                                                                             |
| Sessions / sign out elsewhere                                                                  | Shared and lab computers                                                   | **Adopt, small:** count + "Sign out of other devices" (no device list: sessions store no device data, and collecting it is more personal data)                                   |
| Two-factor auth                                                                                | Account takeover                                                           | **Decline for now.** Export Center already re-authenticates; TOTP is a new dependency + recovery flow. Backlog for Super Admin                                                   |
| Versioned privacy + terms acceptance                                                           | Informed, provable consent                                                 | **Adopt:** extend the existing dialog to Privacy Notice + Terms of Use, one version, re-asked once                                                                               |
| Public privacy / terms pages                                                                   | Notice must stay readable                                                  | **Adopt:** `/privacy`, `/terms`, linked from sign-in, the menu and the dialog                                                                                                    |
| Cookie banner                                                                                  | ePrivacy/GDPR for tracking cookies                                         | **Decline.** We set only the session cookie, a sidebar cookie and a theme value: all strictly necessary/preference, no tracking. Say so in the privacy notice                    |
| Product tour                                                                                   | Teach the UI                                                               | **Decline the tour; adopt a checklist:** a "Getting started" card per role built from real data (schedule set, work plan approved, first report), gone when done                 |
| Help / FAQ                                                                                     | Fewer "how do I" messages                                                  | **Adopt:** `/help` per role + who to contact + glossary (HTE, MOA, DTR, SIPP)                                                                                                    |
| Command palette                                                                                | Power users                                                                | **Decline.** About 10 nav items. **Adapt** the real need: staff "Find an intern" search                                                                                          |
| Notification preferences                                                                       | Email fatigue                                                              | **Adopt, Should:** mute non-critical email categories; in-app stays; security mail fixed                                                                                         |
| Language switcher                                                                              | Reach                                                                      | **Decline.** English is SLU's medium of instruction                                                                                                                              |
| Live chat                                                                                      | Support                                                                    | **Decline.** Coordinator contact on `/help`                                                                                                                                      |
| Distinct tab titles                                                                            | Find the right tab/history entry                                           | **Adopt:** every page title is "IDSMS-CIS" today                                                                                                                                 |
| Skip link, show password, caps-lock hint                                                       | Keyboard users; sign-in errors                                             | **Adopt** (tiny)                                                                                                                                                                 |
| CMO 104 insurance proof                                                                        | HEI must insure interns                                                    | **Ask Jay:** a checklist item (enum + label) if SLU wants students to upload proof                                                                                               |
| Monitoring visit log, pull-out status, supervisor evaluation module, certificate of completion | CMO 104 HEI/HTE duties                                                     | **Backlog after the defense.** New modules break the freeze; supervisor scores already live in the Final Technical Report and signed copies go to Google Classroom (decision D2) |

RICE ranking of the adopted items (reach = users per semester): clickwrap 106 · staff names 88 ·
account menu 88 · privacy status 66 · tab titles 66 · skip/show-password 66 · getting-started 64 ·
insurance item 60 · public legal pages 44 · sessions 35.

## Plan

### Part 0: finish and ship what is built (branch `feat/theme-sidebar-charts`)

Dark mode (night watch, palettes mirrored once in `globals.css`), collapsible sidebar (cookie),
display face, beacon beam, greeting, staff charts, Profile → Appearance. Remaining: rebuild,
live check light/dark at 1440/390 for all roles, taste inspector, tsc/lint/jest/build, PR.

### Part 1: identity and account (migration 015, run 1)

1. `users.full_name text null`; staff create form + Users list + Profile edit; seed-free (admins fill in).
   A display helper `displayName(user)` = full name → student profile name → email.
2. Use it in: sidebar identity block, review/approval lines, audit log, notifications, emails.
3. Identity block: initials avatar (deterministic brand tint), name, role chip, email; click opens
   the account menu: Profile & settings · Theme (Light/Dark/Device) · Help · Privacy notice ·
   Terms · Sign out. Same block on the phone header (avatar button).
4. Profile becomes **Account settings** with sections and anchors: Profile · Appearance ·
   Notifications · Security (change password, "Signed in on N devices · Sign out of other
   devices") · Privacy (agreed on date, version, view notice, request my data).

### Part 2: legal

5. `/privacy` and `/terms` public pages (sign-in footer links). Terms draft: acceptable use
   (no account sharing, honest reports, no uploading others' personal data, AI advisories are
   not verdicts). **Draft text marked for adviser/DPO review.**
6. The consent dialog asks for both, one version (`PRIVACY_NOTICE_VERSION` bump), decline = sign out.
   Everyone sees it once more after deploy (intended).

### Part 3: orientation and small details

7. Getting-started card per role (derived, no storage).
8. `/help` with FAQ per role, contacts, glossary.
9. Staff "Find an intern" (name or student number) in the sidebar/top of staff pages.
10. Per-page titles (`metadata.title` template "%s · IDSMS"), skip link, show-password + caps-lock
    hint on sign-in.

### Part 4: CMO 104 and notifications

11. If approved: `INSURANCE_COVERAGE` checklist item (migration 015, run 2), optional by default
    in System settings.
12. Notification email preferences (Should): 3–4 categories on Account → Notifications;
    `notify()` honours them; password reset and security mail always send.

### Part 5: small details (researched 2026-10-23, second pass)

**5a. Password fields (Jay asked: show password on sign-in).** One `PasswordInput` component
(`src/components/ui/password-input.tsx`, forwardRef so react-hook-form `register` keeps working)
replaces all 8 password inputs in 5 files: sign-in, change password (3), reset password (2),
Export Center re-auth, bulk endorsement re-auth. Behaviour, following GOV.UK's tested pattern:

- a real `<button type="button">` with visible text "Show"/"Hide" plus an eye icon (text beats
  icon-only), `aria-controls` the input, `aria-pressed` as the state; 44px tall on phones;
- a screen-reader-only status "Your password is shown/hidden". Never announce the password itself
  (GOV.UK dropped that: it reads the password aloud in public);
- the field hides again on submit, so the password isn't left on screen and browsers save it;
- a "Caps Lock is on" hint under the field (`getModifierState`), the commonest cause of
  "wrong password" with a correct password;
- paste always allowed; `autocomplete` set on every field (`current-password` on sign-in and
  re-auth, `new-password` on change/reset). Today change/reset have none, so password managers
  can't offer to generate or save. WCAG 2.2 "accessible authentication" rates blocking managers
  or paste as critical.
- One unit test: toggles type and `aria-pressed`, resets on submit, caps hint appears.

**5b. Other details, debated**

| Detail                                                                       | Why great apps have it                                                             | Verdict                                                                                                                                                         |
| ---------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Relative times with exact time on hover ("3 days ago")                       | Easy to scan; exact time one hover away                                            | **Adopt** for notifications and the faculty review queue ("waiting 3 days" shows what's oldest). Records (deadlines, report weeks) stay absolute                |
| Unsaved-changes guard                                                        | Losing typed work is the worst form failure                                        | **Adopt, dirty forms only**, on the work plan and final report (weekly reports already keep browser drafts). Browser `beforeunload` plus in-app links           |
| Error summary on failed submit                                               | Keyboard and screen-reader users find every error                                  | **Adopt** on the long forms (weekly report, work plan, final report); inline errors stay                                                                        |
| Web app manifest + `theme-color`                                             | "Add to Home screen" gives students an app icon; the browser bar matches the brand | **Adopt** (manifest, icons, light/dark theme-color). **Decline** the install pop-up (gets dismissed) and offline mode (offline submissions risk data integrity) |
| Copy button on report IDs (`WR-20260928-…`)                                  | Citing a report in Classroom or an email without retyping                          | **Adopt (Should)**                                                                                                                                              |
| Calendar feed (.ics) of deadlines                                            | Deadlines in the student's own calendar                                            | **Backlog.** Subscribed feeds don't remind and refresh slowly (hours); IDSMS already sends reminders                                                            |
| Count badges in the nav                                                      | Triage at a glance                                                                 | **Decline.** One more query on every page, and the bell already counts                                                                                          |
| Keyboard shortcut sheet / palette                                            | Power users                                                                        | **Decline** (see command palette above)                                                                                                                         |
| Proportional feedback (small action, small cue; submit, clear success state) | Feels responsive, not noisy                                                        | **Check in review**: toasts already exist. Make sure big submits show a success state, not just a toast                                                         |
| Confirm before destructive actions                                           | Prevents accidents                                                                 | **Exists** (dialogs); verify every delete/withdraw in the review                                                                                                |
| Skip link, tab titles                                                        | Keyboard users; finding tabs                                                       | Already in Part 3                                                                                                                                               |

### Part 6: laws of UX, Nielsen's heuristics, WCAG 2.2 (researched 2026-10-23, third pass)

Sources: lawsofux.com (30 laws), NN/g's 10 heuristics, W3C "What's new in WCAG 2.2",
Shneiderman's 8 golden rules. Each law was checked against the running app; only laws that
point at a concrete IDSMS change are listed. Laws already satisfied are noted so nobody redoes them.

**Already satisfied (keep):** Goal-gradient (hours ring "% there", checklist "0 of 9"),
Zeigarnik ("Waiting on you"), Parkinson (deadline countdown "4 days left"), Von Restorff (one
glowing primary action, rose "Needs your action"), Chunking/Miller (nav in labelled groups of
≤4), Proximity/Common region (cards), Serial position (Dashboard first, sign-out last),
Aesthetic-usability (Beacon Glow), Recognition over recall (tables show names first),
Error prevention (confirm dialogs), Visibility of status (active nav, statuses, drafts).

**Changes the laws call for**

| #    | Law / heuristic                                                   | Finding in IDSMS                                                                                                                                                                                     | Change                                                                                                                                                                                   |
| ---- | ----------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 6.1  | Peak-end rule; Shneiderman "design for closure"                   | Big moments end in a toast that vanishes                                                                                                                                                             | Clear closure states: weekly report submitted ("Week of Oct 19 sent to your adviser"), final report approved, internship complete (a "beacon lit" completion card when hours reach 100%) |
| 6.2  | Consistency and standards (Nielsen 4)                             | 8 pages build their own h1 instead of PageHeader (export center, audit log, calendar, companies, company detail, notifications, semesters, bulk import)                                              | Move all 8 to PageHeader                                                                                                                                                                 |
| 6.3  | Postel's law (be liberal in what you accept)                      | Sign-in looks up the email exactly: a capital letter or trailing space from paste/autofill fails as "invalid credentials"; creation doesn't normalise either (all 5 dev rows happen to be lowercase) | Trim and lowercase emails in the shared validators (sign-in, reset request, staff create, bulk import) + a test                                                                          |
| 6.4  | Doherty threshold (<400 ms feedback)                              | On this PC the DB is ~4 s away; clicking a nav item gives no instant cue                                                                                                                             | `useLinkStatus` (Next 16, built in) shows a pending shimmer on the clicked nav item                                                                                                      |
| 6.5  | WCAG 2.4.11 Focus not obscured                                    | The sticky phone header can cover a focused field when tabbing; the `#interns` jump lands under it                                                                                                   | `scroll-padding-top` on phones equal to the header height                                                                                                                                |
| 6.6  | WCAG 2.5.8 Target size (24 px min); Fitts's law                   | Not audited since the redesign                                                                                                                                                                       | Script-audit every page for targets < 24 px (44 px for primary touch actions) and fix offenders                                                                                          |
| 6.7  | WCAG 3.2.6 Consistent help; Nielsen 10                            | No help anywhere                                                                                                                                                                                     | Help link always in the same place (account menu + sidebar footer), pointing to `/help` (Part 3)                                                                                         |
| 6.8  | Visibility of status + relative time                              | Weekly report drafts save silently                                                                                                                                                                   | "Draft saved · 2 min ago" (exact time on hover) on the weekly report                                                                                                                     |
| 6.9  | User control and freedom (Nielsen 3); Shneiderman "easy reversal" | A submitted weekly report can't be pulled back, even before anyone reviews it                                                                                                                        | **Ask-free, small:** "Withdraw to draft" while status is SUBMITTED and unreviewed (audited, faculty never see it as pending). Service + route + test                                     |
| 6.10 | Tesler's law / WCAG 3.3.7 Redundant entry                         | To check in Part 3 build: does the weekly report prefill times from the approved schedule?                                                                                                           | Prefill if missing                                                                                                                                                                       |
| 6.11 | Paradox of the active user                                        | People don't read manuals                                                                                                                                                                            | Help lives in context: helper text under fields and the Getting-started card (Part 3) before `/help`                                                                                     |
| 6.12 | Hick's law / choice overload                                      | Settings sections could sprawl                                                                                                                                                                       | Account settings capped at 5 sections; sensible defaults; no per-item toggles beyond 3–4 email categories                                                                                |

Decision (Jay, 2026-10-23): insurance proof is **not stored** (SLU holds it); no checklist item.

**Status (2026-10-23):** built: 5a (#108), Parts 1–3 (#109–#111), 6.2/6.1/6.5/6.6/6.7 (this
pass). Dropped after checking the running app: Part 3's getting-started card and staff
intern search (duplicates of "Waiting on you" and the Users search); 6.4 (the dashboard's
`loading.tsx` already makes navigation instant, so `useLinkStatus` never fires); 6.8 (a
local-only "saved" line could be mistaken for a server save; restore notice + "Draft saved"
exist); 6.1 submit confirmation (toast with reference + submitted state exist). Backlog:
6.9 withdraw-to-draft (policy question for the adviser), 6.10 prefill check, Part 4
notification preferences.

### Verification for every part

tsc, eslint (max-warnings 0), jest with new tests for the helpers (display name, initials,
preferences), build, live run in the visible browser per role at 1440 and 390 in light and dark,
taste inspector on changed screens, console errors 0. One PR per part.

### Backlog (after the defense)

Monitoring visit log, pull-out/withdrawn status, certificate of completion upload, Super Admin
2FA, CMO 104 section-by-section check against the official CHED PDF.

## Decisions needed from Jay

1. Migration 015 (`users.full_name`) on the dev DB: yes/no.
2. Terms of Use and privacy page text: OK to ship my draft, marked for adviser/DPO review?
3. Feature freeze: count Parts 1–3 as Phase 4 completeness (not new features)?
4. Insurance checklist item: does SLU want students to upload proof, or does the university hold it?

5. Part 5 order: build 5a (password fields) first, since you asked for it directly?

## Sources

- Password input: design-system.service.gov.uk/components/password-input ·
  technology.blog.gov.uk/2021/04/19/simple-things-are-complicated-making-a-show-password- ·
  github.com/alphagov/govuk-frontend/issues/4857 · UI/UX Pro Max guideline DB (accessible
  authentication, password visibility, error summary, loading, confirmation, toasts)
- Unsaved changes: cloudscape.design/patterns/general/unsaved-changes · React Router `useBeforeUnload` docs
- Timestamps: cloudscape.design/patterns/general/timestamps · design.gitlab.com/content/date-and-time ·
  uxmovement.com (absolute vs relative)
- PWA: services.google.com/fh/files/misc/pwa_ux_playbook_2020.pdf · pwa-book.awwwards.com/chapter-4
- Calendar feeds: connect.me.gatech.edu/ics_helper · csusb.edu/university-calendar/subscribe ·
  kb.wisc.edu/education/154693
- Microinteractions: octet.design/journal/microinteractions-examples ·
  blog.logrocket.com/ux-design/designing-microinteractions-better-app-ux
- User menu placement and contents: wave.volue.com/UX-patterns/basic-user-interaction/user-menu ·
  sap.com/design-system/fiori-design-web (user menu) · saasui.design/blog/saas-sidebar-navigation-ux-patterns
- Theme toggles: lea.verou.me/blog/2026/dark-mode-toggles-2 · vale.rocks/micros/20260810-0330
- Settings and sessions: saasui.design/blog/saas-settings-page-ux-patterns ·
  techinterview.org (settings architecture) · ory.sh/docs/actions/revoke-active-sessions ·
  nhimg.org (sign-out-everywhere)
- Re-consent: community.auth0.com/t/ask-for-consent-from-already-existing-users/102972 ·
  docs.strivacity.com/docs/journey-consent-step · docs.nevis.net (terms management)
- Onboarding: indiehackers.com (Produktly benchmarks, 464 SaaS) · chameleon.io/blog/effective-product-tour-metrics
- Notifications: sendgrid.com/en-us/blog/stop-notification-overload · sequenzy.com/blog/email-preference-center-saas
- Command palette: robdodson.me/command-palettes
- DPA/NPC: privacy.upd.edu.ph (DPO Opinion 20-14) · our.uplb.edu.ph (UP privacy notice)
- CHED: ched.gov.ph/2017-ched-memorandum-orders · ro11.ched.gov.ph (2024 SIPP update) ·
  thelasallian.com (MOA in OJT) · bipsu.edu.ph (one MOA per HTE) · studocu/scribd copies of CMO 104 (secondary)
