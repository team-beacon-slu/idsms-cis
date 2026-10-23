# Plan: a fast IDSMS that survives accidents and 2,000 interns

_23 October 2026. Status: **Phase 0 done (see its results); Phases 1–4 proposed**. Revised after an LLM council review (five independent reviewers plus anonymous peer review). The first draft was a speed plan; the council's main finding was that **the accident we cannot undo, losing interns' data, was not covered at all**. This version puts data safety first, then measurement, then speed._

## 1. What we measured

On the production build, against the Supabase dev database (Singapore), from the dev PC in the Philippines:

| Page              | Median TTFB | Worst  | Database queries per load |
| ----------------- | ----------- | ------ | ------------------------- |
| Sign-in (static)  | 0.01 s      | 0.08 s | 0                         |
| `/api/health`     | 0.08 s      | 0.12 s | 1                         |
| Student home      | 0.51 s      | 4.23 s | **28**                    |
| Faculty home      | 0.96 s      | 3.19 s | **25**                    |
| Coordinator home  | 0.52 s      | 1.50 s | **17**                    |
| Coordinator users | 0.65 s      | 4.80 s | 12                        |

Round-trip costs:

- one query round trip: about **60 ms**;
- a new database connection: about **460 ms** (this causes the 3–5 s spikes).

Every request runs 2–3 session/user queries, and pages re-read the same settings.

**Caveat (council):** these numbers come from a PC in the Philippines. In production the app talks to the database server to server, so the real cost depends on where the app runs. Phase 0 checks this first, before any tuning.

## 2. The real requirements

