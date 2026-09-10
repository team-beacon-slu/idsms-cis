# IDSMS-CIS — Operations Runbook (self-hosted VM)

This is the standing runbook for the self-hosted deployment: one cloud VM running
four Docker Compose containers behind Caddy. It is written to survive the
capstone team's graduation — every procedure is a concrete, numbered set of
commands that a new operator can follow without prior context.

> Scope: the VM deployment only. The one-time move off Supabase is a separate
> document: [`docs/migration/from-supabase.md`](docs/migration/from-supabase.md).

---

## 1. System overview

| Piece                | Value                                                                                                                              |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| VM working directory | `/opt/idsms`                                                                                                                       |
| Compose project      | `idsms` (`name:` in `docker-compose.yml`)                                                                                          |
| Containers           | `postgres` (pgvector/pgvector:pg16), `minio`, `app` (`ghcr.io/team-beacon-slu/idsms-cis`), `caddy`; plus the one-shot `minio-init` |
| Published ports      | `caddy` only: `80`, `443`. Nothing else is reachable from outside the VM.                                                          |
| Named volumes        | `pg_data`, `minio_data`, `caddy_data`, `caddy_config`                                                                              |
| Public URL           | `https://<domain>` (set the real host in `Caddyfile` and `NEXTAUTH_URL`)                                                           |
| Health endpoint      | `GET https://<domain>/api/health` → `{"status":"ok"}` (200) or `{"status":"error"}` (503)                                          |
| Container registry   | `ghcr.io/team-beacon-slu/idsms-cis` — tags: `stable` (moving) and `sha-<git-sha>` (immutable per build)                            |
| CI/CD                | `.github/workflows/deploy.yml` (build → push → SSH `docker compose up`)                                                            |

Files that must exist on the VM under `/opt/idsms`:

```
/opt/idsms/
  docker-compose.yml      # committed copy, deployed by hand
  Caddyfile               # committed copy, <domain> filled in
  .env.production         # app runtime secrets — NEVER committed (see §4)
  .env                    # compose-only secrets — NEVER committed (see §4)
  backups/                # local staging area for §5 backups
```

---

## 2. Ownership and contacts

| Role                       | Who                                                                       | Holds / owns                                                                                                                                                                               |
| -------------------------- | ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Deployment owner**       | `<faculty advisor — FILL IN: name + institutional email>`                 | The GitHub repo admin rights, all repo Actions secrets, and the SSH **private** key used by the deploy workflow (`VM_SSH_PRIVATE_KEY`). Long-term custodian after the student team leaves. |
| **Infrastructure contact** | `<university IT contact — FILL IN: name/team + ticket queue>`             | The VM itself (provisioning, resize, console access, firewall), the DNS zone for `<domain>`, and cloud billing / snapshots.                                                                |
| **On-call / triage**       | `<department distribution list — FILL IN: e.g. idsms-ops@university.edu>` | Receives uptime-monitor alerts (§8). Must be a role/list address, **not** a graduating student's personal email.                                                                           |

Both placeholders above are intentionally unfilled. Do not deploy to production
until a named person owns each row.

---

## 3. Deploy and rollback

### 3.1 Normal deploy (after cutover)

Once `docs/migration/from-supabase.md` Stage 9 has re-enabled the `push:` trigger
in `deploy.yml`:

1. Merge the change to `main` (PR review as usual).
2. GitHub Actions runs **Deploy**: `validate` (full CI) → `build-and-push`
   (image tagged `sha-<sha>` **and** `stable`) → `deploy` (SSH to the VM,
   `docker compose --env-file .env.deploy pull app`, then `up -d --wait`).
3. `--wait` blocks on the `app` container healthcheck (`/api/health`). A failed
   healthcheck fails the workflow; the previous container keeps serving because
   Compose only swaps it once the new one is healthy.
4. Confirm: `curl -fsS https://<domain>/api/health` → `{"status":"ok"}`.

### 3.2 Manual deploy / roll forward to a chosen build

Until the `push:` trigger is enabled (and any time you want an explicit build):

