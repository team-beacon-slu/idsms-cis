# Phase 4 Roadmap — AI, Document Generation, Notifications + Report-Flow Gaps

Date: 2026-10-11 · Base: `develop` @ `c724a5e` (Phase 3 complete, 0 open issues, 323 tests)
Spec: `PRD.md` §"Phase 4: AI Integration, Document Generation & Notifications" (lines 635–649),
Modules 8 (FR-DG-_), 9 (FR-AI-_), 11 (FR-NT-*), plus the adviser's report-flow gaps recorded in
the vault MOC (`C:\Vault\JayParagon\Efforts\idsms-cis\idsms-cis-moc.md`).

This is the **umbrella plan**. Phase 4 holds five independent workstreams. Per the
writing-plans scope check, each gets its own executable TDD plan, and this document fixes their
order, decision gates, and risks. **All five are written out in full** (2026-10-11). On the PM's
instruction, the PDF generator runs first, AI runs last, and D1–D3 use their defaults so B and E
aren't blocked.

**Execution order:**

| Step | Workstream                                                    | Plan                                       | Tasks |
| ---- | ------------------------------------------------------------- | ------------------------------------------ | ----- |
| 1    | **A — Server PDF generation** (weekly + monthly)              | `2026-10-11-phase4-pdf-generation.md`      | 8     |
| 2    | **B — Report-flow gaps** (+ the one Phase 4 schema migration) | `2026-10-11-phase4-report-flow.md`         | 4     |
| 3    | **E — Endorsement letter, bulk letters, final report cover**  | `2026-10-11-phase4-endorsement-letters.md` | 5     |
| 4    | **C — Notifications** (in-app inbox, 12 triggers, daily cron) | `2026-10-11-phase4-notifications.md`       | 4     |
| 5    | **D — AI advisory** (last priority; ships disabled)           | `2026-10-11-phase4-ai-advisory.md`         | 6     |

Dependencies:

- E needs A, plus B's Task 1 schema columns.
- C needs B's Task 1 (`notifications.read_at`).
- D needs C's cron route.
- A and B Tasks 2–4 are independent and can run in parallel if two people take them.

---

## 1. Workstreams

| #   | Workstream                                                                                                                              | PRD                               | MoSCoW                               | Blocked by            | Plan                                          |
| --- | --------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------- | ------------------------------------ | --------------------- | --------------------------------------------- |
| A   | **Server PDF generation** (weekly + monthly report PDFs, reference code, retry, Download/Regenerate)                                    | FR-DG-03/04/05/06/07, FR-WR-09/10 | Must                                 | —                     | ✅ `2026-10-11-phase4-pdf-generation.md`      |
| B   | **Report-flow gaps** (pending vs. confirmed hours, signed-copy upload, time in/out, attendance-status picker, monthly narrative)        | FR-WR-02, adviser feedback        | Must (hours, status) / Should (rest) | D1–D3 (defaults used) | ✅ `2026-10-11-phase4-report-flow.md`         |
| C   | **Notification backbone** (in-app `notifications` rows, deadline reminders via one daily Vercel Cron, Resend templates beyond FR-WR-07) | FR-NT-*, FR-WR-07                 | Should                               | D4 (email only)       | ✅ `2026-10-11-phase4-notifications.md`       |
| D   | **AI advisory** (embedding similarity via Gemini `text-embedding-004` + pgvector, sentiment via Gemini 2.5 Flash, advisory-only panel)  | FR-AI-01..06, NFR-AI-01..04       | Should (FR-AI-06 guardrail = Must)   | D5, D6 (to enable)    | ✅ `2026-10-11-phase4-ai-advisory.md`         |
| E   | **Endorsement letter + final report cover PDFs**                                                                                        | FR-DG-01/02/03                    | Must (endorsement letter)            | A, B Task 1           | ✅ `2026-10-11-phase4-endorsement-letters.md` |

### Order and rationale

1. **A first, starting now.** It's on the demo path (students need a PDF the company manager can sign), it has no open decision, and its pipeline (template → Puppeteer → Storage → `generated_documents`) is reused by E and by B's signed-copy flow.
2. **B next, with D1–D3 at their defaults:** faculty-only approval, optional signed copy, current layout. If the adviser later picks a different D1/D2, only B Tasks 2 and 4 change, and they're isolated. Monthly narrative stays out until SLU's template arrives (R10).
3. **E** reuses A's pipeline and B's schema columns.
4. **C after D4 is resolved.** Email can't reach students until a sending domain is verified (R6). In-app notifications don't need D4 and can ship first.
5. **D last.** It's Should-tier, gated on the golden set (NFR-AI-02), and carries the most privacy risk (R4). If time runs short, cut it first. The PRD's MoSCoW note already allows that.

### Rough calendar (≈2 weeks per PRD; adjust to the defense date)

