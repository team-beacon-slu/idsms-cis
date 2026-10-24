-- Go-live item 5: an intern disputes a deduction (an automatic item or a
-- conduct record); staff accept it (by excusing or revoking) or decline it
-- with a note. Apply ONLY after Jay's OK, after 001–017. Additive: one new
-- table, no change to existing data. Idempotent. RLS on with no policies
-- (default-deny, as 002), since the app connects as postgres.

create table if not exists deduction_disputes (
  id uuid primary key default gen_random_uuid(),
  student_profile_id uuid not null references student_profiles(id),
  item_type text not null check (item_type in ('LATE_WWR', 'MISSING_WWR', 'UNSUPPORTED_UT', 'CONDUCT')),
  item_key text not null, -- week start / day (automatic items) or conduct record id
  reason text not null,
  created_at timestamptz(3) not null default now(),
  resolved_at timestamptz(3),
  resolved_by_id uuid,
  outcome text check (outcome in ('ACCEPTED', 'DECLINED')),
  resolution_note text,
  check ((resolved_at is null) = (outcome is null))
);
create index if not exists deduction_disputes_student_profile_id_idx on deduction_disputes (student_profile_id);
-- One open dispute per item; after a decline the intern may dispute again.
create unique index if not exists deduction_disputes_one_open
  on deduction_disputes (student_profile_id, item_type, item_key)
  where resolved_at is null;

alter table deduction_disputes enable row level security;
