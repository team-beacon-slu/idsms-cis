-- Manual migration — run once against the real Supabase project (SQL editor,
-- or via the Supabase MCP's apply_migration). Not auto-applied by Prisma —
-- Prisma has no way to express RLS at all, same reasoning as 001.
--
-- Enables RLS with NO policies on every table except audit_logs (which
-- already has its own append-only policy set from 001). Default-deny per
-- NFR-SEC-11 / the Phase 1 plan's RLS scope decision: Prisma always connects
-- as the postgres/service role, which bypasses RLS entirely, so this does not
-- (and cannot) enforce per-role access for real app traffic — that's 100%
-- app-layer (middleware + userService.assertCanAccessStudent). What this DOES
-- do is close the literal hole get_advisors flags: today every one of these
-- tables is fully exposed to the anon/authenticated Supabase client-library
-- roles if that key ever leaks, since Postgres has no owner-only default.
-- Enabling RLS with zero policies makes every row inaccessible to anon/
-- authenticated by default (only the service role - and superusers - still
-- see everything, since RLS never applies to them).
--
-- Table list confirmed via list_tables immediately before writing this file
-- (20 tables total; audit_logs excluded here since 001 already covers it).

ALTER TABLE accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE student_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE class_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE faculty_class_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE semesters ENABLE ROW LEVEL SECURITY;
ALTER TABLE companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE moa_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE pre_deployment_checklist_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE work_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE weekly_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_report_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE deviation_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE generated_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE holiday_calendar ENABLE ROW LEVEL SECURITY;
ALTER TABLE system_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE password_reset_tokens ENABLE ROW LEVEL SECURITY;
