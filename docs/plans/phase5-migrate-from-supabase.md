# One-time cutover: Supabase → self-hosted VM

> **Status (12 Nov 2026):** Active — not run yet. The stack it restores into is built and verified locally (PR #123: `deploy/`, `STORAGE_DRIVER` switch; PR #203: memory caps and log rotation); the move itself waits for the lab computer ([lab-server plan](phase5-lab-server-hosting.md)). Written for a cloud VM in September 2026; the lab computer replaces the VM. Facts below were checked against the repo on 12 Nov 2026: the stack files live in `deploy/` (`docker-compose.yml`, `Caddyfile`, `Dockerfile`, `OPERATIONS.md`), Postgres is 17 on both sides, the app selects MinIO with `STORAGE_DRIVER="s3"`, and there are three buckets (`checklist-documents`, `moa-documents`, `generated-documents`).

This is the **one-time** runbook for moving IDSMS-CIS off Supabase (managed
Postgres + Supabase Storage, app on Vercel) onto the single self-hosted VM
(`deploy/docker-compose.yml`: `postgres` (pgvector, Postgres 17) + `minio`
(Chainguard build) + the one-shot `minio-init` + `app` + `cron` + `caddy`). Run it top to
bottom. Every stage ends with a **Rollback** note; up to and including the DNS
cutover (Stage 8) every step is fully reversible with zero user-visible loss.

Standing operations after cutover live in [`deploy/OPERATIONS.md`](../../deploy/OPERATIONS.md).

## Conventions

- `<PROJECT_REF>` — the Supabase project ref (the `xxxx` in `xxxx.supabase.co`).
- `<domain>` — the production hostname, e.g. `idsms.university.edu`.
- `<VM_IP>` — the VM's public IP.
- `$SUPABASE_DIRECT_URL` — a Supabase connection string on **port 5432**
  (not the `6543`/pgbouncer one), from Supabase → Project Settings → Database →
  Connection string. The direct host is IPv6-only; from a network without IPv6
  use the **session pooler** URI (also port 5432), as `.github/workflows/backup.yml` does.
- `pg_dump` must be version **17 or newer** (Supabase runs Postgres 17). If the
  machine has an older client, run it from the `postgres:17` image, as below.
- Commands under "on the VM" run from `/opt/idsms`.

## Rollback-point summary

| Stage                        | Reversible?                    | Revert action                                                        |
| ---------------------------- | ------------------------------ | -------------------------------------------------------------------- |
| 0 Pre-flight                 | n/a                            | Nothing changed.                                                     |
| 1 Dump Postgres              | Yes                            | Delete the dump. Supabase is read-only here.                         |
| 2 Start data services        | Yes                            | `docker compose down -v` (empty volumes).                            |
| 3 Restore into VM Postgres   | Yes                            | `dropdb`/`createdb`, redo. Volume-local.                             |
| 4 Verify DB                  | Yes                            | Redo from Stage 2.                                                   |
| 5 Copy Storage objects       | Yes                            | `mc rb --force` the local buckets, redo. Supabase Storage read-only. |
| 6 Start app + caddy          | Yes                            | `docker compose stop app caddy`. Traffic still on Vercel.            |
| 7 Smoke test                 | Yes                            | Fix forward or `docker compose stop app caddy`.                      |
| 8 **DNS cutover**            | **Yes (last reversible step)** | Point the DNS record back to Vercel (low TTL window).                |
| 9 Re-enable CD               | Yes                            | Re-comment the `push:` trigger in `deploy.yml`.                      |
| 10 Decommission grace window | **Code-level revert only**     | See Stage 10 — app no longer speaks to Supabase Storage.             |

---

## Stage 0 — Pre-flight

- [ ] VM provisioned; Docker + Compose v2 installed; `<VM_SSH_USER>` created,
      in the `docker` group, owns `/opt/idsms`.
- [ ] `/opt/idsms` contains copies of the committed `deploy/docker-compose.yml`
      and `deploy/Caddyfile` with `<domain>` filled in (the repo's Caddyfile
      ships with `idsms.example.edu`).
- [ ] `/opt/idsms/.env.production` and `/opt/idsms/.env` written per
      [`OPERATIONS.md` §4](../../deploy/OPERATIONS.md#4-secrets-inventory-and-rotation).
      `.env` needs `POSTGRES_PASSWORD`, `MINIO_ROOT_USER`, `MINIO_ROOT_PASSWORD`,
      `CRON_SECRET` (compose refuses to start without it) and
      `APP_ENV_FILE=/opt/idsms/.env.production` (the compose default
      `../.env.production` is relative to the compose file). `.env.production`
      needs `STORAGE_DRIVER="s3"`, the `MINIO_*` keys, the same `CRON_SECRET`,
      and the email settings (`SMTP_USER`/`SMTP_PASS`, or `RESEND_*`); start from
      `.env.example`. Use a fresh `NEXTAUTH_SECRET`; **copy the existing
      `STUDENT_DEFAULT_PASSWORD_PEPPER` verbatim from the current Vercel
      environment** — changing it locks out every student on a default password.
- [ ] You have the Supabase **S3 access key + secret** (Supabase → Project
      Settings → Storage → S3 connection) and `$SUPABASE_DIRECT_URL`.
- [ ] DNS: `<domain>` still resolves to Vercel. Lower its TTL to 300s at least
      24h before Stage 8.
- [ ] **Freeze writes.** Announce a maintenance window and put the live app into
      a read-only / maintenance state (or simply accept that anything written
      after this point is lost and must be re-entered). Everything after this
      assumes no new writes hit Supabase.
- [ ] Optional safety net while moving: the nightly GitHub backup of the
      Supabase database (`.github/workflows/backup.yml`) is **disabled** until
      Phase 5. To have a fresh encrypted off-site dump during the move, set its
      `DATABASE_BACKUP_URL` and `BACKUP_PASSPHRASE` secrets and run
      `gh workflow enable backup.yml`. After cutover the lab server's own backups
      ([`OPERATIONS.md` §5](../../deploy/OPERATIONS.md#5-backups-and-restore))
      take over.
- [ ] **Reference row counts** for every table in `public` (32 tables as of
      migration 031) — run on Supabase now and save the output:

  ```sql
  SELECT table_name AS t,
         (xpath('/row/c/text()',
                query_to_xml(format('SELECT count(*) AS c FROM public.%I', table_name), false, true, '')))[1]::text::bigint AS rows
  FROM information_schema.tables
  WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
  ORDER BY t;
  ```

**Rollback:** nothing has changed; abort by lifting the maintenance window.

---

## Stage 1 — Dump Postgres from Supabase

Schemas `storage`, `auth`, and `realtime` are Supabase-internal and are **not**
carried over (the VM runs plain Postgres + pgvector, and object metadata now
lives in MinIO).

```bash
# pg_dump 17 from the official image (skip the docker wrapper if your own client is 17+)
docker run --rm -v "$PWD:/out" postgres:17 \
  pg_dump "$SUPABASE_DIRECT_URL" \
  --no-owner --no-privileges --no-acl \
  --exclude-schema=storage --exclude-schema=auth --exclude-schema=realtime \
  -Fc -f /out/idsms.dump

# sanity-check the archive
pg_restore -l idsms.dump | grep -E 'TABLE DATA|EXTENSION|POLICY' | head -n 40
ls -lh idsms.dump
```

Expect to see `public` tables, the `vector` extension, `ENABLE ROW LEVEL
SECURITY` / `POLICY` entries, and a non-trivial file size.

**Rollback:** `rm idsms.dump`. `pg_dump` is read-only; Supabase is untouched.

---

## Stage 2 — Start the data services on the VM

```bash
cd /opt/idsms
docker compose up -d postgres minio minio-init
docker compose ps            # wait for postgres + minio = healthy; minio-init exits 0

# pgvector must exist BEFORE the restore (the dump references vector(768) columns)
docker compose exec postgres psql -U idsms -d idsms -c "CREATE EXTENSION IF NOT EXISTS vector;"
```

`minio-init` creates `checklist-documents`, `moa-documents` and `generated-documents` and sets all three to
`anonymous = none` (this replaces the historical
`prisma/migrations_manual/003_storage_buckets.sql` and `004_generated_documents_bucket.sql`, which are Supabase-only).

**Rollback:** `docker compose down -v` — the volumes are empty, nothing points
here yet.

---

## Stage 3 — Restore schema + data into the VM Postgres

```bash
cd /opt/idsms
docker compose exec -T postgres pg_restore -U idsms -d idsms \
  --no-owner --no-privileges < idsms.dump
```

Benign noise you can ignore: notices about the `vector` extension already
existing, and `COMMENT ON EXTENSION` / role-grant lines that need superuser.
`--exit-on-error` is deliberately **not** used. If you see errors about missing
**tables** or failed **data** loads, stop and investigate before Stage 4.

Re-assert the one lock that `--no-privileges` strips (append-only `audit_logs`,
NFR-SEC-10):

```bash
docker compose exec -T postgres psql -U idsms -d idsms \
  -c "REVOKE UPDATE, DELETE ON audit_logs FROM PUBLIC;"
```

**Rollback:**

```bash
docker compose exec -T postgres sh -c 'dropdb -U idsms idsms && createdb -U idsms idsms'
docker compose exec postgres psql -U idsms -d idsms -c "CREATE EXTENSION IF NOT EXISTS vector;"
# then re-run Stage 3
```

---

## Stage 4 — Verify the database

Run all four checks. Every one must pass before you touch Storage or DNS.

### 4.1 pgvector present

```sql
SELECT extname, extversion FROM pg_extension WHERE extname = 'vector';
```

Expect exactly **1 row**.

### 4.2 RLS enabled on every application table

```sql
SELECT relname, relrowsecurity
FROM pg_class
WHERE relnamespace = 'public'::regnamespace AND relkind = 'r'
ORDER BY relname;
```

Expect **`relrowsecurity = t` on every row** (32 application tables as of
migration 031). The first 19 are enabled by
`prisma/migrations_manual/002_default_deny_rls.sql`, `audit_logs` by
`001_vector_extension_and_audit_rls.sql`, and the tables added later by the
migration that created each one (007, 009, 010, 018, 019, 020, 021, 025, 030).

`ENABLE ROW LEVEL SECURITY` and `CREATE POLICY` are schema statements and are
included in the dump, so they should already be present. If any table shows
`f`, re-apply the matching `ENABLE ROW LEVEL SECURITY` line from the migration
that created it in `prisma/migrations_manual/` (bare
`ALTER TABLE <t> ENABLE ROW LEVEL SECURITY;` is safe to repeat).

### 4.3 `audit_logs` append-only policies

```sql
SELECT polname, polcmd FROM pg_policy
WHERE polrelid = 'audit_logs'::regclass
ORDER BY polname;
```

Expect exactly **2 rows**:

| polname                  | polcmd | meaning                              |
| ------------------------ | ------ | ------------------------------------ |
| `audit_logs_insert_only` | `a`    | INSERT allowed (`WITH CHECK (true)`) |
| `audit_logs_select_all`  | `r`    | SELECT allowed (`USING (true)`)      |

No `w` (UPDATE) or `d` (DELETE) row may exist. Confirm the REVOKE from Stage 3
took: `\dp audit_logs` should show no `UPDATE`/`DELETE` grant to `PUBLIC`.

### 4.4 Row-count diff vs. the Stage 0 snapshot

Re-run the Stage 0 count query, now against the VM:

```bash
docker compose exec postgres psql -U idsms -d idsms -f - <<'SQL'
SELECT table_name AS t,
       (xpath('/row/c/text()',
              query_to_xml(format('SELECT count(*) AS c FROM public.%I', table_name), false, true, '')))[1]::text::bigint AS rows
FROM information_schema.tables
WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
ORDER BY t;
SQL
```

Every row must **match the Stage 0 numbers exactly** (writes were frozen). Any
difference means the freeze leaked or the restore was partial — go back to
Stage 3.

**Rollback:** still fully safe — nothing points at the VM. Redo from Stage 2.

---

## Stage 5 — Copy Storage objects (Supabase Storage → MinIO)

MinIO is not published on the host, so run `mc` in a throwaway container on the
compose network. Supabase's Storage S3 endpoint is reachable over the public
internet from inside that container.

```bash
# minio/mc is no longer published; use the same pinned Chainguard client as minio-init
docker run --rm -it --network idsms_net --entrypoint sh cgr.dev/chainguard/minio-client@sha256:f0b1d3d6ae12391d9bbe88345dee6da67027c93cda18dc5c9a463c2cc7d61b29
```

Inside the container:

```sh
# source: Supabase Storage S3 API
mc alias set supa https://<PROJECT_REF>.supabase.co/storage/v1/s3 \
  <SUPABASE_S3_ACCESS_KEY> <SUPABASE_S3_SECRET_KEY> --api S3v4

# destination: the VM's MinIO
mc alias set local http://minio:9000 <MINIO_ROOT_USER> <MINIO_ROOT_PASSWORD>

mc mirror --overwrite supa/checklist-documents local/checklist-documents
mc mirror --overwrite supa/moa-documents      local/moa-documents
mc mirror --overwrite supa/generated-documents local/generated-documents

# verify object counts match
echo "checklist: $(mc ls --recursive supa/checklist-documents | wc -l) -> $(mc ls --recursive local/checklist-documents | wc -l)"
echo "moa:       $(mc ls --recursive supa/moa-documents        | wc -l) -> $(mc ls --recursive local/moa-documents        | wc -l)"
echo "generated: $(mc ls --recursive supa/generated-documents  | wc -l) -> $(mc ls --recursive local/generated-documents  | wc -l)"
exit
```

Each pair of counts must match. Object keys are preserved, which is what the
app expects: the database stores each file's key (for example
`weekly/{studentProfileId}/{weeklyReportId}.pdf` in `generated-documents`), so
the same keys must exist in MinIO.

**Rollback:** in an `mc` container, `mc rb --force` each of
`local/checklist-documents`, `local/moa-documents` and
`local/generated-documents`, then re-run `docker compose up -d minio-init` to
recreate the empty buckets. The Supabase side is read-only.

---

## Stage 6 — Start the app and Caddy

```bash
cd /opt/idsms
# double-check .env.production is complete and NEXTAUTH_URL="https://<domain>"
docker compose up -d --wait
docker compose ps          # postgres, minio, app healthy; cron and caddy running; minio-init exited 0
```

`--wait` blocks until the `app` healthcheck (`/api/health`) passes. Caddy will
try to obtain a Let's Encrypt certificate for `<domain>`; while DNS still points
at Vercel this may not complete yet — that is expected and resolves in Stage 8.
You can watch with `docker compose logs -f caddy`.

**Rollback:** `docker compose stop app caddy`. All public traffic is still served
by Vercel + Supabase. No user impact.

---

## Stage 7 — Smoke test (before cutover)

Test the VM directly, bypassing DNS:

```bash
curl -fsS --resolve <domain>:443:<VM_IP> https://<domain>/api/health
# expect: {"status":"ok"}
```

Then, forcing the same host override in a browser (or `/etc/hosts` entry
`<VM_IP> <domain>`), manually verify:

- [ ] Sign in as a test **faculty** account (DB session strategy works →
      `NEXTAUTH_SECRET` + Postgres reachable).
- [ ] Open a student's pre-deployment checklist.
- [ ] **Download** an existing uploaded file — exercises the
      `/api/storage/download` HMAC proxy path end to end (MinIO read + signature
      verify).
- [ ] **Upload** a new PDF and a new image — exercises `validateUpload` +
      MinIO write.
- [ ] Generate a document (Gemini + Resend paths, if in scope for the test).

**Rollback:** fix forward, or `docker compose stop app caddy`. Still no cutover,
still no user impact.

---

## Stage 8 — DNS cutover (last reversible step)

> **Lab computer:** with no inbound ports, the public hostname points at an
> outbound tunnel (Cloudflare Tunnel or an SLU IT address, decision H2 in the
> [lab-server plan](phase5-lab-server-hosting.md)) instead of an A record to
> `<VM_IP>`. The `cloudflared` service is not in `deploy/docker-compose.yml`
> yet; Caddy's Let's Encrypt step below applies only when ports 80/443 are
> reachable.

1. Confirm the `<domain>` record TTL is still low (300s) from Stage 0.
2. Change the `<domain>` A/AAAA record (or CNAME) from Vercel to `<VM_IP>`.
3. Watch Caddy obtain its certificate:

   ```bash
   docker compose logs -f caddy      # look for "certificate obtained successfully"
   ```

4. Verify through real DNS:

   ```bash
   curl -fsS https://<domain>/api/health           # {"status":"ok"}
   curl -fsSI https://<domain>/                     # 200, valid TLS
   ```

5. Do a final human click-through (login, checklist, file download/upload).

**Rollback:** point the `<domain>` DNS record **back to Vercel**. Within the
low-TTL window this fully reverts to the previous stack. The Supabase project and
the Vercel deployment are still live (only writes were frozen) — lift the freeze
there if you revert.

---

## Stage 9 — Re-enable continuous deployment

Only after Stage 8 is stable:

> **Lab computer:** `deploy.yml` deploys over **SSH into the server**
> (`VM_HOST`, `VM_SSH_USER`, `VM_SSH_PRIVATE_KEY`), which a lab PC with no
> inbound ports cannot accept. The lab-server plan replaces it with a pull-based
> deploy script (not written yet). The steps below apply only to a reachable VM.

1. Edit `.github/workflows/deploy.yml` — uncomment the trigger:

   ```yaml
   on:
     push:
       branches: [main]
     workflow_dispatch:
       inputs:
         image_tag:
           description: "Existing ghcr.io sha tag to roll back/forward to"
           required: false
   ```

2. Confirm the repo Actions secrets exist: `VM_HOST`, `VM_SSH_USER`,
   `VM_SSH_PRIVATE_KEY` (see [`OPERATIONS.md` §4.1](../../deploy/OPERATIONS.md#41-github-repo-actions-secrets)).
3. Confirm `/opt/idsms` has `docker-compose.yml`, `Caddyfile`, `.env.production`,
   and `.env`. The `.env` / `--env-file` interpolation gap is **resolved in
   `deploy.yml`**: the SSH script passes both `--env-file .env` and
   `--env-file .env.deploy` (naming `--env-file` at all suppresses Compose's
   automatic `.env` load, and `minio` re-reads `MINIO_ROOT_*` on every start, so
   `.env` must still be supplied alongside the `IMAGE_TAG`-only `.env.deploy`).
   Both files just need to be present — see
   [`OPERATIONS.md` §4.3](../../deploy/OPERATIONS.md#43-on-the-vm--optidsmsenv-compose-only-interpolation-not-read-by-the-app).
4. Merge a trivial no-op commit to `main`; watch **Actions → Deploy** run
   `validate → build-and-push → deploy` and finish on a green
   `docker compose up -d --wait`.
5. `curl -fsS https://<domain>/api/health`.

**Rollback:** re-comment the `push:` block. Deployment falls back to
`workflow_dispatch`-only; nothing else changes.

---

## Stage 10 — Decommission grace window (2 weeks)

- [ ] **Pause** the Supabase project (Supabase → Project Settings → General →
      Pause project). **Do not delete it.** A paused project can be restored;
      keep it for **2 weeks**.
- [ ] Keep the Vercel project too (it now serves no traffic since DNS moved);
      optionally set it to redirect to `<domain>`. Do not delete for 2 weeks.
- [ ] Keep the Stage 1 `idsms.dump` and the first successful off-site backup
      (`OPERATIONS.md` §5) archived somewhere durable.

**Rollback during the window:** unpause Supabase, point `<domain>` DNS back to
Vercel, and lift the write freeze. `src/lib/storage.ts` picks the backend from
`STORAGE_DRIVER` (`supabase` is the default; `s3` is MinIO), so the Vercel
project still talks to Supabase Storage as long as its env keeps
`STORAGE_DRIVER="supabase"` — no code revert is needed. **Caveat:** anything
written on the lab server after cutover exists only there; reverting means
losing it or copying it back by hand, so treat the end of Stage 10 as the
practical point of no return.

**After 2 weeks**, with the VM stable and at least one verified restore drill
(`OPERATIONS.md` §5.5):

- [ ] Delete the Supabase project.
- [ ] Revoke the Supabase S3 access keys.
- [ ] Remove the old Vercel project / any stale DNS records.
- [ ] Delete `idsms.dump` from local disk.
