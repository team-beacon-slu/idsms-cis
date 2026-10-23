-- Manual migration 007 — Phase 4 Workstream G. Run in the Supabase SQL editor.
-- Idempotent.
--
-- ROLLOUT ORDER
--   * Apply 007 immediately after `prisma db push` and BEFORE deploying this
--     branch (the app relies on the partial unique index and the append-only
--     trigger below).
--   * Re-run 007 after any future `prisma db push`: db push may drop indexes it
--     does not know about (the partial unique index here, like 006's).
--   * Before creating the partial unique index on a database where data_requests
--     already has rows, check there are no duplicate OPEN rows per user, or the
--     CREATE UNIQUE INDEX below will fail:
--       SELECT user_id, count(*) FROM data_requests
--        WHERE status = 'OPEN' GROUP BY user_id HAVING count(*) > 1;
--
-- CONSEQUENCE FOR USER DELETION
--   Hard-deleting a `users` row now FAILS: audit_logs.user_id is ON DELETE SET
--   NULL, and that implicit UPDATE is blocked by the append-only trigger. The app
--   only soft-deletes users (isActive = false). Do NOT relax the trigger to make
--   a hard delete work.

-- 1. NFR-SEC-10: audit_logs append-only for EVERY role. The app connects as
--    `postgres` (table owner, BYPASSRLS), so 001's RLS policies never apply to
--    it. Triggers fire regardless of RLS bypass.
CREATE OR REPLACE FUNCTION audit_logs_append_only() RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  RAISE EXCEPTION 'audit_logs is append-only (NFR-SEC-10)'
    USING ERRCODE = 'insufficient_privilege';
END;
$$;

DROP TRIGGER IF EXISTS audit_logs_no_update_delete ON audit_logs;
CREATE TRIGGER audit_logs_no_update_delete
  BEFORE UPDATE OR DELETE ON audit_logs
  FOR EACH ROW EXECUTE FUNCTION audit_logs_append_only();

DROP TRIGGER IF EXISTS audit_logs_no_truncate ON audit_logs;
CREATE TRIGGER audit_logs_no_truncate
  BEFORE TRUNCATE ON audit_logs
  FOR EACH STATEMENT EXECUTE FUNCTION audit_logs_append_only();

-- 2. Default-deny RLS (NFR-SEC-11) on the new tables. The tables and their
--    regular indexes are created by `prisma db push`; this step only enables RLS.
ALTER TABLE IF EXISTS data_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS retention_flags ENABLE ROW LEVEL SECURITY;

-- One OPEN data request per user, enforced by the database. Prisma cannot express
-- partial indexes, so (like the IN_APP notification dedupe index in 006) it lives
-- only here. createDataRequest maps the resulting P2002 to a friendly 409.
CREATE UNIQUE INDEX IF NOT EXISTS data_requests_one_open_per_user
  ON data_requests (user_id) WHERE status = 'OPEN';

-- 3. Verification (run manually, each in its own transaction).
-- UPDATE and DELETE must fail:
-- BEGIN;
--   UPDATE audit_logs SET action = action WHERE id = (SELECT id FROM audit_logs LIMIT 1);
-- ROLLBACK;
-- BEGIN;
--   DELETE FROM audit_logs WHERE id = (SELECT id FROM audit_logs LIMIT 1);
-- ROLLBACK;
-- TRUNCATE must fail:
-- BEGIN;
--   TRUNCATE audit_logs;
-- ROLLBACK;
-- INSERT must succeed (append-only still allows appends); the ROLLBACK discards the probe row:
-- BEGIN;
--   INSERT INTO audit_logs (id, action, entity_type)
--     VALUES (gen_random_uuid(), 'MIGRATION_007_PROBE', 'Probe');
-- ROLLBACK;
