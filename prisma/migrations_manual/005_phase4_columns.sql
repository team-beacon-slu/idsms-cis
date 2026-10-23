-- Phase 4: additive, nullable columns only — safe on a populated database,
-- no backfill. Nullable columns without a default are a metadata-only change
-- (no table rewrite). Run once in the Supabase SQL editor (or `npx prisma
-- db push` from a machine with DIRECT_URL set), after 001–004. Idempotent.
alter table daily_report_entries add column if not exists time_in text;
alter table daily_report_entries add column if not exists time_out text;
alter table notifications        add column if not exists read_at timestamptz;
alter table student_profiles     add column if not exists full_name text;
alter table companies            add column if not exists supervisor_position text;

-- Defense in depth behind the zod validator: times are 24-hour "HH:MM".
-- Postgres has no ADD CONSTRAINT IF NOT EXISTS, hence the DO block.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'daily_report_entries_time_in_format'
      and conrelid = 'public.daily_report_entries'::regclass
  ) then
    alter table daily_report_entries
      add constraint daily_report_entries_time_in_format
      check (time_in is null or time_in ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$');
  end if;
  if not exists (
    select 1 from pg_constraint
    where conname = 'daily_report_entries_time_out_format'
      and conrelid = 'public.daily_report_entries'::regclass
  ) then
    alter table daily_report_entries
      add constraint daily_report_entries_time_out_format
      check (time_out is null or time_out ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$');
  end if;
end $$;