1. GitHub → **Actions** → **Deploy** → **Run workflow**.
2. Leave `image_tag` blank to build and ship the current `main`.
3. Run, then confirm health as in 3.1 step 4.

### 3.3 Rollback

**Fast path (recommended — no rebuild):** SSH to the VM and re-point the running
stack at a known-good immutable tag.

```bash
ssh <VM_SSH_USER>@<VM_HOST>
cd /opt/idsms
# list what GHCR has, or read a prior green run's "build-and-push" log for its sha- tag
echo "IMAGE_TAG=sha-<prior-good-sha>" > .env.deploy
docker compose --env-file .env.deploy pull app
docker compose --env-file .env.deploy up -d --wait
curl -fsS http://localhost:3000/api/health   # {"status":"ok"}
```

**Workflow path:** GitHub → Actions → Deploy → Run workflow, set
`image_tag = sha-<prior-good-sha>`. Note: this **rebuilds the current checkout**
and republishes it under that tag name and `stable`. Prefer the fast path for a
true rollback to old _code_; use the workflow path only when the current `main`
is already the code you want and you just need a redeploy.

### 3.4 If a deploy leaves the stack unhealthy

```bash
cd /opt/idsms
docker compose ps                 # which container is unhealthy / restarting
docker compose logs --tail=200 app
docker compose up -d --wait       # re-converge
# still broken → roll back per 3.3 fast path
```

---

## 4. Secrets inventory and rotation

### 4.1 GitHub repo Actions secrets

Settings → Secrets and variables → Actions:

| Secret               | Purpose                                                                                                             |
| -------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `VM_HOST`            | VM public IP or DNS name the deploy job SSHes to.                                                                   |
| `VM_SSH_USER`        | Login user on the VM (a dedicated deploy account, member of the `docker` group, owner of `/opt/idsms`).             |
| `VM_SSH_PRIVATE_KEY` | Private half of the deploy key. Its **public** half is one line in `~<VM_SSH_USER>/.ssh/authorized_keys` on the VM. |

`GITHUB_TOKEN` is provided automatically and needs no management.

### 4.2 On the VM — `/opt/idsms/.env.production` (app runtime; `env_file:` for the `app` service)

```
DATABASE_URL="postgresql://idsms:<POSTGRES_PASSWORD>@postgres:5432/idsms"
DIRECT_URL="postgresql://idsms:<POSTGRES_PASSWORD>@postgres:5432/idsms"
NEXTAUTH_SECRET="<openssl rand -base64 32>"
NEXTAUTH_URL="https://<domain>"
STUDENT_DEFAULT_PASSWORD_PEPPER="<openssl rand -base64 32>"
MINIO_ENDPOINT="http://minio:9000"
MINIO_ACCESS_KEY="<app service-account access key>"
MINIO_SECRET_KEY="<app service-account secret key>"
MINIO_REGION="us-east-1"
GEMINI_API_KEY="<from Google AI Studio>"
RESEND_API_KEY="<from Resend dashboard>"
```

### 4.3 On the VM — `/opt/idsms/.env` (compose-only interpolation; **not** read by the app)

```
POSTGRES_PASSWORD=<must equal the password embedded in DATABASE_URL/DIRECT_URL>
MINIO_ROOT_USER=<minio admin user>
MINIO_ROOT_PASSWORD=<minio admin password, >= 8 chars>
IMAGE_TAG=stable
```

> **Known gap (tracked):** the deploy job runs
> `docker compose --env-file .env.deploy …` and writes `.env.deploy` with only
> `IMAGE_TAG`. Compose then ignores the default `.env`, so `POSTGRES_PASSWORD` /
> `MINIO_ROOT_*` are not interpolated during an automated deploy. Mitigations,
> pick one at cutover: (a) change the `deploy.yml` SSH script to
> `docker compose --env-file .env --env-file .env.deploy …` (Compose merges
> multiple env-files, last wins); or (b) export those three vars in the deploy
> user's environment. `postgres` and `minio` only read their credential vars at
> first-init, but `minio` re-reads `MINIO_ROOT_*` on every start, so leaving this
> unaddressed will break `minio` on the next container recreate.

### 4.4 Applying a secret change

