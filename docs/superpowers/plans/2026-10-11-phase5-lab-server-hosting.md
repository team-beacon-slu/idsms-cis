# Phase 5 Plan — Lab Server Hosting, Optimization, Hardening & UAT

Date: 2026-10-11 · Status: **planned, starts after the Phase 4 feature freeze**
Decision (PM, 2026-10-11): IDSMS moves off Vercel + managed Supabase onto **one dedicated
computer in the lab**. That machine hosts the database, file storage and the website. Phase 5
adds **no product features**. All functionality is finished in Phase 4 (see the "Feature
freeze" item in `2026-10-11-phase4-roadmap.md` §4).

Builds on PR #50 (`feature/vm-migration-artifacts`), which already implements the self-hosted
stack for a cloud VM: `Dockerfile` (standalone Next.js), `docker-compose.yml`
(Postgres+pgvector, MinIO, app, Caddy), `src/lib/storage.ts` on S3/MinIO with app-proxied
downloads, `/api/health`, `OPERATIONS.md`, and `docs/migration/from-supabase.md`. PR #50 is
**conflicting with `develop`** and assumes a public cloud VM. This plan adapts it to a lab PC.

---

## 1. What changes from PR #50 (cloud VM → lab PC)

| Concern        | PR #50 assumed                        | Lab PC reality                                          | Change                                                                                                                                                                                                                                                                                                        |
| -------------- | ------------------------------------- | ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Reachability   | Public IP, DNS A record               | Behind the school network/NAT, usually no inbound ports | **Interns submit from their host companies, off campus, so the site must be reachable from the internet.** Use an outbound tunnel (Cloudflare Tunnel, free with a domain; or Tailscale Funnel), so no router or firewall changes are needed. Fallback: ask SLU IT for a port-forward/static IP (decision H2). |
| HTTPS          | Caddy + Let's Encrypt on ports 80/443 | No inbound 80/443                                       | TLS terminates at the tunnel edge. Caddy stays as the local reverse proxy (or is dropped) and serves plain HTTP on the LAN behind the tunnel.                                                                                                                                                                 |
| Deploy         | GitHub Actions SSH into the VM        | No inbound SSH                                          | **Pull-based deploy:** a deploy script on the lab PC (`git pull` + `docker compose up -d --build`), run manually or by a GitHub self-hosted runner on the PC. `deploy.yml` is replaced.                                                                                                                       |
| Scheduling     | n/a (Vercel Cron in Phase 4)          | No Vercel                                               | A small `cron` container (or host Task Scheduler/cron) calls `GET /api/cron/daily` with `Authorization: Bearer $CRON_SECRET` daily at 08:00 Manila (portability rule 3).                                                                                                                                      |
| PDF rendering  | —                                     | No `@sparticuz/chromium`                                | The app image installs Chromium (`apk add chromium` / `apt-get install chromium`) and sets `PUPPETEER_EXECUTABLE_PATH` (portability rule 4).                                                                                                                                                                  |
| Storage        | MinIO                                 | same                                                    | Add the `generated-documents` bucket (Phase 4 A) to `minio-init`; deviation proofs live in `checklist-documents`.                                                                                                                                                                                             |
| Power / uptime | Cloud SLA                             | A desktop in a lab                                      | UPS; BIOS "restart on AC power loss"; OS sleep and auto-update reboot disabled or scheduled; Docker `restart: unless-stopped`; health monitoring (§4).                                                                                                                                                        |
| Backups        | Cloud snapshots                       | Single disk                                             | Nightly `pg_dump` + MinIO mirror to a second disk **and** an off-site copy (decision H4). Restore is tested before go-live.                                                                                                                                                                                   |

## 2. Decisions needed before Phase 5 starts (owner: Jay + adviser + lab in-charge)

| ID     | Question                                                                                                                                              | Why it matters                                                                                                                                                                                                                       | Default if not decided                                                                                    |
| ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------- |
| **H1** | Lab PC specs and OS (CPU, RAM, disk, Windows or Linux)? Can we install Docker?                                                                        | Postgres + MinIO + Next.js + Chromium need about **4 cores, 8 GB RAM (16 GB comfortable), 100 GB+ SSD**. Windows means Docker Desktop on WSL2 (works, but needs reboot handling); Linux (Ubuntu Server LTS) is simpler and steadier. | Ubuntu Server 24.04 LTS if the machine can be dedicated                                                   |
| **H2** | How do off-campus interns reach it: a tunnel (we own a cheap domain and use Cloudflare Tunnel), or SLU IT gives a static IP/port-forward + subdomain? | Without one of these, only people inside the lab network can use the site.                                                                                                                                                           | Cloudflare Tunnel + a team-bought domain                                                                  |
| **H3** | Who has physical and admin access, and is the PC on 24/7 (including semester breaks and holidays)?                                                    | Downtime = students can't submit before the Tuesday deadline.                                                                                                                                                                        | Always on, UPS attached, 1 named admin + 1 backup admin                                                   |
| **H4** | Off-site backup target (department Google Drive, an external drive taken home weekly, cloud bucket)?                                                  | A disk failure or theft must not lose a semester of compliance records (FR-DB-07).                                                                                                                                                   | Encrypted nightly dump uploaded to a department Google Drive via `rclone`                                 |
| **H5** | Does the lab network allow outbound HTTPS (for Resend email, Gemini AI, the tunnel)?                                                                  | Email and AI depend on outbound internet (portability rule 7).                                                                                                                                                                       | Assume yes; verify in stage 0                                                                             |
| **H6** | Does the system stay on Supabase until the defense and move after, or move before the defense?                                                        | Moving right before a defense is the riskiest timing.                                                                                                                                                                                | Move **at least 2 weeks before** the defense, with Supabase kept read-only as a fallback until UAT passes |

## 3. Stages

Each stage ends with a check that must pass before the next one starts.

### Stage 0: Survey the lab PC (½ day)

- Record H1, H3 and H5 facts in `OPERATIONS.md` (specs, OS, IP on the LAN, who has keys).
- `docker run hello-world`, plus an outbound check: `curl -I https://api.resend.com`, `curl -I https://generativelanguage.googleapis.com`.
- **Check:** Docker runs; outbound HTTPS works or is documented as blocked.

### Stage 1: Bring PR #50 up to date with Phase 4 (1–2 days, on a dev laptop)

- Rebase `feature/vm-migration-artifacts` onto `develop` after the Phase 4 freeze, and resolve conflicts:
  - `storage.ts` must keep Phase 4's `uploadPdfBuffer` and signed-URL behaviour on top of S3.
  - `.env.example` must merge both sets of variables.
  - `next.config.mjs` must keep `serverComponentsExternalPackages`.
  - `package.json`: the AWS SDK alongside puppeteer.
- Dockerfile: add Chromium and fonts (`fonts-noto`/`font-liberation` so PDFs render text), and set `PUPPETEER_EXECUTABLE_PATH`.
- `docker-compose.yml`:
  - Add `generated-documents` to `minio-init`.
  - Add a `cron` service (`alpine` + `crond` calling `/api/cron/daily` with `CRON_SECRET`).
  - Add a `cloudflared` service (tunnel token from env).
  - Make Caddy LAN-only, or remove it when the tunnel points straight at `app:3000`.
- Replace `deploy.yml` with `scripts/deploy.sh` (pull, build, `docker compose up -d`, health check, roll back to the previous image tag on failure).
- Re-run the whole suite: tsc, lint, jest, build, and `docker compose up` locally. Every Phase 4 flow (PDF, cron, notifications) must work against MinIO and local Postgres.
- **Check:** CI green; a full student walkthrough passes against the local Docker stack.

### Stage 2: Provision the lab PC (1 day)

- OS hardening:
  - Automatic security updates with a scheduled reboot window (Sunday 03:00), sleep disabled, restart after power loss, and a UPS.
  - Firewall: no inbound ports, since the tunnel is outbound-only.
  - SSH only from the LAN, if Linux.
  - Disk encryption if the PC can leave the room.
- Install Docker and the compose plugin, clone the repo, and create `.env.production` from `.env.example`. The secrets (`NEXTAUTH_SECRET`, `POSTGRES_PASSWORD`, MinIO keys, `CRON_SECRET`, tunnel token, Resend/Gemini keys) are new values, never the dev ones.
- `docker compose up -d`, then apply the Prisma schema and `prisma/migrations_manual/001`, `002`, `005`, `006` (003/004 are Supabase-bucket SQL, replaced by `minio-init`).
- **Check:** `/api/health` reports green over the tunnel URL; login works from a phone on mobile data (proves off-campus reach).

### Stage 3: Migrate data from Supabase (½ day + rehearsal)

- Follow `docs/migration/from-supabase.md`:
  - `pg_dump` the Supabase database (data only, schema from Prisma), then restore.
  - Copy every Storage object (checklist, MOA, generated documents) into the matching MinIO buckets with `rclone`, keeping the object paths identical so stored paths stay valid.
- **Rehearse once on a copy** and compare row counts per table and object counts per bucket.
- Decide what to do with test data (R3): drop the test accounts and demo data before go-live unless UAT needs them.
- **Check:** counts match; a known student's checklist files and PDFs open in the new system.

### Stage 4: Cutover (announce a 2-hour window)

1. Put Supabase into read-only (revoke writes, or put the old Vercel deploy into maintenance mode).
2. Run the final incremental dump and object sync.
3. Switch the public URL to the tunnel hostname, and update `NEXTAUTH_URL`.
4. Smoke test as all four roles.
5. Keep Supabase and Vercel untouched (read-only) for **2 weeks** as the rollback path, then decommission them.

- **Check:** the smoke test passes; no errors in `docker compose logs app` for one business day.

### Stage 5: Optimization and hardening (2–3 days)

- **Performance (PRD Phase 5, carried over):**
  - p95 TTFB ≤ 800 ms on dashboard and report pages, measured with a short `autocannon`/k6 script against the tunnel URL.
  - Add Postgres indexes where `EXPLAIN` shows sequential scans on hot queries (weekly reports by student, notifications by user and readAt, generated_documents by student and type).
  - Set `next start` / Node memory limits; consider PDF render concurrency 1.
- **Coverage:** ≥ 70% services and ≥ 90% critical logic (hours, gates, review state), using the `npm test -- --coverage` output already in CI.
- **Security:**
  - Confirm `audit_logs` is append-only on the new Postgres by re-applying 001's policies and attempting an UPDATE as the app role.
  - Rotate all secrets that ever lived on dev machines.
  - Tunnel access logs on; Cloudflare WAF/bot protection on the hostname.
  - Rate-limit login (already locked after 5 failures, FR-UM-10).
- **Check:** the perf report, coverage report and security checklist are attached to the Phase 5 PR.

### Stage 6: Operations — backups, monitoring, runbook (1 day)

- Nightly `pg_dump` (compressed, encrypted) plus a MinIO mirror to a second disk and the off-site target (H4), keeping 14 daily and 8 weekly copies. **Test a full restore onto a spare machine/VM before go-live.**
- Monitoring:
  - An external uptime check on `/api/health` (UptimeRobot/Healthchecks.io, free tier) that alerts the admin's email.
  - Disk-space alert at 80%.
  - Docker auto-restart already in place.
- Update `OPERATIONS.md`: start/stop, deploy, restore, rotate secrets, add a semester, what to do in a power outage, and who to call (the H3 named admins).
- **Check:** a restore drill succeeds from the off-site copy; a forced app crash triggers an alert within 5 minutes.

### Stage 7: UAT and sign-off (PRD Phase 5, carried over)

- Run the PRD's UAT scenarios with selected interns, faculty and coordinators on the lab-hosted system. Log every issue as a GitHub issue labelled `uat`. Fix only bugs (feature freeze).
- **Check:** all UAT scenarios pass; adviser sign-off is recorded in the vault.

## 4. Risks specific to Phase 5

| ID  | Risk                                                        | L   | I   | Mitigation                                                                                                                   |
| --- | ----------------------------------------------------------- | --- | --- | ---------------------------------------------------------------------------------------------------------------------------- |
| P1  | Power outage or someone switching the PC off                | H   | H   | UPS, auto power-on, a "do not turn off" label, external uptime alert, named admins (H3)                                      |
| P2  | Disk failure loses records                                  | M   | H   | Nightly off-site backups with a tested restore (Stage 6)                                                                     |
| P3  | Campus network blocks the tunnel or outbound traffic        | M   | H   | Verify in Stage 0; fallback is an SLU IT port-forward/static IP (H2)                                                         |
| P4  | Windows Update reboots or Docker Desktop doesn't auto-start | M   | M   | Prefer Linux; on Windows, set Docker Desktop to start at login, auto-login a service account, and schedule the update window |
| P5  | Migration loses or mismatches files                         | L   | H   | Identical object paths, rehearsal run, count comparison, 2-week Supabase rollback                                            |
| P6  | Physical access to the PC leaks data                        | L   | H   | Locked room, disk encryption, no local copies of secrets outside `.env.production`                                           |
| P7  | Bus factor: only Jay knows the server                       | H   | M   | `OPERATIONS.md`, a second admin trained during Stage 2, vault note                                                           |
| P8  | Moving right before the defense                             | M   | H   | H6: move at least 2 weeks before, with rollback kept                                                                         |

## 5. Definition of done for Phase 5

The system runs entirely on the lab PC and is reachable off campus over HTTPS. Supabase and
Vercel are decommissioned (after the 2-week rollback window). Nightly off-site backups exist and
a restore has been tested. Uptime monitoring alerts a named admin. p95 TTFB ≤ 800 ms. Coverage
targets are met. `audit_logs` is append-only. All UAT scenarios pass, with adviser sign-off.
`OPERATIONS.md` is enough for a teammate to run, deploy and restore the system without Jay.
