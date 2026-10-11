# Phase 4 Roadmap — Feature-Complete: Documents, Report Flow, Notifications, Dashboards, Compliance, AI

> **Re-scoped 2026-10-11 (PM decision).** Phase 4 now delivers **every remaining feature**, so
> Phase 5 is purely **hosting**: transfer to the dedicated lab server, optimization,
> hardening and UAT (`2026-10-11-phase5-lab-server-hosting.md`). The PRD's former Phase 5
> functional items (role dashboards, Export Center with MFA, DSAR, file retention, semester
> archiving) and Module 7 (Final Technical Report) move into Phase 4 as workstreams F, G and
> H. See §5, "Portability rules", which keep Phase 4 code movable to the lab server.

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

| Step | Workstream                                                                                                     | Plan                                       | Tasks |
| ---- | -------------------------------------------------------------------------------------------------------------- | ------------------------------------------ | ----- |
| 1    | **A — Server PDF generation** (weekly + monthly)                                                               | `2026-10-11-phase4-pdf-generation.md`      | 8     |
| 2    | **B — Report-flow gaps** (+ the one Phase 4 schema migration)                                                  | `2026-10-11-phase4-report-flow.md`         | 4     |
| 3    | **E — Endorsement letter, bulk letters, final report cover**                                                   | `2026-10-11-phase4-endorsement-letters.md` | 5     |
| 4    | **C — Notifications** (in-app inbox, 12 triggers, daily cron)                                                  | `2026-10-11-phase4-notifications.md`       | 4     |
| 5    | **F — Role dashboards & Excel exports** (FR-DB-01..08)                                                         | detailed plan to write next                | ~6    |
| 6    | **G — Compliance: Export Center + re-auth, DSAR, retention, audit-log check** (NFR-DP-06/07/08, NFR-SEC-05/10) | detailed plan to write next                | ~5    |
| 7    | **H — Final Technical Report (Module 7)** (FR-FT-01..03, Should)                                               | detailed plan to write next                | ~4    |
| 8    | **D — AI advisory** (last priority; ships disabled)                                                            | `2026-10-11-phase4-ai-advisory.md`         | 6     |

Dependencies:

- E needs A, plus B's Task 1 schema columns.
- C needs B's Task 1 (`notifications.read_at`).
- F needs B Task 2 (`getHoursSummary`) and reads D's cached AI flags only if D has shipped.
- G's DSAR export reuses A's PDF pipeline; its retention job runs from C's daily cron.
- H reuses E's final cover page (FR-FT-01 threshold) and A's pipeline.
- D needs C's cron route.
- A and B Tasks 2–4 are independent and can run in parallel if two people take them; F can
  start as soon as B Task 2 lands.

---

## 1. Workstreams

