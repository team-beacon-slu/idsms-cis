-- Company placement history and SAMCIS's company visits (SLU Internship Program guidelines).
-- 1. company_placements: one row per intern per host company, from joining to leaving. An
--    intern stops through a notification of retraction (filed by the intern, noted by
--    SAMCIS), which ends the placement and frees them to join another company (transfer).
--    Backfilled from each intern's current company.
-- 2. company_visits: the company visit SAMCIS conducts before the internship ends.
-- After 001-024. Additive and idempotent. RLS on with no policies (as 002).

create table if not exists company_placements (
  id uuid primary key default gen_random_uuid(),
  student_profile_id uuid not null references student_profiles(id),
  company_id uuid not null references companies(id),
  position_title text,
  started_on date not null,
  ended_on date,
  end_reason text check (end_reason in ('RETRACTED', 'COMPLETED')),
  -- The notification of retraction: filed by the intern, noted by SAMCIS.
  retraction_last_day date,
  retraction_reason text check (char_length(retraction_reason) <= 2000),
  retraction_filed_at timestamptz(3),
  retraction_noted_at timestamptz(3),
  retraction_noted_by uuid references users(id),
  created_at timestamptz(3) not null default now()
);
create index if not exists company_placements_student_idx on company_placements (student_profile_id);
create index if not exists company_placements_company_idx on company_placements (company_id);
-- At most one open placement per intern.
create unique index if not exists company_placements_one_open
  on company_placements (student_profile_id) where ended_on is null;
alter table company_placements enable row level security;

insert into company_placements (student_profile_id, company_id, position_title, started_on)
select sp.id, sp.company_id, sp.position_title,
       coalesce(sp.internship_start_date::date, sp.created_at::date)
from student_profiles sp
where sp.company_id is not null
  and not exists (select 1 from company_placements p where p.student_profile_id = sp.id);

create table if not exists company_visits (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id),
  visited_on date not null,
  visited_by uuid not null references users(id),
  mode text not null default 'ON_SITE' check (mode in ('ON_SITE', 'ONLINE')),
  notes text check (char_length(notes) <= 4000),
  created_at timestamptz(3) not null default now()
);
create index if not exists company_visits_company_idx on company_visits (company_id);
alter table company_visits enable row level security;
