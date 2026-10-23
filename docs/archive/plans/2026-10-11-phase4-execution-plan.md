# Phase 4 Execution Plan — Prioritization, Estimates, Ownership, Sprints

Date: 2026-10-11 · Companion to `2026-10-11-phase4-roadmap.md` (scope, risks, decision gates)
Method: `pm-skills:senior-pm`:

- WSJF for ordering.
- Three-point (PERT) estimates for schedule confidence.
- A RACI matrix for ownership.
- A RAG health check each week.

Expert input consulted on 2026-10-11 (summaries recorded in §6):

- Product lead (`product-skills` orchestrator): dashboard scope and the Final Technical Report.
- CISO advisor (`c-level-agents`): re-auth, exports, audit-log integrity.
- Data Protection Officer (`compliance-os`): DSAR, retention, RA 10173.
- Code architect (`feature-dev`): F/G/H fit with the codebase.

---

## 1. Priority order (WSJF)

WSJF = (user value + time criticality + risk reduction) ÷ job size. Each factor is scored 1–10, and size is a relative Fibonacci estimate.

| Workstream                                                                                           | Value | Time crit. | Risk red. | Size | WSJF     | Position                                |
| ---------------------------------------------------------------------------------------------------- | ----- | ---------- | --------- | ---- | -------- | --------------------------------------- |
| **G0 — Security foundations** (audit_logs truly append-only, re-auth "sudo mode", trusted client IP) | 6     | 8          | 10        | 2    | **12.0** | Week 1, day 1–2 (blocking per CISO)     |
| B — Report-flow gaps + Phase 4 schema migration                                                      | 9     | 8          | 6         | 3    | **7.7**  | Week 1, in parallel with A              |
| A — Server PDF generation                                                                            | 10    | 10         | 8         | 5    | **5.6**  | **Week 1 — first feature** (PM mandate) |
| E — Endorsement letter / bulk / final cover                                                          | 8     | 7          | 5         | 5    | 4.0      | Week 2                                  |
| C — Notifications                                                                                    | 6     | 6          | 4         | 5    | 3.2      | Week 2                                  |
| G — Export Center, DSAR, retention (rest of G)                                                       | 7     | 6          | 9         | 8    | 2.75     | Week 2–3                                |
| F — Role dashboards + exports                                                                        | 9     | 7          | 5         | 8    | 2.6      | Week 2–3                                |
| H — Final Technical Report (Should)                                                                  | 5     | 3          | 2         | 5    | 2.0      | Week 3 (cut 2nd)                        |
| D — AI advisory (Should, ships off)                                                                  | 4     | 2          | 2         | 8    | 1.0      | **Last** (PM mandate; cut 1st)          |

**Two deliberate deviations from pure WSJF:**

1. **A is the first feature** even though B scores higher, per the PM's instruction. The demo needs the signable PDF. B Task 1 (the schema migration) runs in parallel because almost every later workstream depends on it.
2. **G0 was pulled out of G and moved to the front.** The CISO review found that `audit_logs` is not truly append-only today: 001 enables RLS but doesn't force it, and the app connects as owner/`service_role`. Any audit evidence produced before this is fixed is untrustworthy, so it has the highest WSJF.

## 2. Three-point estimates (person-days)

| WS        | Optimistic | Most likely | Pessimistic | PERT E   | σ               |
| --------- | ---------- | ----------- | ----------- | -------- | --------------- |
| G0        | 1          | 2           | 4           | 2.2      | 0.5             |
| A         | 3          | 5           | 8           | 5.2      | 0.8             |
| B         | 2          | 3           | 5           | 3.2      | 0.5             |
| E         | 3          | 4           | 7           | 4.3      | 0.7             |
| C         | 3          | 4           | 6           | 4.2      | 0.5             |
| F         | 5          | 7           | 11          | 7.3      | 1.0             |
| G (rest)  | 4          | 6           | 9           | 6.2      | 0.8             |
| H         | 3          | 4           | 7           | 4.3      | 0.7             |
| D         | 4          | 6           | 10          | 6.3      | 1.0             |
| **Total** |            |             |             | **43.2** | **≈2.1** (√Σσ²) |

