# UI and next steps: the plan to finish Phase 4 without re-editing

_25 October 2026. Written at the end of a long UI session so the next sessions build once, in order, against decisions that are already settled. Jay (PM) made every call recorded here._

## 1. Goal

Close Phase 4: finish the UI polish, build the 3D landing page, fix the measured slow page and the zod advisory, then build the AI assist plan, and only then sync `main` with `develop` (Jay's rule: `main` moves only when a phase is done).

## 2. Locked decisions (do not reopen without Jay)

### The dashboard background: the painted coast (PR #146, merged `846c1f6`)

Code: `src/components/coast-scene.tsx` (scene, generators, header comment) and `src/components/coast-scene.css` (tokens per theme, motion). Mounted once in `src/app/(dashboard)/layout.tsx`.

| Rule                                                                                                                                                                                             | Why                                                                                                                                                                                      |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **2.5D layered illustration** (Firewatch / Alto's Adventure), not WebGL                                                                                                                          | Cards cover ~80% of the background; a daily-use app must not run a GPU loop all day. 3D lives on the landing page only.                                                                  |
| **Day = clear spring afternoon in the app's blues; night = navy-to-teal sky, stars, crescent moon**                                                                                              | Jay: a sunset "does not match the colour palette… too jarring".                                                                                                                          |
| **One light line, `LIGHT_X = 700`**: sun high by day, moon in the same place by night                                                                                                            | Jay: the light "must make sense". Reflection path, horizon glow, lit mountain faces, pine lit halves and the cliff's lit rim all follow it. Anything new that is lit must use `LIGHT_X`. |
| **Depth by layers**: 5 ranges fading into mist, snow on far peaks, treelines, low-poly rock headland, two-tone pines                                                                             | Jay rejected flat, "pasted on" layers, strata lines and cartoon cumulus.                                                                                                                 |
| **Clouds are soft blurred vapour** (`cloud()` + `feGaussianBlur`), light and semi-transparent, no clipped base                                                                                   | Jay: "realistic… not too fakey".                                                                                                                                                         |
| **The beam**: a long soft SVG wedge with a bright core, scaled 1 → 0 → −1 (side view of a turning lens), with a round bloom that flares when it faces the viewer                                 | Jay: "far more reaching… more circular".                                                                                                                                                 |
| **Speed**: one static SVG painted once; only transform/opacity animate (clouds, 3 wave bands, glints, birds, twinkle, beam, bloom); seeded generators (server = client); reduced motion stops it | Keeps the dashboard as fast as before the scene.                                                                                                                                         |
| **Text over the scene sits on glass** (cards, header band, footer since `c0c01d1`)                                                                                                               | Jay: the footer was unreadable in light mode. Any new free-standing text over the scene gets a glass surface.                                                                            |

### Brand and system (from earlier sessions, still binding)

- Accent ladder on BEACON navy `#1f4e79`; logo green `#2f6b4f` = done; DM Sans; colourful + glass + bento (Jay overrides the taste skill's no-gradient rule; keep 4.5:1 contrast).
- Rejected and closed: the 3D WebGL dashboard background, the sunset palette, Scroll World (paid per clip; see §3.C for the free route), Open Design (552 skills would crowd skill selection), React Bits / Canvas UI (component libraries, would add weight for no screen that needs them).

## 3. Work queue, in order

Each item is one branch and one PR into `develop`; merge only on Jay's OK, after CI passes.

### A. UI audit fixes (small; from the 25 Oct Impeccable + taste audit, 15/20)

1. **Zeros in grey**: tiles showing 0 (Submission streak, Not yet submitted, Validated, Rejected) use the neutral tile, not a status tint. Files: `src/app/(dashboard)/page.tsx`, `src/app/(dashboard)/_components/faculty-dashboard.tsx`, the attendance summary tiles.
2. **Numbers right-aligned, tabular**: the adviser's Interns table (Hours, Docs, Deductions).
3. **Calendar labels**: "Weekly report due — week of Sep 28", not ISO; `src/lib/services/calendar/calendarService.ts:111` plus its tests (`calendarService.test.ts`, `coordinatorCalendar.test.ts`).
4. **Loading screens carry the page title** (the `/companies` skeleton has no h1); check every `loading.tsx`.
5. **No blank bands in cards**: "Where interns stand" (109px), "Hours completed" (74px); cards in one row end level.
6. **The Excuse button keeps its place** after a declined dispute (`conduct-card.tsx`).

- _Done when_: the taste inspector shows no `numeric-align`, `panel-void`, `ragged-row` or `no-title` on those screens (gradient/glow FAILs are accepted, see §2), and Jest + tsc + lint pass.

### B. Coast scene follow-ups (verify, don't redesign)

1. Look at 390px (phone) and a tall/narrow window; the frame crops from the left by design.
2. The foam path at the cliff foot shows as a blob at the frame's bottom edge on short windows; clip or move it.
3. On short wide windows (1536×679) the lighthouse sits behind the right-hand cards. Accepted for now; revisit only if Jay asks.

- _Done when_: screenshots at 1440, 768 and 390 in both themes, no horizontal scroll, reduced motion shows a still scene.

### C. The 3D landing page (Apple / Rolex style)

- **Where**: `/about` (decided 25 Oct: a clear public address that leaves the sign-in redirects alone); the dashboard stays 2.5D.
- **Start from** branch `feat/beacon-cliff` (commit `4a8e14f`): the Three.js lighthouse, cliff height field, sea with foam and turning volumetric beams.
- **Technique**: GSAP ScrollTrigger drives the camera around the lighthouse as the page scrolls (Apple's product-turn), each stop telling one step of the internship (checklist, weekly reports, hours, final report). Real-time 3D, so **free**: no Higgsfield/Monid video.
- **Rules**: Three.js only on this page, loaded after first paint; render only while on screen; a still poster image for phones, weak devices and reduced motion; Hallmark guides the page design; copy follows the taste skill's page run (claims with proof, two-line headlines).
- _Open_: the route, and whether signed-out visitors land on it or on `/login` (see §4).

### D. Speed: the adviser dashboard

- Measured 25 Oct in dev: first byte 0.7 s, full page 6.2 s, so one streamed section holds the page ~5.5 s. Profile with a production build first, find the slow query, fix it in the service.
- Then the query-count tests (1 intern against 50) from `docs/plans/performance-and-scale-plan.md`.
- No Redis, settings cache or `staleTimes`: rejected with reasons in that plan.

### E. Security: zod advisory

- `npm audit`: high severity in `zod` (memory exhaustion on oversized input), also via `puppeteer-core` → `chromium-bidi`. Upgrade zod, run the full suite, check the API routes' error mapping (`src/lib/utils/apiError.ts` catches `ZodError`).

### F. AI assist build (done: PRs #155, #157)

- Follow `docs/plans/ai-assist-plan.md` §14 build order; its open questions (§13: lab machine, DPO, model licence, golden set) are still Jay's / SLU's.

### G. Close Phase 4 (done 26 Oct)

- Beta live at https://idsms-beta.vercel.app (PRs #156, #158: Vercel config, Gmail SMTP); Jay called Phase 4 finished and `main` was synced with `develop`.
- Next: the SLU template gaps in `docs/plans/slu-template-alignment.md` (outside this archive), then Phase 5.

## 4. Open decisions for Jay

1. ~~Landing page route~~: decided, `/about`. Its sections are still open (C).
2. ~~Coast behind login and legal~~: decided yes, done in PR #148.
3. Order of D/E vs. C if the deadline tightens (lean: E then D before C; both are small and protect real users).

## 5. Skills to use

- UI fixes and checks: `impeccable` (audit, polish, craft floor), `design-taste-frontend` (`inspect.mjs --app`), `emil-design-eng`, `break-ui`, `mobile-native`, `a11y-audit`.
- Landing page: `hallmark`, `impeccable` overdrive, `gsap-scrolltrigger`, `gsap-react`, `gsap-performance`, `animate`, `design-taste-frontend` (page run).
- Speed: `vercel:performance-optimizer` agent or `engineering-advanced-skills:performance-profiler`; `supabase-postgres-best-practices`.
- Reviews before each PR: `feature-dev:code-reviewer` agent.

## 6. Working setup that proved reliable

- Live checks: the user's Chrome (browser "JAYPING") at `http://localhost:3000`, signed in as the seeded test accounts (`student.test@idsms.local`, `faculty.test@idsms.local`; password in the seed files). A cookie proxy on another origin breaks hydration (Next 16 dev blocks cross-origin chunks); it is fine only for the headless taste inspector's static screenshots.
- To see the scene alone, hide the content: `.group\/shell > *:not(.coast-scene){visibility:hidden}`.
- Auto mode's server-side safety check failed repeatedly on 25 Oct; accept-edits mode worked.

## 7. Artifacts

- PRs merged 25 Oct: #144 (live-test UI fixes), #145 (company view, migration 019 applied to dev DB), #146 (living beacon coast).
- Branch kept: `feat/beacon-cliff` (3D landing-page start, `4a8e14f`, pushed to origin).
- Audit screenshots: `.taste-skill/audit/` (not committed).
- Plans: `docs/plans/ai-assist-plan.md`, `docs/plans/performance-and-scale-plan.md`.
