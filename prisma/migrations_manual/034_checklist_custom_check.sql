-- Panel revisions (final defense, Nov 2026), second run of 033: a CUSTOM checklist row
-- always names its custom requirement, and a built-in row never does. Kept in its own file
-- because it uses the enum value 'CUSTOM' that 033 adds (Postgres refuses a new enum value
-- in the transaction that added it). After 033. Safe to re-run.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'pre_deployment_checklist_items_custom_check'
  ) then
    alter table public.pre_deployment_checklist_items
      add constraint pre_deployment_checklist_items_custom_check
      check ((requirement_type = 'CUSTOM') = (custom_requirement_id is not null));
  end if;
end $$;