- Edited `.env.production`: `cd /opt/idsms && docker compose up -d app`
  (recreates only `app` with the new environment).
- Edited `.env`: `cd /opt/idsms && docker compose up -d` (re-evaluates
  interpolation for every service).
- Changed a GitHub secret: nothing to do now; it takes effect on the next
  workflow run.

### 4.5 Rotation procedures

| Secret                                                        | How to rotate                                                                                                                                                                                                                                                                              | Impact                                                                                                                                                                                                                                                                                                                                                        |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `VM_SSH_PRIVATE_KEY`                                          | `ssh-keygen -t ed25519 -f idsms_deploy` locally. Append the `.pub` to `~<VM_SSH_USER>/.ssh/authorized_keys` on the VM. Update the GitHub secret with the new private key. Run **Deploy → Run workflow** to confirm SSH still works. Remove the old public-key line from `authorized_keys`. | None if verified before removing the old key.                                                                                                                                                                                                                                                                                                                 |
| `VM_HOST`, `VM_SSH_USER`                                      | Update the secret when the VM is rebuilt / the deploy user is renamed. Keep `/opt/idsms` layout identical on the new host.                                                                                                                                                                 | Next deploy targets the new host.                                                                                                                                                                                                                                                                                                                             |
| `POSTGRES_PASSWORD`                                           | `docker compose exec postgres psql -U idsms -d idsms -c "ALTER USER idsms WITH PASSWORD '<new>';"` → update `POSTGRES_PASSWORD` in `.env` **and** the password inside `DATABASE_URL`/`DIRECT_URL` in `.env.production` → `docker compose up -d`.                                           | Brief `app` restart. No data change.                                                                                                                                                                                                                                                                                                                          |
| `MINIO_ROOT_USER` / `MINIO_ROOT_PASSWORD`                     | Set new values in `.env` → `docker compose up -d minio minio-init`. These are **admin** credentials; the app should use a **separate** lower-privilege service account (next row), not root.                                                                                               | `minio` restarts.                                                                                                                                                                                                                                                                                                                                             |
| `MINIO_ACCESS_KEY` / `MINIO_SECRET_KEY` (app service account) | See §4.5.1 (detailed procedure).                                                                                                                                                                                                                                                           | Brief `app` restart. In-flight uploads retry.                                                                                                                                                                                                                                                                                                                 |
| `NEXTAUTH_SECRET`                                             | New value in `.env.production` → `docker compose up -d app`.                                                                                                                                                                                                                               | **Expected and acceptable:** every login session is dropped (users simply sign in again — DB session strategy) **and** every unexpired `/api/storage/download` link stops working, because `src/lib/storage.ts` HMAC-signs those links with this same key. Links regenerate automatically on the next page load. Do it outside class/report-submission hours. |
| `STUDENT_DEFAULT_PASSWORD_PEPPER`                             | **Do not rotate.** It is the HMAC pepper for default student passwords (FR-UM-03).                                                                                                                                                                                                         | Rotating it invalidates the login of **every student who still holds their un-reset default password**. Only ever change it as part of a deliberate migration that re-issues and re-communicates new default passwords to all affected students.                                                                                                              |
| `GEMINI_API_KEY`, `RESEND_API_KEY`                            | Rotate in the provider console, paste into `.env.production` → `docker compose up -d app`.                                                                                                                                                                                                 | Brief `app` restart; AI features / outbound email unavailable for a few seconds.                                                                                                                                                                                                                                                                              |

### 4.5.1 MinIO service-account key rotation (detailed procedure)

The app uses a **lower-privilege service account** (not the MinIO root) to access object storage.
To rotate the app's MinIO credentials:

1. **Generate new credentials:**

   ```bash
   docker compose exec minio mc alias set local http://localhost:9000 "$MINIO_ROOT_USER" "$MINIO_ROOT_PASSWORD"
   docker compose exec minio mc admin user svcacct add local "$MINIO_ROOT_USER"
   ```

   This prints `Access Key:` and `Secret Key:` to stdout. Copy both values.

   **Scriptable variant** (JSON output):

   ```bash
   docker compose exec minio mc admin user svcacct add --json local "$MINIO_ROOT_USER"
   ```

   Extract `accessKey` and `secretKey` from the JSON response.

