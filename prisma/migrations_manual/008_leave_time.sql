-- Workstream L1 (leave & time requests, SLU weekly report, credited hours).
-- Apply ONLY after Jay's OK, in the Supabase SQL editor, after 001–007.
-- Additive and nullable only: no data loss, no backfill, no table rewrite.
-- Idempotent. Do not use `prisma db push` (it would touch 001's vector
-- column and 006's indexes).

do $$
begin
  if not exists (select 1 from pg_type where typname = 'RequestKind') then
    create type "RequestKind" as enum ('ANTICIPATED', 'EMERGENCY');
  end if;
  if not exists (select 1 from pg_type where typname = 'ProofType') then
    create type "ProofType" as enum ('MEDICAL_CERTIFICATE', 'PROOF_OF_LEAVE', 'WRITTEN_NOTICE');
  end if;
end $$;

alter table daily_report_entries add column if not exists time_in_2 text;
alter table daily_report_entries add column if not exists time_out_2 text;
alter table daily_report_entries add column if not exists credited_hours decimal(4, 2);

alter table deviation_reports add column if not exists request_kind "RequestKind";
alter table deviation_reports add column if not exists end_date timestamp(3);
alter table deviation_reports add column if not exists start_time text;
alter table deviation_reports add column if not exists end_time text;
alter table deviation_reports add column if not exists requested_minutes integer;
alter table deviation_reports add column if not exists proof_type "ProofType";
alter table deviation_reports add column if not exists review_note text;
alter table deviation_reports add column if not exists submitted_at timestamptz(3);
alter table deviation_reports add column if not exists updated_at timestamptz(3);

alter table semesters add column if not exists week_one_start timestamp(3);

-- Same HH:MM guard as 005 for the second range.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'daily_report_entries_time_in_2_format'
      and conrelid = 'public.daily_report_entries'::regclass
  ) then
    alter table daily_report_entries
      add constraint daily_report_entries_time_in_2_format
      check (time_in_2 is null or time_in_2 ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$');
  end if;
  if not exists (
    select 1 from pg_constraint
    where conname = 'daily_report_entries_time_out_2_format'
      and conrelid = 'public.daily_report_entries'::regclass
  ) then
    alter table daily_report_entries
      add constraint daily_report_entries_time_out_2_format
      check (time_out_2 is null or time_out_2 ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$');
  end if;
end $$;