| #   | Workstream                                                                                                                                                                                                                                                                                                                                                                                             | PRD                               | MoSCoW                                    | Blocked by                | Plan                                          |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------- | ----------------------------------------- | ------------------------- | --------------------------------------------- |
| A   | **Server PDF generation** (weekly + monthly report PDFs, reference code, retry, Download/Regenerate)                                                                                                                                                                                                                                                                                                   | FR-DG-03/04/05/06/07, FR-WR-09/10 | Must                                      | —                         | ✅ `2026-10-11-phase4-pdf-generation.md`      |
| B   | **Report-flow gaps** (pending vs. confirmed hours, time in/out, attendance-status picker, monthly narrative)                                                                                                                                                                                                                                                                                           | FR-WR-02, adviser feedback        | Must (hours, status) / Should (rest)      | D1–D3 (defaults used)     | ✅ `2026-10-11-phase4-report-flow.md`         |
| C   | **Notification backbone** (in-app `notifications` rows, deadline reminders via one daily Vercel Cron, Resend templates beyond FR-WR-07)                                                                                                                                                                                                                                                                | FR-NT-*, FR-WR-07                 | Should                                    | D4 (email only)           | ✅ `2026-10-11-phase4-notifications.md`       |
| D   | **AI advisory** (embedding similarity via Gemini `text-embedding-004` + pgvector, sentiment via Gemini 2.5 Flash, advisory-only panel)                                                                                                                                                                                                                                                                 | FR-AI-01..06, NFR-AI-01..04       | Should (FR-AI-06 guardrail = Must)        | D5, D6 (to enable)        | ✅ `2026-10-11-phase4-ai-advisory.md`         |
| E   | **Endorsement letter + final report cover PDFs**                                                                                                                                                                                                                                                                                                                                                       | FR-DG-01/02/03                    | Must (endorsement letter)                 | A, B Task 1               | ✅ `2026-10-11-phase4-endorsement-letters.md` |
| F   | **Role dashboards & exports.** Faculty: per-student rows with progress bars, weekly status, AI flags, Bulk Endorse/Export. Coordinator: program summary cards, MOA alerts, compliance table with filters, Excel export. Super Admin: semester activate/archive, required-hours config, audit log with filter/export. Weekly Excel summary. Per-semester history retention and end-of-semester archive. | FR-DB-01..08                      | Must (FR-DB-01..05, 07) / Should (06, 08) | B Task 2                  | to write                                      |
| G   | **Compliance.** Super Admin Export Center (`/admin/export-center`, 6 bulk export cards, re-auth gate). DSAR "Request my data" with a 15-day SLA ticket and CSV/PDF export. Quarterly file-retention flagging (3 years post-semester, admin review before delete). Verify append-only `audit_logs` RLS.                                                                                                 | NFR-DP-05..08, NFR-SEC-05/07/10   | Must                                      | A, C (cron)               | to write                                      |
| H   | **Final Technical Report (Module 7):** unlocked at the FR-FT-01 threshold. Sections: company profile summary, peer/supervisor evaluation scores, proof attachments. Coordinator approve/return.                                                                                                                                                                                                        | FR-FT-01..03                      | Should (cut before F/G if late)           | E (cover page, threshold) | to write                                      |

### Order and rationale

1. **A first, starting now.** It's on the demo path (students need a PDF the company manager can sign), it has no open decision, and its pipeline (template → Puppeteer → Storage → `generated_documents`) is reused by E.
2. **B next, with D1–D3 at their defaults:** faculty-only approval, no signed-copy upload (D2, decided), current layout. If the adviser later picks a different D1/D2, only B Tasks 2 and 4 change, and they're isolated. Monthly narrative stays out until SLU's template arrives (R10).
3. **E** reuses A's pipeline and B's schema columns.
4. **C after D4 is resolved.** Email can't reach students until a sending domain is verified (R6). In-app notifications don't need D4 and can ship first.
5. **F, then G.** The PRD makes both Must-tier. They moved here from the old Phase 5 so Phase 5 can be hosting-only.
6. **H**, Module 7, is Should-tier. Cut it before F or G if time is short.
7. **D last.** It's Should-tier, gated on the golden set (NFR-AI-02), and carries the most privacy risk (R4). If time runs short, cut it first. The PRD's MoSCoW note already allows that.

**Cut order if behind schedule:** D → H → F's Should items (FR-DB-06/08) → C email (keep in-app).
Never cut A, B Task 1–2, E's endorsement letter, F's Must items, or G.

### Rough calendar (Phase 4 is now ≈3 weeks; Phase 5 hosting follows; adjust to the defense date)

