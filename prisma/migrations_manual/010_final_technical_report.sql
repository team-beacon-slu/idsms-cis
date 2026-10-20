-- Workstream H (Final Technical Report, PRD Module 7).
-- Apply ONLY after Jay's OK, after 001–009. Additive; idempotent. RLS on with
-- no policies (default-deny, as 002).

alter type "DocumentType" add value if not exists 'FINAL_TECHNICAL_REPORT';

do $$
begin
  if not exists (select 1 from pg_type where typname = 'FinalReportStatus') then
    create type "FinalReportStatus" as enum ('DRAFT', 'SUBMITTED', 'APPROVED', 'RETURNED');
  end if;
end $$;

create table if not exists final_technical_reports (
  id uuid primary key default gen_random_uuid(),
  student_profile_id uuid not null unique references student_profiles(id),
  status "FinalReportStatus" not null default 'DRAFT',
  sections jsonb not null default '{}',
  supervisor_score decimal(5, 2),
  supervisor_scale integer,
  peer_score decimal(5, 2),
  peer_scale integer,
  attachments jsonb not null default '{}',
  review_note text,
  submitted_at timestamptz(3),
  reviewed_at timestamptz(3),
  reviewed_by_id uuid,
  created_at timestamptz(3) not null default now(),
  updated_at timestamptz(3) not null default now()
);

alter table final_technical_reports enable row level security;