- **No intern ever loses a submitted report** (backups, restore, safe deploys).
- **No intern is penalised because the system failed** near the 11:59 PM Tuesday deadline (a deadline policy plus the server's receive time).
- **Pages stay fast at the real peak:** p95 TTFB ≤ 800 ms (PRD) during a 10–15-minute deadline burst. That's roughly 300 active students out of 2,000, counted with autosave included.

## Decisions (23 October 2026, Jay)

- **Hosting:** production will move to the **lab PC or a school server**. Until then it stays on **Supabase (free plan)**. Optimise now in ways that carry over unchanged to the lab PC.
- **Deadlines are hard.** There is no automatic extension if the site has an outage, so Phase 4's "extend deadline" switch and the outage rule are dropped. Submissions still keep the server's receive time.
- **Database timeouts:** approved (Phase 0, step 2).

## 3. Hosting decision (make it in Phase 0, with an owner and a date)

**Council recommendation (unanimous among reviewers):** run production on **Vercel (Singapore, `sin1`) + Supabase Pro**, and keep the Docker stack in `deploy/` as the **tested restore target**, not as a second live host.

**Why:**

- An 8-person team graduates.
- A single lab PC with an untested failover is fragile: one disk, routine brownouts, nobody on call.
- Managed backups, point-in-time restore and instant rollback are worth a small monthly cost.

**Costs to confirm:** Supabase Pro is about USD 25/month. Vercel's free Hobby plan is for non-commercial use, so check whether a university project qualifies or needs Pro.

If the department insists on the lab PC as production, Phase 1 also needs:

- a UPS with automatic safe shutdown;
- nightly off-machine backups;
- tagged images for rollback;
- a named owner who keeps it running after the team graduates.

## 4. The revised plan

### Phase 0: today, under 2 hours

1. **Checked 23 October 2026: IDSMS is not deployed on Vercel.** The account `jayping23` has no IDSMS project, and GitHub records no deployments; it only runs locally. So there is no US region to fix, and the measured ~60 ms per round trip is what users get today. **The first step is choosing where production runs (section 3).** If that is Vercel, create the project with `"regions": ["sin1"]` in `vercel.json` from the start, beside the Singapore database, then re-measure.
2. Set safety limits on the app's database role:
   - `statement_timeout = '15s'` (done; 8 s was proposed, 15 s leaves room for exports and manual migrations)
   - `idle_in_transaction_session_timeout = '30s'`
     One slow query then cannot hold a request or a connection forever.
3. Set the Prisma `pg` pool to `max: 1` per instance on Vercel, so serverless instances cannot exhaust the pooler. On a single long-running server, 10–20 is right instead.
4. Add a free uptime monitor (e.g. UptimeRobot) on `/api/health`, alerting the team chat.
5. Write down three decisions:
   - the hosting choice (section 3);
   - an owner and a date for every phase;
   - ~~the deadline-outage rule~~: decided, deadlines are hard (Decisions).

**Phase 0 results (23 October 2026, same pages, same machine, three rounds with 75 s pauses)**

Done in this phase:

- **Role timeouts** (migration `016_role_timeouts.sql`, applied to the dev database): `statement_timeout = 15s`, `idle_in_transaction_session_timeout = 30s`.
- **Connection pool:** idle connections are kept 5 minutes with TCP keep-alive. The `pg` default closed them after 10 s, so after any pause the next click paid a ~460 ms reconnect. The pool is sized by `PG_POOL_MAX` (default 10).
- **Session read once per request:** the consent version and display name now come with the session, removing one query on every page.

| Page                   | Before (median) | After                                                                                                |
| ---------------------- | --------------- | ---------------------------------------------------------------------------------------------------- |
| Student weekly reports | 0.44 s          | 0.17–0.19 s                                                                                          |
| Student attendance     | 0.48 s          | 0.17–0.18 s                                                                                          |
| Faculty home           | 0.96 s          | 0.13–0.17 s                                                                                          |
| Faculty My students    | 0.63 s          | 0.11–0.14 s                                                                                          |
| Coordinator home       | 0.52 s          | 0.12–0.15 s                                                                                          |
| Coordinator users      | 0.65 s          | 0.12–0.16 s                                                                                          |
| Student home           | 0.51 s          | 0.18 s warm; 0.5–2.6 s on the first visit after a pause (27 queries, so it's Phase 3's first target) |

A direct test of the pooler showed no dropped connections after 15, 45, 90 or 180 s idle, and the 24-request soak logged no errors.

One `Connection terminated unexpectedly` happened once, in an earlier run. It was not reproduced; Phase 4 should make a failed session read show "try again" rather than the sign-in page.

**Student home follow-up (24 October 2026):** the home page's reads now run in parallel instead of one after another, and rendered hours are computed once per page instead of twice (a shared `requestCache` helper in `src/lib/utils/requestCache.ts`). 24 queries instead of 27; the first visit after a 40 s pause now takes 0.16–0.44 s instead of 0.5–2.6 s.

**Skipped:** the uptime monitor (no public URL until hosting), and the Vercel region (IDSMS is not on Vercel).

### Phase 1: no data loss

1. **Leave the free plan.** It pauses after about a week of inactivity (semester breaks), and it may have no daily backups or point-in-time restore; confirm in the Supabase dashboard. It also has a 500 MB database cap and a low connection cap.
2. **Encrypted nightly backups, kept away from the server:**
   - a `pg_dump` of the database plus a copy of the stored files, kept for a set period (e.g. 30 days);
   - stored only where the Data Privacy Act (RA 10173) and SLU policy allow;
   - access limited to named people.
3. **Keep the secrets safe and separate:** `NEXTAUTH_SECRET`, the storage keys and the env files. Without them, a restored backup cannot be used.
4. **One timed restore drill:** restore last night's backup into the Docker stack, sign in, open a report, and record how long it took.
5. **Safe deploys:**
   - database changes are additive first (add the new column, switch the code, remove the old one in a later release);
   - every deploy is tagged so it can be rolled back;
   - a backup is taken just before each deploy;
   - the rollback steps are written down.
6. **A breach plan:** if a backup is lost or leaked, who tells the National Privacy Commission within 72 hours.

### Phase 2: measure where it matters

1. Re-measure page timings from the production region.
2. A k6 load test against a **staging copy**, never production:
   - a realistic deadline burst: 300 students over 10–15 minutes, autosave included;
   - a morning login rush;
   - 30 PDF downloads at once.
3. Record p50/p95, errors and connection use as the baseline.

### Phase 3: speed, only where Phase 2 shows a problem

| Fix                                                                                                                                     | Note from the council                                                                                                                                                                                                                                                     |
| --------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Look up the session, user, consent and settings **once per request** (React `cache()`), and read the session with its user in one query | Removes 5–10 queries per page; keeps database sessions, so force-logout keeps working                                                                                                                                                                                     |
| Fewer, bigger queries on the three home pages (grouped/aggregate, run in parallel)                                                      | Home pages go from 17–28 queries to about 6–8                                                                                                                                                                                                                             |
| Cache rarely changing settings                                                                                                          | **Not in each process's memory.** With several instances, an in-memory cache keeps stale required hours in the processes that missed the update. Use Next's shared cache on Vercel; on self-hosting, use a short time-based expiry or a version number stored in Postgres |
| **Generate PDFs once, when a report is submitted or approved**, then serve the stored file                                              | Downloads stop launching Chromium, so PDF spikes stop mattering. A queue is only needed for generation, and its limit must live in Postgres (an advisory lock), not in one process's memory                                                                               |
| Rate limits on exports, bulk letters and PDF generation                                                                                 | Counters in Postgres, so they hold across instances                                                                                                                                                                                                                       |
| Indexes from real data (`pg_stat_statements`, `EXPLAIN ANALYZE`)                                                                        | Only for queries Phase 2 shows are slow                                                                                                                                                                                                                                   |
| Stream slow panels with `<Suspense>`; lighter client JavaScript                                                                         | Faster-feeling pages                                                                                                                                                                                                                                                      |

### Phase 4: fail gracefully

1. **Submissions keep the server's receive time.** The browser's clock is never trusted, because students could change it.
2. ~~A coordinator switch to extend a deadline~~: dropped, deadlines are hard (Decisions).
3. **A clear "temporarily unavailable, your draft is safe" page** when the database cannot be reached, instead of a crash.
4. **Housekeeping:**
   - delete expired sessions daily (the table currently grows without limit);
   - watch database and storage size against the plan's limits.
5. Deadlines are already computed in Manila time (`Asia/Manila`); keep a test that guards it.

### Slow and dropped connections (done 24 October 2026)

Measured with Chrome throttled to a weak 3G link (300 ms latency, 750/250 kbps): a first visit to any page takes 4.3–4.8 s and downloads about 320 KB; repeat visits reuse the cached scripts.

- **Saves time out after 30 s** (`sendJson`) instead of spinning forever. The message says the save may already have gone through, so the intern checks before resending, which avoids duplicate entries.
- **An offline banner** in the dashboard appears the moment the connection drops and clears on reconnect, so interns know before they press Save.
- **The schedule-change attachment is size-checked in the browser**, so a slow connection is not spent uploading a file the server will refuse.

**Trimmed (24 October 2026), with no visible change** (pixel-identical screenshots of five pages, light and dark, before and after):

- Removed next-auth's `SessionProvider`: nothing used it, yet it shipped its code and fetched `/api/auth/session` (a database read) on every page load and tab focus. Sign-in and sign-out work without it.
- The sidebar no longer pulls Prisma's browser bundle (~50 KB) just to compare roles.
- Both fonts are variable, so each is now one `@font-face` covering every weight (7 rules instead of 20). The font files were already the minimum: one 41 KB and one 37 KB file, downloaded once and cached for a year.

Result per student page on the throttled link: about 19 KB less JavaScript and 1–2 fewer requests. Load time is about the same; most of the remaining ~200 KB is React and Next.js itself. Checked and kept: zod in the weekly report form (it gives the same validation as the server), and Next's gzip (Caddy's default zstd came out 4% larger).