With **6 active developers at about 60% capacity** (classes and the thesis paper), that's ~3.6 effective developer-days per calendar day. Phase 4 then needs **≈12 working days (P50)**, or **≈14 days at P90** (43.2 + 1.28·2.1 ≈ 46 person-days). That fits the roadmap's ~3-week window, with **one buffer day per week** kept free for integration (the integrate-branch merges that #68–#74 showed we need).

## 3. Ownership (RACI)

Assignments follow each teammate's Phase 3 track record and GitHub handle. The adviser approved the PM doing work directly; tasks below are assigned for credit and can be swapped. **R** = Responsible (builds), **A** = Accountable (merges/approves), **C** = Consulted, **I** = Informed.

| Workstream                                  | Jay (PM, JayPing23)        | Kenneth (KennethRusselAvaricio) | Ulrich (gu457)           | Matt (AndresBonifaci0)     | Gillian (2215428-sys)               | Shantea23                   | Rhaastas               | Frencine (review) |
| ------------------------------------------- | -------------------------- | ------------------------------- | ------------------------ | -------------------------- | ----------------------------------- | --------------------------- | ---------------------- | ----------------- |
| G0 security foundations                     | **R/A**                    | C                               | I                        | I                          | I                                   | I                           | I                      | C (review)        |
| A PDF generation                            | **A**                      | **R** (service, routes)         | **R** (UI, preview)      | I                          | I                                   | C                           | I                      | C                 |
| B report-flow gaps                          | **R/A** (Task 1 migration) | C                               | **R** (form UI)          | I                          | C                                   | I                           | I                      | C                 |
| E endorsement / cover                       | A                          | **R**                           | I                        | I                          | I                                   | C                           | I                      | C                 |
| C notifications                             | A                          | C                               | I                        | I                          | I                                   | I                           | **R** (owned FR-WR-07) | C                 |
| F dashboards                                | A                          | C                               | **R** (faculty, student) | **R** (coordinator, admin) | **R** (required-hours UI, semester) | I                           | I                      | C                 |
| G Export Center / DSAR / retention          | **R/A** (re-auth, DSAR)    | C                               | I                        | I                          | I                                   | **R** (exports, CSV safety) | I                      | C                 |
| H Final Technical Report                    | A                          | I                               | I                        | **R**                      | I                                   | **R**                       | I                      | C                 |
| D AI advisory                               | **R/A**                    | C                               | I                        | I                          | I                                   | I                           | I                      | C                 |
| Adviser/DPO decisions (D1–D6, DPO items §6) | **R**                      | I                               | I                        | I                          | I                                   | I                           | I                      | I                 |

**Rules (from Phase 3 lessons):**

1. **One file owner per sprint.** `weeklyReportService.ts`, `documentService.ts`, `calendar` and `api/cron/daily` each have exactly one owner per sprint; others send changes through that owner.
2. **Overlapping PRs merge via an `integrate/*` branch** with full tsc/lint/jest/build before merging to `develop`.
3. **Frencine reviews every PR** before Jay merges. That ends the `--admin` merges for code PRs (risk R12).

## 4. Sprint calendar (3 × 1 week + buffer)

| Sprint              | Goal (shippable)                           | Workstreams                                        | Exit check                                                                                                               |
| ------------------- | ------------------------------------------ | -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| **S1 (days 1–5)**   | Trustworthy foundation + signable PDFs     | G0, B Task 1 (migration), A Tasks 1–8, B Tasks 2–4 | Audit-log tamper test fails as expected; a submitted week downloads a PDF with its reference code; pending hours visible |
| **S2 (days 6–10)**  | Letters, notifications, dashboards started | E Tasks 1–5, C Tasks 1–4, F Tasks 1–3              | Endorsement letter blocked until 9/9 and generated after; deadline reminder sent once by cron; faculty dashboard live    |
| **S3 (days 11–15)** | Feature-complete                           | F Tasks 4–6, G Tasks 1–5, H Tasks 1–4              | Export Center behind re-auth; DSAR ticket and export work; semester archive is read-only; final report submit/approve    |
| **S4 (days 16–18)** | AI (optional) + freeze                     | D Tasks 1–6 (flag off), bug fixes, demo data reset | **Feature freeze**: Phase 5 starts                                                                                       |

**Cut line, if S3 slips by more than 2 days:** cut D, then H, then F's Should items (FR-DB-06/08), then C email (keep in-app). Never cut G0, A, B, E's endorsement letter, F's Must items, or G.

## 5. Governance cadence

- **Daily (async, 5 min):** each owner posts a one-line yesterday/today/blocker update in the team chat.
- **Twice weekly (Mon/Thu, 20 min):** Jay runs a RAG check on each workstream:
  - 🟢 on plan.
  - 🟡 ≤ 2 days behind or a blocker under 24 h old.
  - 🔴 > 2 days behind, or a blocker the owner can't clear. 🔴 triggers the cut line.
- **End of sprint:** demo to the adviser (adviser-guided checkpoints per the PRD), merge to `develop`, update the vault MOC.
- **Decision deadlines:** D1–D3 by day 3 (defaults apply after). DPO items (§6) go to the adviser in S1 so they're answered before G and D ship.

## 6. Expert findings incorporated (and where)

**Security (CISO advisor)**

- `audit_logs` isn't truly append-only. **Fix in G0:**
  - Run the app as a non-owner `idsms_app` role (`NOBYPASSRLS`) with only SELECT/INSERT on `audit_logs`.
  - Add `FORCE ROW LEVEL SECURITY` and revoke UPDATE/DELETE/TRUNCATE.
  - Add a trigger that raises on UPDATE/DELETE.
  - Add a CI/manual tamper test.
  - On Supabase, stop connecting as `service_role`/`postgres`.
- Re-auth "sudo mode" goes into G0:
  - Password re-entry with a `reauthAt` timestamp **on the session row**; grants last 10 min (exports, bulk PDF) or 5 min (role changes, user deletion).
  - Failed attempts count toward lockout; email comes from the session.
  - `REAUTH_SUCCESS`/`REAUTH_FAILED` are audit-logged; enforcement is server-side.
  - TOTP MFA is deferred past Phase 4.
  - **This replaces the per-request `verifyCredentials` call in plan E Task 4**, which must use G0's `assertRecentReauth()`.
- **Spoofable client IP:** ~10 routes read `x-forwarded-for` directly. G0 adds a single `getClientIp(req)` helper: trust `CF-Connecting-IP` only behind the tunnel in Phase 5, otherwise the first hop from a trusted proxy. All routes switch to it.
- **Exports** (G and F) follow these rules:
  - Server-side scope by role.
  - Formula-injection guard on CSV and XLSX.
  - Audit row written before the file is sent (type, filters, rowCount, SHA-256).
  - Download only, never email; `Cache-Control: no-store`; in-memory only, never written to disk.
  - Hard cap at 50k rows that fails loudly; neutral file names.

**Data protection (DPO advisor, RA 10173 / NPC)**

- **DSAR:**
  - A `data_subject_requests` table with statuses SUBMITTED → VERIFIED → IN_PROGRESS → READY → DELIVERED → CLOSED, plus REJECTED/WITHDRAWN/EXPIRED; overdue is a computed flag.
  - Re-auth required to submit and to download; a signed in-app link that expires in ≤ 7 days, never emailed.
  - The export includes faculty feedback about the student and an access history.
  - It excludes other people's data, password hashes, tokens and IPs.
- **Retention (G):**
  - The 3-year clock starts at the semester `endDate`.
  - **Medical/psychological files: shorter, term end + 1 year** (DPO sign-off).
  - Flag → admin decides EXTEND / ANONYMIZE / DELETE. Files are deleted; structured records are anonymized.
  - **Legal hold** via `legalHoldUntil`/`legalHoldReason` on `student_profiles`.
- **Six Export Center cards:**
  1. Deployment roster.
  2. Hours compliance (no deviation reasons).
  3. Requirements matrix (medical items as Cleared/Not cleared only).
  4. Weekly report/evaluation status (no report text).
  5. Host-company stats (aggregate, groups under 5 suppressed).
  6. Audit log (IDs and actions only).
- **Audit rows must never contain personal data or sensitive text.** Log IDs and field names only. Reviewers should flag any `logEvent` detail carrying names, reasons or notes.
- **Needs DPO/adviser sign-off before go-live:**
  - The lawful basis for processing sensitive personal information (RA 10173 Sec. 13(b) via CHED SIPP).
  - The 1-year period for medical documents.
  - The 15-day SLA (calendar or working days).
  - Alignment with Registrar retention.
  - **A data-sharing/outsourcing agreement for Gemini (AI is a cross-border transfer).** Added to D's enable gate alongside D5.
  - A privacy notice at the collection points.
  - A PIA before Phase 5 go-live.

**Product (product lead)**

- Dashboards are **work queues, not analytics.**
  - The faculty "needs attention" signal is _reports pending my review_.
  - The coordinator's is _At risk / Non-compliant_. The At-risk rule is no report for 2+ consecutive weeks or projected completion after semester end, and it's shown on screen.
- **Semester:** Draft → Active → Archived, with exactly one Active. Archiving is blocked while students are non-final unless carry-over is chosen. Archived means server-side read-only. Reactivating is admin-only with a typed-name confirmation.
- **Final Technical Report:** structured evaluation scores plus the signed form uploaded as proof (no supervisor accounts).
  - Cut order inside H: full-report PDF compilation → per-criterion rubric → resubmission history → notifications.
  - Never cut the hours lock, the approve/return flow, or the attachments.
- **Measurable outcome for the defense:** _% of interns with complete, endorsed records by semester end_, shown on the coordinator dashboard.
