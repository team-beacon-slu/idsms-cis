-- Company view (docs/plans/ai-assist-plan.md §10): the intern's evaluation of
-- their host company, once all required hours are confirmed, and the
-- coordinator's record of the company's reply (CMO 104 feedback mechanism).
-- Apply ONLY after Jay's OK, after 001–018. Additive: one new table and three
-- nullable columns, no change to existing data. Idempotent. RLS on with no
-- policies (default-deny, as 002), since the app connects as postgres.

create table if not exists company_evaluations (
  id uuid primary key default gen_random_uuid(),
  student_profile_id uuid not null unique references student_profiles(id), -- one per intern
  company_id uuid not null references companies(id),
  supervision smallint not null check (supervision between 1 and 5),
  learning smallint not null check (learning between 1 and 5),
  safety smallint not null check (safety between 1 and 5),
  communication smallint not null check (communication between 1 and 5),
  integration smallint not null check (integration between 1 and 5),
  resources smallint not null check (resources between 1 and 5),
  recommend smallint not null check (recommend between 1 and 5),
  comment text check (char_length(comment) <= 1000),
  created_at timestamptz(3) not null default now()
);
create index if not exists company_evaluations_company_id_idx on company_evaluations (company_id);

alter table company_evaluations enable row level security;

alter table companies
  add column if not exists hte_reply text check (char_length(hte_reply) <= 2000),
  add column if not exists hte_reply_at timestamptz(3),
  add column if not exists hte_reply_by uuid;
