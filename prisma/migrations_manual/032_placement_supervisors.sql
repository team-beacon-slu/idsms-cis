-- Panel revisions (final defense, Nov 2026): an intern's change of supervisor during a
-- placement, dated. The supervisor in force on a date is the latest row on or before it,
-- else the company's own supervisor. Weekly reports print the supervisor of their week.
-- After 001-031. Additive; safe to re-run.
create table if not exists public.placement_supervisors (
  id                  uuid primary key default gen_random_uuid(),
  placement_id        uuid not null references public.company_placements(id),
  supervisor_name     text not null,
  supervisor_position text,
  supervisor_contact  text not null,
  effective_from      date not null,
  created_by          uuid references public.users(id),
  created_at          timestamptz(3) not null default current_timestamp
);
create index if not exists placement_supervisors_placement_id_effective_from_idx
  on public.placement_supervisors (placement_id, effective_from);
create index if not exists placement_supervisors_created_by_idx
  on public.placement_supervisors (created_by);
alter table public.placement_supervisors enable row level security;