| Days           | Work                                                       |
| -------------- | ---------------------------------------------------------- |
| 1–3            | A (PDF pipeline, weekly + monthly) → merged                |
| 1–3 (parallel) | Adviser meeting: D1, D2, D3, D5; start the golden set (D6) |
| 4–7            | B (report-flow gaps)                                       |
| 6–8            | E (endorsement letter on A's pipeline)                     |
| 8–10           | C (in-app first, email once D4 is done)                    |
| 9–13           | F (role dashboards and Excel exports)                      |
| 12–15          | G (Export Center, DSAR, retention, audit-log check)        |
| 14–17          | H (Final Technical Report)                                 |
| 16–21          | D behind a feature flag, enabled only if NFR-AI-02 passes  |

---

## 2. Decision gates (owner: Jay + adviser)

| ID     | Decision                                                                                                                    | Default if not decided by day 3                                                                                                                                       | Unblocks       |
| ------ | --------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------- |
| **D1** | Who makes hours "true": faculty adviser only (PRD FR-WR-06, current build), or faculty then coordinator/admin confirmation? | Faculty only (no schema change)                                                                                                                                       | B              |
| **D2** | Signed copy: upload back into IDSMS (and should the monthly gate require it?) or Google Classroom only?                     | **Decided 2026-10-11 (Jay): Google Classroom only.** Signed copies contain the supervisor's signature (sensitive), so IDSMS never accepts them. B Task 4 was removed. | B              |
| **D3** | SLU's official weekly/monthly report template and endorsement letterhead                                                    | Use the current preview layout                                                                                                                                        | A polish, B, E |
| **D4** | Resend sending domain (verified domain vs. test-only `onboarding@resend.dev`)                                               | In-app notifications only                                                                                                                                             | C (email)      |
| **D5** | Data-privacy basis for sending student report text to Gemini (RA 10173): consent notice and/or PII stripping                | AI stays disabled                                                                                                                                                     | D              |
| **D6** | Faculty adviser commits time to label a 30+ pair golden set (NFR-AI-01)                                                     | AI stays disabled                                                                                                                                                     | D              |

---

## 3. Risk register

Likelihood (L) and Impact (I): H/M/L. Ordered by exposure.

| ID                             | Risk                                                                                                                                                                               | L   | I   | Mitigation                                                                                                                                                                                                                                             | Early warning / trigger                                                          | Owner         |
| ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --- | --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------- | ------------- |
| **R1** (until Phase 5 cutover) | **Supabase free tier pauses or goes unhealthy before a demo or defense.** Happened 2026-10-10: "Healthy" on the dashboard while Postgres refused connections.                      | H   | H   | Run a pre-demo checklist the day before (login and one query); keep the dashboard restart path documented; consider a paid tier or keep-alive for the defense window; the local Supabase-in-Docker fallback (offered, not built) covers offline demos. | Timeouts on `aws-0-ap-southeast-1.pooler.supabase.com:6543`; empty postgres logs | Jay           |
| **R2**                         | **Puppeteer on Vercel: cold start, timeout, or memory failure** (the architecture review's highest-flagged operational risk).                                                      | M   | H   | FR-DG-07: 3 retries with exponential backoff, `FAILED` status plus Regenerate; route `maxDuration = 60`; generation never fails the submission; `@sparticuz/chromium` on Linux, local Chrome/Edge via `PUPPETEER_EXECUTABLE_PATH` on Windows.          | `generated_documents.status = FAILED` count > 0                                  | A implementer |
| **R3**                         | **One shared Supabase project is dev, demo, and "production"** (labelled `main PRODUCTION`): test accounts and demo data sit beside the future pilot data, and there's no staging. | H   | M   | Before the UAT pilot: run the `TEST_ACCOUNTS.md` cleanup (children first because of FKs) or create a separate pilot project; never seed against the pilot DB; Supabase branching if budget allows.                                                     | First real student account created                                               | Jay           |
| **R4**                         | **Privacy: student report text sent to Google Gemini** (RA 10173 / NFR-DP).                                                                                                        | M   | H   | D5 gate; strip names, emails, and student numbers before embedding; feature flag defaults off; AI output advisory only (FR-AI-06, Must).                                                                                                               | Any AI call made without the flag                                                | D implementer |
| **R5**                         | **Golden set never gets labelled** → NFR-AI-02 (≥80% precision / ≥70% recall) can't be shown, so AI can't be enabled.                                                              | H   | M   | Start D6 on day 1; template a 30-pair labelling sheet; accept "AI not enabled" as a valid Phase 4 outcome (Should-tier).                                                                                                                               | No labelled pairs by day 7                                                       | Jay + adviser |
| **R6**                         | **Resend can't email students:** without a verified domain, Resend only delivers to the account owner's address; free tier is 100/day and 3,000/month.                             | H   | M   | D4; ship in-app notifications first; batch the daily digest; existing code already returns `sent:false` without breaking the review action.                                                                                                            | `sendReportStatusEmail` returns `sent:false` in staging                          | C implementer |
| **R7**                         | **Parallel PRs on the same files** cause merge conflicts (happened with #68–#74).                                                                                                  | H   | M   | Publish a file-ownership map per workstream; merge overlapping PRs through an `integrate/*` branch with full tsc/lint/jest/build before merging.                                                                                                       | Two open PRs touching one service file                                           | Jay           |
| **R8**                         | **Timezone bugs (Manila vs. UTC)** keep recurring (projection bug 09-11; due-date logic 10-10).                                                                                    | M   | M   | All date math goes through `src/lib/utils/reportDeadline.ts`-style helpers with Manila tests; PDF dates render with `timeZone: "Asia/Manila"` or UTC for calendar dates, never the server default.                                                     | Any `new Date().getDay()` or `toLocaleDateString()` without a timeZone in review | Reviewers     |
| **R9**                         | **Defense deadline vs. scope.** Phase 4 + 5 = 4 weeks of PRD scope.                                                                                                                | M   | H   | MoSCoW cut order: D (AI) → C email → E final cover page → B narrative fields; keep the Must set (A, B hours/status, E endorsement letter) protected.                                                                                                   | Behind the calendar above by more than 3 days                                    | Jay           |
| **R10**                        | **Building B before D1/D2 are decided** means rework, or a schema change after data exists.                                                                                        | M   | M   | Hard gate: no B schema changes until D1/D2 are written down in the vault decision note.                                                                                                                                                                | Someone starts B early                                                           | Jay           |
| **R11**                        | **Supabase Storage free-tier 1 GB cap.** PDFs at ~50–150 KB each, plus signed scans (images up to 2 MB) per week per student.                                                      | L   | M   | One PDF row per week, overwritten on regenerate (upsert path); 5 MB/2 MB caps already enforced; NFR-DP-08 retention job (Workstream G).                                                                                                                | Storage usage > 70%                                                              | Jay           |
| **R12**                        | **Process risk: merges bypass review via `--admin`**, with a bus factor of 1 on the PM.                                                                                            | M   | M   | Ask a teammate (e.g. Frencine, who holds review duty) to approve PRs; reserve `--admin` for docs or explicit go-aheads; CI must be green before merging.                                                                                               | `--admin` used on a code PR without CI green                                     | Jay           |
| **R13**                        | **Security: the dev server shared over public Wi-Fi with a service-role key in `.env`.**                                                                                           | L   | H   | The service-role key is server-only (no `NEXT_PUBLIC_*`); only test data; stop LAN sharing after demos; rotate keys before the pilot.                                                                                                                  | Dev server left running on a public network                                      | Jay           |
| **R14**                        | **NFR-SEC-05 requires re-auth/MFA for "PDF generation" and bulk exports.**                                                                                                         | M   | L   | Interpretation: the student's own per-report PDF is part of the submit action they already authenticated for; **bulk** endorsement export (E, FR-DG-02) and the Export Center (Workstream G) get the re-auth step. Record this in the PR.              | Reviewer flags it                                                                | E implementer |
| **R16**                        | **Gemini model retirement:** Google rotates embedding models, and `text-embedding-004` could be withdrawn mid-semester.                                                            | M   | M   | Model names come from env vars (`GEMINI_EMBEDDING_MODEL`, `GEMINI_SENTIMENT_MODEL`); embed requests always ask for `outputDimensionality: 768` so a successor still fits the column; re-run the golden-set evaluation after any model change.          | Gemini 404/400 "model not found" in cron logs                                    | D implementer |
| **R17**                        | **The student name doesn't exist in the schema yet**, but FR-DG-01 needs it on the endorsement letter.                                                                             | H   | M   | B Task 1 adds nullable `student_profiles.full_name`; students set it on their Profile page; letter generation refuses with a clear message when it's missing.                                                                                          | Endorsement generation returns "full name is missing"                            | E implementer |
| **R15**                        | **pgvector and Prisma:** embeddings need a raw-SQL column and queries (`$queryRaw`); 768-dimension vectors; index tuning.                                                          | M   | L   | Raw migration in `prisma/migrations_manual/`; isolate behind the `aiService` adapter (NFR-MNT-05); tests mock the adapter.                                                                                                                             | —                                                                                | D implementer |

---

## 4. Definition of done for Phase 4

- **A:** a submitted weekly report and a submitted monthly report each have a `GENERATED` PDF with the reference code, downloadable by the student and their faculty; failures show Regenerate; 3 retries with backoff are tested.
- **B:** delivered per the D1/D2 outcomes; pending vs. confirmed hours visible on dashboard and Attendance.
- **C:** in-app notifications for review outcomes and Tuesday deadlines; email live if D4 is done.
- **D:** shipped behind a flag, enabled only with the NFR-AI-02 report attached to the PR; otherwise documented as deferred.
- **E:** endorsement letter PDF gated by FR-CK-04 (all 9 checklist items approved).
- **F:** all four role dashboards show their FR-DB-02..05 fields; coordinator and faculty Excel exports download; semester archive/activate works on a test semester.
- **G:** Export Center reachable only by Super Admin after re-auth; a DSAR request creates an audit-logged ticket and notifies the Super Admin; the retention job flags (never deletes) files older than 3 years; an UPDATE or DELETE on `audit_logs` is shown to fail.
- **H:** a student over the FR-FT-01 threshold can submit the final report; the coordinator can approve or return it (or H is documented as deferred if cut).
- **Feature freeze:** after Phase 4, Phase 5 adds no product features, only hosting, performance, hardening and UAT fixes.
- tsc, lint, jest, build and CI green on every merge; the vault MOC updated after each workstream merges.

---

## 5. Portability rules (so Phase 5 can move to the lab server cleanly)

Phase 5 moves the app off Vercel and Supabase onto one dedicated lab computer (Docker:
Postgres + pgvector, MinIO, the Next.js app and Caddy; see PR #50). Every Phase 4 change must
follow these rules so the move is configuration, not a rewrite:

1. **Storage only through `src/lib/storage.ts`.** No other file may import
   `@supabase/supabase-js` or call Supabase Storage. PR #50 swaps that one module to S3/MinIO.
   A's `uploadPdfBuffer` and G's exports go through it too.
2. **Signed downloads go through our own routes** (e.g. `/api/weekly-reports/[id]/pdf`
   redirecting to `getSignedUrl`). Pages never embed raw storage URLs, so PR #50's app-proxied
   download route can replace the redirect target without touching the UI.
3. **Scheduled work stays an HTTP route** (`/api/cron/daily` with `CRON_SECRET`). `vercel.json`
   is just one trigger; on the lab server a host cron job or a small `cron` container calls the
   same URL. No Vercel-only scheduling APIs.
4. **Headless Chrome is found via `PUPPETEER_EXECUTABLE_PATH`.** On the lab server the Docker
   image installs Chromium and sets this variable; `@sparticuz/chromium` is the Vercel
   fallback only.
5. **Database access only through Prisma or `$queryRaw` with plain SQL.** No Supabase-only
   features (PostgREST, Realtime, Supabase Auth, Edge Functions). pgvector works the same in
   the `pgvector/pgvector` image.
6. **Every new env var goes into `.env.example`** with a comment, so the lab server's
   `.env.production` can be filled from one list.
7. **External internet is optional at runtime.** Resend (email) and Gemini (AI) already
   degrade gracefully when keys are missing. Keep it that way, because the lab network may
   restrict outbound traffic.
