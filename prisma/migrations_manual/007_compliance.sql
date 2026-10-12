-- Manual migration 007 — Phase 4 Workstream G. Run once in the Supabase SQL
-- editor AFTER `prisma db push`. Idempotent.

-- 1. NFR-SEC-10: audit_logs append-only for EVERY role. The app connects as
--    `postgres` (table owner, BYPASSRLS), so 001's RLS policies never apply to
--    it. Triggers fire regardless of RLS bypass.
CREATE OR REPLACE FUNCTION audit_logs_append_only() RETURNS trigger
LANGUAGE plpgsql AS $$
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

-- 2. Tables created by `prisma db push`; this block only guarantees indexes
--    and default-deny RLS (NFR-SEC-11) if they were created another way.
ALTER TABLE IF EXISTS data_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS retention_flags ENABLE ROW LEVEL SECURITY;

-- One OPEN data request per user, enforced by the database. Prisma cannot express
-- partial indexes, so (like the IN_APP notification dedupe index in 006) it lives
-- only here. createDataRequest maps the resulting P2002 to a friendly 409.
CREATE UNIQUE INDEX IF NOT EXISTS data_requests_one_open_per_user
  ON data_requests (user_id) WHERE status = 'OPEN';

-- 3. Verification (run manually, expect both statements to fail):
-- BEGIN;
--   UPDATE audit_logs SET action = action WHERE id = (SELECT id FROM audit_logs LIMIT 1);
-- ROLLBACK;
-- BEGIN;
--   DELETE FROM audit_logs WHERE id = (SELECT id FROM audit_logs LIMIT 1);
-- ROLLBACK;