| Days           | Work                                                       |
| -------------- | ---------------------------------------------------------- |
| 1–3            | A (PDF pipeline, weekly + monthly) → merged                |
| 1–3 (parallel) | Adviser meeting: D1, D2, D3, D5; start the golden set (D6) |
| 4–7            | B (report-flow gaps)                                       |
| 6–8            | E (endorsement letter on A's pipeline)                     |
| 8–10           | C (in-app first, email once D4 is done)                    |
| 10–14          | D behind a feature flag, enabled only if NFR-AI-02 passes  |

---

## 2. Decision gates (owner: Jay + adviser)

| ID     | Decision                                                                                                                    | Default if not decided by day 3 | Unblocks       |
| ------ | --------------------------------------------------------------------------------------------------------------------------- | ------------------------------- | -------------- |
| **D1** | Who makes hours "true": faculty adviser only (PRD FR-WR-06, current build), or faculty then coordinator/admin confirmation? | Faculty only (no schema change) | B              |
| **D2** | Signed copy: upload back into IDSMS (and should the monthly gate require it?) or Google Classroom only?                     | Optional upload, not a gate     | B              |
| **D3** | SLU's official weekly/monthly report template and endorsement letterhead                                                    | Use the current preview layout  | A polish, B, E |
| **D4** | Resend sending domain (verified domain vs. test-only `onboarding@resend.dev`)                                               | In-app notifications only       | C (email)      |
| **D5** | Data-privacy basis for sending student report text to Gemini (RA 10173): consent notice and/or PII stripping                | AI stays disabled               | D              |
| **D6** | Faculty adviser commits time to label a 30+ pair golden set (NFR-AI-01)                                                     | AI stays disabled               | D              |

---

## 3. Risk register

Likelihood (L) and Impact (I): H/M/L. Ordered by exposure.

| ID      | Risk                                                                                                                                                                               | L   | I   | Mitigation                                                                                                                                                                                                                                             | Early warning / trigger                                                          | Owner         |
| ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --- | --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------- | ------------- |
| **R1**  | **Supabase free tier pauses or goes unhealthy before a demo or defense.** Happened 2026-10-10: "Healthy" on the dashboard while Postgres refused connections.                      | H   | H   | Run a pre-demo checklist the day before (login and one query); keep the dashboard restart path documented; consider a paid tier or keep-alive for the defense window; the local Supabase-in-Docker fallback (offered, not built) covers offline demos. | Timeouts on `aws-0-ap-southeast-1.pooler.supabase.com:6543`; empty postgres logs | Jay           |
| **R2**  | **Puppeteer on Vercel: cold start, timeout, or memory failure** (the architecture review's highest-flagged operational risk).                                                      | M   | H   | FR-DG-07: 3 retries with exponential backoff, `FAILED` status plus Regenerate; route `maxDuration = 60`; generation never fails the submission; `@sparticuz/chromium` on Linux, local Chrome/Edge via `PUPPETEER_EXECUTABLE_PATH` on Windows.          | `generated_documents.status = FAILED` count > 0                                  | A implementer |
| **R3**  | **One shared Supabase project is dev, demo, and "production"** (labelled `main PRODUCTION`): test accounts and demo data sit beside the future pilot data, and there's no staging. | H   | M   | Before the UAT pilot: run the `TEST_ACCOUNTS.md` cleanup (children first because of FKs) or create a separate pilot project; never seed against the pilot DB; Supabase branching if budget allows.                                                     | First real student account created                                               | Jay           |
| **R4**  | **Privacy: student report text sent to Google Gemini** (RA 10173 / NFR-DP).                                                                                                        | M   | H   | D5 gate; strip names, emails, and student numbers before embedding; feature flag defaults off; AI output advisory only (FR-AI-06, Must).                                                                                                               | Any AI call made without the flag                                                | D implementer |
| **R5**  | **Golden set never gets labelled** → NFR-AI-02 (≥80% precision / ≥70% recall) can't be shown, so AI can't be enabled.                                                              | H   | M   | Start D6 on day 1; template a 30-pair labelling sheet; accept "AI not enabled" as a valid Phase 4 outcome (Should-tier).                                                                                                                               | No labelled pairs by day 7                                                       | Jay + adviser |
| **R6**  | **Resend can't email students:** without a verified domain, Resend only delivers to the account owner's address; free tier is 100/day and 3,000/month.                             | H   | M   | D4; ship in-app notifications first; batch the daily digest; existing code already returns `sent:false` without breaking the review action.                                                                                                            | `sendReportStatusEmail` returns `sent:false` in staging                          | C implementer |
| **R7**  | **Parallel PRs on the same files** cause merge conflicts (happened with #68–#74).                                                                                                  | H   | M   | Publish a file-ownership map per workstream; merge overlapping PRs through an `integrate/*` branch with full tsc/lint/jest/build before merging.                                                                                                       | Two open PRs touching one service file                                           | Jay           |
| **R8**  | **Timezone bugs (Manila vs. UTC)** keep recurring (projection bug 09-11; due-date logic 10-10).                                                                                    | M   | M   | All date math goes through `src/lib/utils/reportDeadline.ts`-style helpers with Manila tests; PDF dates render with `timeZone: "Asia/Manila"` or UTC for calendar dates, never the server default.                                                     | Any `new Date().getDay()` or `toLocaleDateString()` without a timeZone in review | Reviewers     |
| **R9**  | **Defense deadline vs. scope.** Phase 4 + 5 = 4 weeks of PRD scope.                                                                                                                | M   | H   | MoSCoW cut order: D (AI) → C email → E final cover page → B narrative fields; keep the Must set (A, B hours/status, E endorsement letter) protected.                                                                                                   | Behind the calendar above by more than 3 days                                    | Jay           |
| **R10** | **Building B before D1/D2 are decided** means rework, or a schema change after data exists.                                                                                        | M   | M   | Hard gate: no B schema changes until D1/D2 are written down in the vault decision note.                                                                                                                                                                | Someone starts B early                                                           | Jay           |
| **R11** | **Supabase Storage free-tier 1 GB cap.** PDFs at ~50–150 KB each, plus signed scans (images up to 2 MB) per week per student.                                                      | L   | M   | One PDF row per week, overwritten on regenerate (upsert path); 5 MB/2 MB caps already enforced; NFR-DP-08 retention job in Phase 5.                                                                                                                    | Storage usage > 70%                                                              | Jay           |
| **R12** | **Process risk: merges bypass review via `--admin`**, with a bus factor of 1 on the PM.                                                                                            | M   | M   | Ask a teammate (e.g. Frencine, who holds review duty) to approve PRs; reserve `--admin` for docs or explicit go-aheads; CI must be green before merging.                                                                                               | `--admin` used on a code PR without CI green                                     | Jay           |
| **R13** | **Security: the dev server shared over public Wi-Fi with a service-role key in `.env`.**                                                                                           | L   | H   | The service-role key is server-only (no `NEXT_PUBLIC_*`); only test data; stop LAN sharing after demos; rotate keys before the pilot.                                                                                                                  | Dev server left running on a public network                                      | Jay           |
| **R14** | **NFR-SEC-05 requires re-auth/MFA for "PDF generation" and bulk exports.**                                                                                                         | M   | L   | Interpretation: the student's own per-report PDF is part of the submit action they already authenticated for; **bulk** endorsement export (E, FR-DG-02) and the Export Center (Phase 5) get the re-auth step. Record this in the PR.                   | Reviewer flags it                                                                | E implementer |
| **R16** | **Gemini model retirement:** Google rotates embedding models, and `text-embedding-004` could be withdrawn mid-semester.                                                            | M   | M   | Model names come from env vars (`GEMINI_EMBEDDING_MODEL`, `GEMINI_SENTIMENT_MODEL`); embed requests always ask for `outputDimensionality: 768` so a successor still fits the column; re-run the golden-set evaluation after any model change.          | Gemini 404/400 "model not found" in cron logs                                    | D implementer |
| **R17** | **The student name doesn't exist in the schema yet**, but FR-DG-01 needs it on the endorsement letter.                                                                             | H   | M   | B Task 1 adds nullable `student_profiles.full_name`; students set it on their Profile page; letter generation refuses with a clear message when it's missing.                                                                                          | Endorsement generation returns "full name is missing"                            | E implementer |
| **R15** | **pgvector and Prisma:** embeddings need a raw-SQL column and queries (`$queryRaw`); 768-dimension vectors; index tuning.                                                          | M   | L   | Raw migration in `prisma/migrations_manual/`; isolate behind the `aiService` adapter (NFR-MNT-05); tests mock the adapter.                                                                                                                             | —                                                                                | D implementer |

---

## 4. Definition of done for Phase 4

- **A:** a submitted weekly report and a submitted monthly report each have a `GENERATED` PDF with the reference code, downloadable by the student and their faculty; failures show Regenerate; 3 retries with backoff are tested.
- **B:** delivered per the D1/D2 outcomes; pending vs. confirmed hours visible on dashboard and Attendance.
- **C:** in-app notifications for review outcomes and Tuesday deadlines; email live if D4 is done.
- **D:** shipped behind a flag, enabled only with the NFR-AI-02 report attached to the PR; otherwise documented as deferred.
- **E:** endorsement letter PDF gated by FR-CK-04 (all 9 checklist items approved).
- tsc, lint, jest, build and CI green on every merge; the vault MOC updated after each workstream merges.
