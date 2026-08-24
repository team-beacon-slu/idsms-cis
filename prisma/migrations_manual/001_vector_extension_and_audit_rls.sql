-- Manual migration — run once in the Supabase SQL editor against a real project,
-- AFTER `prisma db push` (this ALTERs daily_report_entries and audit_logs, which
-- only exist once Prisma has created them — running this first will fail with
-- "relation does not exist"). Not auto-applied; Prisma has no way to express
-- either of these (a Postgres extension, or an RLS policy with no allowed
-- UPDATE/DELETE) even after the tables exist.

-- 1. pgvector extension (required for daily_report_entries.embeddingVector,
--    queried via $queryRaw in aiService.ts — see prisma/schema.prisma comment
--    on DailyReportEntry).
CREATE EXTENSION IF NOT EXISTS vector;

ALTER TABLE daily_report_entries
  ADD COLUMN IF NOT EXISTS embedding_vector vector(768); -- Gemini text-embedding-004 dimension

-- 2. Append-only RLS on audit_logs (NFR-SEC-10). Must block UPDATE and DELETE for
--    every role, including the service role — audit_logs is meant to be tamper-proof
--    even from the app's own privileged connection.
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY audit_logs_insert_only ON audit_logs
  FOR INSERT
  WITH CHECK (true);

CREATE POLICY audit_logs_select_all ON audit_logs
  FOR SELECT
  USING (true);

-- Deliberately no UPDATE or DELETE policy exists for any role — RLS defaults to
-- deny when no policy matches, so this makes the table append-only by omission.
-- Do not add UPDATE/DELETE policies later without revisiting NFR-SEC-10.
REVOKE UPDATE, DELETE ON audit_logs FROM PUBLIC;
