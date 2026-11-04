-- SLU's Journal on Learning Experience (JLE): one narrative per intern per month,
-- written by the intern and not noted by the supervisor (OJT Documentation Guidelines).
-- Also the intern's office/department, which the JLE and the technical report print.
-- After 001-020. Additive: one table and one nullable column. Idempotent. RLS on with
-- no policies (default-deny, as 002), since the app connects as postgres.

create table if not exists learning_journals (
  id uuid primary key default gen_random_uuid(),
  student_profile_id uuid not null references student_profiles(id),
  month text not null check (month ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  narrative text not null default '' check (char_length(narrative) <= 20000),
  updated_at timestamptz(3) not null default now(),
  unique (student_profile_id, month)
);

alter table learning_journals enable row level security;

alter table student_profiles
  add column if not exists office text check (char_length(office) <= 150);
