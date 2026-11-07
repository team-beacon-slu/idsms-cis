-- Roadmap backlog (Nov 2026): notification email preference per user. Off = notices stay in
-- the bell and inbox only; email-only messages (a password reset) still send. After 001-030.
-- Additive; safe to re-run.
alter table public.users add column if not exists email_notifications boolean not null default true;
