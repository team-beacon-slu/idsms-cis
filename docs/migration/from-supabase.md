# One-time cutover: Supabase → self-hosted VM

This is the **one-time** runbook for moving IDSMS-CIS off Supabase (managed
Postgres + Supabase Storage, app on Vercel) onto the single self-hosted VM
(`docker-compose.yml`: `postgres` + `minio` + `app` + `caddy`). Run it top to
bottom. Every stage ends with a **Rollback** note; up to and including the DNS
cutover (Stage 8) every step is fully reversible with zero user-visible loss.

Standing operations after cutover live in [`../../OPERATIONS.md`](../../OPERATIONS.md).

## Conventions

- `<PROJECT_REF>` — the Supabase project ref (the `xxxx` in `xxxx.supabase.co`).
- `<domain>` — the production hostname, e.g. `idsms.university.edu`.
- `<VM_IP>` — the VM's public IP.
- `$SUPABASE_DIRECT_URL` — the Supabase **direct** (port 5432, non-pooled)
  connection string, from Supabase → Project Settings → Database → Connection
  string → URI (not the `6543`/pgbouncer one).
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
- [ ] `/opt/idsms` contains the committed `docker-compose.yml` and `Caddyfile`
      with `<domain>` filled in.
- [ ] `/opt/idsms/.env.production` and `/opt/idsms/.env` written per
      [`OPERATIONS.md` §4](../../OPERATIONS.md#4-secrets-inventory-and-rotation).
      Use a fresh `NEXTAUTH_SECRET`; **copy the existing
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
- [ ] **Reference row counts** — run on Supabase now and save the output:

  ```sql
  SELECT 'users'                        AS t, count(*) FROM users
  UNION ALL SELECT 'student_profiles',        count(*) FROM student_profiles
  UNION ALL SELECT 'companies',               count(*) FROM companies
  UNION ALL SELECT 'moa_records',             count(*) FROM moa_records
  UNION ALL SELECT 'pre_deployment_checklist_items', count(*) FROM pre_deployment_checklist_items
  UNION ALL SELECT 'work_plans',              count(*) FROM work_plans
  UNION ALL SELECT 'weekly_reports',          count(*) FROM weekly_reports
  UNION ALL SELECT 'daily_report_entries',    count(*) FROM daily_report_entries
  UNION ALL SELECT 'deviation_reports',       count(*) FROM deviation_reports
  UNION ALL SELECT 'generated_documents',     count(*) FROM generated_documents
  UNION ALL SELECT 'notifications',           count(*) FROM notifications
  UNION ALL SELECT 'audit_logs',              count(*) FROM audit_logs
  ORDER BY t;
  ```

**Rollback:** nothing has changed; abort by lifting the maintenance window.

---

## Stage 1 — Dump Postgres from Supabase

Schemas `storage`, `auth`, and `realtime` are Supabase-internal and are **not**
carried over (the VM runs plain Postgres + pgvector, and object metadata now
lives in MinIO).

```bash
pg_dump "$SUPABASE_DIRECT_URL" \
  --no-owner --no-privileges --no-acl \
  --exclude-schema=storage --exclude-schema=auth --exclude-schema=realtime \
  -Fc -f idsms.dump

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

`minio-init` creates `checklist-documents` and `moa-documents` and sets both to
`anonymous = none` (this replaces the historical
`prisma/migrations_manual/003_storage_buckets.sql`, now marked SUPERSEDED).

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

Expect **`relrowsecurity = t` for all 20 application tables** — the 19 enabled by
`prisma/migrations_manual/002_default_deny_rls.sql`
(`accounts`, `sessions`, `users`, `student_profiles`, `class_groups`,
`faculty_class_groups`, `semesters`, `companies`, `moa_records`,
`pre_deployment_checklist_items`, `work_plans`, `weekly_reports`,
`daily_report_entries`, `deviation_reports`, `generated_documents`,
`notifications`, `holiday_calendar`, `system_config`, `password_reset_tokens`)
plus `audit_logs` from `001_vector_extension_and_audit_rls.sql`.

`ENABLE ROW LEVEL SECURITY` and `CREATE POLICY` are schema statements and are
included in the dump, so they should already be present. If any table shows
`f`, re-apply the relevant lines from `prisma/migrations_manual/002_*.sql` (bare
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
SELECT 'users' AS t, count(*) FROM users
UNION ALL SELECT 'student_profiles',        count(*) FROM student_profiles
UNION ALL SELECT 'companies',               count(*) FROM companies
UNION ALL SELECT 'moa_records',             count(*) FROM moa_records
UNION ALL SELECT 'pre_deployment_checklist_items', count(*) FROM pre_deployment_checklist_items
UNION ALL SELECT 'work_plans',              count(*) FROM work_plans
UNION ALL SELECT 'weekly_reports',          count(*) FROM weekly_reports
UNION ALL SELECT 'daily_report_entries',    count(*) FROM daily_report_entries
UNION ALL SELECT 'deviation_reports',       count(*) FROM deviation_reports
UNION ALL SELECT 'generated_documents',     count(*) FROM generated_documents
UNION ALL SELECT 'notifications',           count(*) FROM notifications
UNION ALL SELECT 'audit_logs',              count(*) FROM audit_logs
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
docker run --rm -it --network idsms_net --entrypoint sh minio/mc:latest
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

# verify object counts match
echo "checklist: $(mc ls --recursive supa/checklist-documents | wc -l) -> $(mc ls --recursive local/checklist-documents | wc -l)"
echo "moa:       $(mc ls --recursive supa/moa-documents        | wc -l) -> $(mc ls --recursive local/moa-documents        | wc -l)"
exit
```

Both counts must match. Object keys are preserved, which is what the app expects
(`{studentProfileId}/{requirementType}.{ext}` and
`{companyId}/{moaRecordId}.{ext}`).

**Rollback:** in an `mc` container, `mc rb --force local/checklist-documents` and
`mc rb --force local/moa-documents`, then re-run `docker compose up -d
minio-init` to recreate the empty buckets. The Supabase side is read-only.

---

## Stage 6 — Start the app and Caddy

```bash
cd /opt/idsms
# double-check .env.production is complete and NEXTAUTH_URL="https://<domain>"
docker compose up -d --wait
docker compose ps          # all four containers healthy
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
   `VM_SSH_PRIVATE_KEY` (see [`OPERATIONS.md` §4.1](../../OPERATIONS.md#41-github-repo-actions-secrets)).
3. Confirm `/opt/idsms` has `docker-compose.yml`, `Caddyfile`, `.env.production`,
   and `.env`. The `.env` / `--env-file` interpolation gap is **resolved in
   `deploy.yml`**: the SSH script passes both `--env-file .env` and
   `--env-file .env.deploy` (naming `--env-file` at all suppresses Compose's
   automatic `.env` load, and `minio` re-reads `MINIO_ROOT_*` on every start, so
   `.env` must still be supplied alongside the `IMAGE_TAG`-only `.env.deploy`).
   Both files just need to be present — see
   [`OPERATIONS.md` §4.3](../../OPERATIONS.md#43-on-the-vm--optidsmsenv-compose-only-interpolation-not-read-by-the-app).
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
Vercel, and lift the write freeze. **Caveat:** the app code now uses MinIO for
object storage (`src/lib/storage.ts` was rewritten in this migration), so a
Vercel redeploy from `main` will not talk to Supabase Storage. A true revert past
Stage 9 requires `git revert` of the storage/compose commits and a
Supabase-Storage-backed build — treat Stage 10 as the practical point of no
return.

**After 2 weeks**, with the VM stable and at least one verified restore drill
(`OPERATIONS.md` §5.5):

- [ ] Delete the Supabase project.
- [ ] Revoke the Supabase S3 access keys.
- [ ] Remove the old Vercel project / any stale DNS records.
- [ ] Delete `idsms.dump` from local disk.
