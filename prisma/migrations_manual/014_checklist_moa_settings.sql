-- Checklist & MOA settings (Phase 4, last item). Additive. Apply after 013, in TWO runs:
-- Postgres cannot use a new enum value in the transaction that added it.

-- Run 1
alter type "ChecklistRequirementType" add value if not exists 'PROOF_OF_CORPORATE_LEGITIMACY';
alter type "ChecklistRequirementType" add value if not exists 'INTERNSHIP_AGREEMENT';
alter table companies add column if not exists is_foreign boolean not null default false;
alter table student_profiles add column if not exists start_before_moa_allowed boolean not null default false;
alter table student_profiles add column if not exists start_before_moa_reason text;
alter table student_profiles add column if not exists start_before_moa_by uuid references users(id);
alter table student_profiles add column if not exists start_before_moa_at timestamptz;

-- Run 2: give every existing intern a row for the two new items (new imports get them already).
insert into pre_deployment_checklist_items (id, student_profile_id, requirement_type, updated_at)
select gen_random_uuid(), p.id, t, now()
from student_profiles p
cross join unnest(array['PROOF_OF_CORPORATE_LEGITIMACY', 'INTERNSHIP_AGREEMENT']::"ChecklistRequirementType"[]) t
on conflict (student_profile_id, requirement_type) do nothing;
