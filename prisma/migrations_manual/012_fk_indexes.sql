-- Audit 2026-10-22: Postgres does not index foreign keys on its own. These back
-- the per-intern lookups (time requests, daily entries), the faculty "waiting for
-- review" count, force-logout and the audit-log filter. Additive; safe to re-run.
-- Apply after Jay's OK, after 001–011. Tables are small, so no CONCURRENTLY.
create index if not exists deviation_reports_student_profile_id_validation_status_idx
  on deviation_reports (student_profile_id, validation_status);
create index if not exists audit_logs_user_id_idx on audit_logs (user_id);
create index if not exists daily_report_entries_weekly_report_id_idx
  on daily_report_entries (weekly_report_id);
create index if not exists sessions_user_id_idx on sessions (user_id);
