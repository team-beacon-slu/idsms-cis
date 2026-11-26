-- Panel revisions (final defense, Nov 2026): requirements the coordinator or Super Admin
-- adds to the pre-deployment checklist beyond the built-in types. A custom item is a
-- checklist row with requirement_type 'CUSTOM' and custom_requirement_id set. Retired
-- requirements stay (active = false) so approved items keep their history.
-- After 001-032. Safe to re-run. Apply this file, then 034 as a SEPARATE run: Postgres
-- cannot use the new enum value 'CUSTOM' in the transaction that added it.

alter type "ChecklistRequirementType" add value if not exists 'CUSTOM';

create table if not exists public.checklist_custom_requirements (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  description text,
  programs    "Program"[] not null default '{}', -- empty = every program
  required    boolean not null default true,
  active      boolean not null default true,
  created_by  uuid references public.users(id),
  created_at  timestamptz(3) not null default current_timestamp
);
create index if not exists checklist_custom_requirements_created_by_idx
  on public.checklist_custom_requirements (created_by);
alter table public.checklist_custom_requirements enable row level security;

alter table public.pre_deployment_checklist_items
  add column if not exists custom_requirement_id uuid
  references public.checklist_custom_requirements(id);
create index if not exists pre_deployment_checklist_items_custom_requirement_id_idx
  on public.pre_deployment_checklist_items (custom_requirement_id);

-- One row per built-in type, and one per custom requirement, for each intern. Replaces the
-- old (student, type) unique index, which would allow only one custom row per intern.
create unique index if not exists pre_deployment_checklist_items_builtin_key
  on public.pre_deployment_checklist_items (student_profile_id, requirement_type)
  where custom_requirement_id is null;
create unique index if not exists pre_deployment_checklist_items_custom_key
  on public.pre_deployment_checklist_items (student_profile_id, custom_requirement_id)
  where custom_requirement_id is not null;
alter table public.pre_deployment_checklist_items
  drop constraint if exists pre_deployment_checklist_items_student_profile_id_requirement_type_key;
drop index if exists public.pre_deployment_checklist_items_student_profile_id_requirement_type_key;