2. **Update `.env.production`:**

   ```bash
   # Edit /opt/idsms/.env.production and set:
   MINIO_ACCESS_KEY="<new_access_key>"
   MINIO_SECRET_KEY="<new_secret_key>"
   ```

3. **Restart the app:**

   ```bash
   cd /opt/idsms && docker compose up -d --wait app
   ```

4. **Verify new credentials:**

   Upload and download a file through the app, or test via:

   ```bash
   docker compose exec app curl -fsSI http://minio:9000/checklist-documents/
   ```

5. **Retire the old service account:**

   ```bash
   docker compose exec minio mc admin user svcacct rm local <OLD_ACCESS_KEY>
   ```

**Fallback:** if you prefer to create a dedicated lower-privilege user instead of a service account,
see [`mc admin user add`](https://min.io/docs/minio/linux/reference/minio-mc-admin/mc-admin-user-add.html)
and [`mc admin policy attach`](https://min.io/docs/minio/linux/reference/minio-mc-admin/mc-admin-policy-attach.html)
in the MinIO documentation (scope the policy to the `checklist-documents` and `moa-documents` buckets).

---

## 5. Backups and restore

Three layers: nightly logical DB dump, nightly object-store mirror, weekly
whole-VM snapshot. The first two stage into `/opt/idsms/backups/` and are then
pushed **off the VM** (institutional object storage / OneDrive / Backblaze via
`rclone` — configure a remote named `offsite`).

### 5.1 Cron entries (`/etc/cron.d/idsms-backup`, runs as `<VM_SSH_USER>`)

```cron
# m  h  dom mon dow  user            command
30 2   *   *   *     <VM_SSH_USER>   cd /opt/idsms && docker compose exec -T postgres pg_dump -U idsms -Fc idsms > /opt/idsms/backups/db/idsms-$(date +\%Y\%m\%d).dump 2>> /opt/idsms/backups/backup.log && find /opt/idsms/backups/db -name 'idsms-*.dump' -mtime +14 -delete
45 2   *   *   *     <VM_SSH_USER>   docker run --rm --network idsms_net -v /opt/idsms/backups:/bk --entrypoint sh minio/mc:latest -c "mc alias set local http://minio:9000 $MINIO_ROOT_USER $MINIO_ROOT_PASSWORD && mc mirror --overwrite --remove local/checklist-documents /bk/minio/checklist-documents && mc mirror --overwrite --remove local/moa-documents /bk/minio/moa-documents" >> /opt/idsms/backups/backup.log 2>&1
15 3   *   *   *     <VM_SSH_USER>   rclone sync /opt/idsms/backups offsite:idsms-backups --backup-dir offsite:idsms-backups-history/$(date +\%F) >> /opt/idsms/backups/backup.log 2>&1
```

`MINIO_ROOT_USER` / `MINIO_ROOT_PASSWORD` must be present in the cron user's
environment (e.g. an `EnvironmentFile` if you convert these to systemd timers, or
`export`ed in the user's `~/.profile` and cron invoked via a login shell).

### 5.2 Weekly whole-VM snapshot

Schedule a **weekly** snapshot of the VM's boot/data disk from the cloud
provider's console or CLI; retain the last 4. This is the fallback when the VM
itself is lost. Confirm the schedule with `<university IT contact>`.

### 5.3 Restore — Postgres

```bash
cd /opt/idsms
docker compose stop app                       # stop writes
docker compose exec -T postgres dropdb   -U idsms --if-exists idsms
docker compose exec -T postgres createdb -U idsms idsms
docker compose exec -T postgres psql -U idsms -d idsms -c "CREATE EXTENSION IF NOT EXISTS vector;"
docker compose exec -T postgres pg_restore -U idsms -d idsms --no-owner --no-privileges < /opt/idsms/backups/db/idsms-YYYYMMDD.dump
# re-assert the append-only lock stripped by --no-privileges:
docker compose exec -T postgres psql -U idsms -d idsms -c "REVOKE UPDATE, DELETE ON audit_logs FROM PUBLIC;"
docker compose start app
curl -fsS http://localhost:3000/api/health
```

### 5.4 Restore — MinIO objects (reverse of the mirror)

```bash
docker run --rm --network idsms_net -v /opt/idsms/backups:/bk --entrypoint sh minio/mc:latest -c "\
  mc alias set local http://minio:9000 $MINIO_ROOT_USER $MINIO_ROOT_PASSWORD && \
  mc mirror --overwrite /bk/minio/checklist-documents local/checklist-documents && \
  mc mirror --overwrite /bk/minio/moa-documents      local/moa-documents"
```

If restoring from the off-site copy, `rclone copy offsite:idsms-backups
/opt/idsms/backups` first.

### 5.5 Restore drill

Once a term, restore the latest dump into a throwaway database
(`createdb -U idsms idsms_drill` + `pg_restore -d idsms_drill`) and spot-check
row counts. An untested backup is not a backup.

---

## 6. Health and triage

**Green:** `curl -fsS https://<domain>/api/health` returns `{"status":"ok"}`.

**Not green:**

```bash
ssh <VM_SSH_USER>@<VM_HOST>
cd /opt/idsms
docker compose ps                     # state + health of all four containers
docker compose logs -f app            # app errors (DB unreachable, bad env, crash loop)
docker compose logs --tail=100 postgres
docker compose logs --tail=100 caddy  # TLS / ACME / upstream errors
```

Common resolutions:

| Symptom                                            | Action                                                                                                              |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `app` unhealthy, logs show DB connection errors    | `docker compose ps postgres`; if down/unhealthy, `docker compose up -d postgres` then `docker compose restart app`. |
| `app` healthy locally but `https://<domain>` fails | Check `caddy` logs for cert/ACME issues; confirm DNS still points at the VM; `docker compose restart caddy`.        |
| Everything "up" but 502 from Caddy                 | `docker compose restart app`; if it crash-loops, roll back (§3.3 fast path).                                        |
| Disk full (dumps, images)                          | `docker system prune -f`; check `/opt/idsms/backups` size; verify `rclone` off-site sync is running.                |
| Total confusion                                    | `docker compose up -d --wait` to force re-converge; then roll back if still bad.                                    |

---

## 7. OS patching and reboots

All commands in this section run as root — prefix with `sudo` or run in a root shell.

1. Enable unattended security updates:

   ```bash
   sudo apt-get install -y unattended-upgrades
   sudo dpkg-reconfigure -plow unattended-upgrades
   ```

2. In `/etc/apt/apt.conf.d/50unattended-upgrades`:

   ```
   Unattended-Upgrade::Automatic-Reboot "true";
   Unattended-Upgrade::Automatic-Reboot-Time "03:30";
   ```

3. Ensure Docker starts on boot: `sudo systemctl enable docker`.

All four containers are `restart: unless-stopped`, so after the ~03:30 reboot
window Docker brings the whole stack back up with no human action. Confirm the
morning after a reboot with the §6 health check.

---

## 8. Uptime monitoring

- Configure an **external** monitor (UptimeRobot, Better Stack, healthchecks.io,
  Pingdom, or the institution's own monitoring) — not something running on the
  same VM.
- Check: HTTP `GET https://<domain>/api/health`, every 1–5 minutes, expect
  HTTP `200` and body containing `"status":"ok"`.
- Alert destination: `<department distribution list — FILL IN>`. This must be a
  faculty/department role address or ticket queue. **Do not** use a graduating
  student's personal email — it will stop being monitored the moment they leave.
- Optional second check on `https://<domain>/` for full-page reachability.

---

## 9. Routine command reference

```bash
cd /opt/idsms
docker compose ps                     # status
docker compose logs -f app            # follow app logs
docker compose restart app            # bounce the app only
docker compose up -d --wait           # apply compose/env changes, wait for health
docker compose pull app && docker compose up -d --wait   # manual image refresh
docker compose exec postgres psql -U idsms -d idsms       # DB shell
docker compose down                   # stop all (volumes kept)
docker compose down -v                # stop all AND DELETE DATA volumes — never in prod
```
