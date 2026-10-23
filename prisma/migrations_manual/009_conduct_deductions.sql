-- Workstream L2 (conduct records, deduction matrix exceptions).
-- Apply ONLY after Jay's OK, after 001–008. Additive: two new tables, no
-- change to existing data. Idempotent. RLS on with no policies (default-deny,
-- as 002), since the app connects as postgres and enforces access itself.

create table if not exists conduct_records (
  id uuid primary key default gen_random_uuid(),
  student_profile_id uuid not null references student_profiles(id),
  category_key text not null,
  weight integer not null default 1 check (weight in (1, 2)),
  date timestamp(3) not null,
  reason text not null,
  hours_deducted decimal(4, 2) not null default 0 check (hours_deducted between 0 and 40),
  issued_by_id uuid not null,
  created_at timestamptz(3) not null default now(),
  revoked_at timestamptz(3),
  revoked_by_id uuid,
  revoke_reason text
);
create index if not exists conduct_records_student_profile_id_idx on conduct_records (student_profile_id);

create table if not exists deduction_exceptions (
  id uuid primary key default gen_random_uuid(),
  student_profile_id uuid not null references student_profiles(id),
  item_type text not null check (item_type in ('LATE_WWR', 'MISSING_WWR', 'UNSUPPORTED_UT')),
  item_key text not null,
  reason_code text not null check (reason_code in ('HTE_ATTESTED_DOCUMENTATION', 'BEYOND_INTERN_CONTROL')),
  note text not null,
  created_by_id uuid not null,
  created_at timestamptz(3) not null default now(),
  withdrawn_at timestamptz(3),
  withdrawn_by_id uuid
);
create index if not exists deduction_exceptions_student_profile_id_idx on deduction_exceptions (student_profile_id);
-- One active excuse per item; a withdrawn one can be replaced.
create unique index if not exists deduction_exceptions_one_active
  on deduction_exceptions (student_profile_id, item_type, item_key)
  where withdrawn_at is null;

alter table conduct_records enable row level security;
alter table deduction_exceptions enable row level security;