Left for later: server-side duplicate protection for retried creates (an idempotency key).

### Before and after, and what caching would add (24 October 2026)

Same machine and database, the code before any performance work (`18044d5`) against `develop`:

| Page                 | Before (warm / first hit after a pause) | After                |
| -------------------- | --------------------------------------- | -------------------- |
| Student home         | 607 ms / 1.5–1.7 s                      | 342 ms / 0.37–0.39 s |
| Faculty home         | 503 ms / 1.0–1.2 s                      | 325 ms / 0.33 s      |
| Coordinator home     | 371 ms / 0.48–0.80 s                    | 331 ms / 0.34 s      |
| Coordinator users    | 186 ms / 1.0–1.4 s                      | 201 ms / 0.18–0.23 s |
| Weak 3G, first visit | 4.87 s, 335 KB                          | 4.26 s, 316 KB       |

The dev database has one student, so these numbers show the gains from parallel loading only. The adviser dashboard's deduction tallies are now batched: an adviser with 40 interns went from about 320 queries per view to about 24, however large the roster.

**Caching decisions:**

- **Redis: not now.** One app server can cache in its own memory; Redis earns its place only with several app servers sharing a cache or rate limits. Revisit if production ever runs more than one instance.
- **Settings cache: not now.** Settings reads are fast key lookups; the cost was waiting for them in sequence, now removed by loading them in parallel. Next 16's `use cache` needs Cache Components across the app, and `unstable_cache` is deprecated.
- **Client page cache (`staleTimes`): no.** Saves go through API routes, which cannot clear the browser's cached pages, so a student going back to Home after submitting would see the old status.

**Next:** the unified calendar loads each student separately (about 9 queries each, so about 18,000 for a coordinator at 2,000 interns); batch it the same way. Then a load test with 2,000 seeded interns on a local copy (Docker), never on the shared dev database.

### Separate track: weekly report features (not part of this plan)

Auto-computed hours and its test, the credited-hours preview, "Use my shift", "Same as yesterday", the progress line, and clearer field messages.

**Autosave** must be counted in the Phase 2 load test, since it multiplies writes. Prefer saving a few seconds after the student stops typing over saving on a fixed timer.

### Handover

A one-page runbook for whoever owns IDSMS after the team graduates:

- where it runs;
- how to restore;
- how to roll back;
- who renews the plans;
- who receives the uptime alerts.

## 5. Ideas considered and left out (for now)

**Keeping both hosts live, with log shipping and a DNS switch.** Too much for the team to run; the lab PC stays a restore target instead.

**An offline "outbox" that replays saves later.** Useful, but only safe with server-side times and duplicate protection; revisit after Phase 4.

**A public status page.** Revisit after Phase 4.

**Multi-school support (`org_id`).** Out of scope.

## Sources

- Supabase, [pooling and limits](https://supabase.com/docs/guides/database/connecting-to-postgres/pooling-and-limits); [DBConvert, Supabase Nano measurement](https://dbconvert.com/docs/connect-supabase/); [Supabase pricing 2026 (MakerKit)](https://makerkit.dev/blog/saas/supabase-pricing)
- Next.js 16 [Cache Components / `use cache`](https://nextjs.org/docs/app/getting-started/cache-components)
- [JWT vs database sessions (EastonDev)](https://eastondev.com/blog/en/posts/dev/20251219-jwt-vs-session-guide/)
- [Vercel: how to load test your application](https://examples.vercel.com/kb/guide/how-to-effectively-load-test-your-vercel-application); [Grafana k6 spike testing](https://grafana.com/docs/learning-paths/k6-spike-testing.md)
