-- The intern's company evaluation becomes SLU's own form, FM-VAA-052 (VPAA, 7 Aug 2024):
-- 16 CMO 104 obligations rated 4 (advanced) to 1 (low implementation), 6 internship-quality
-- items rated 4 (highly satisfactory) to 1 (not satisfactory), and comments A-C (comment
-- is C). Replaces 019's seven 1-5 criteria. After 001-021. The beta had no evaluations
-- when this was written (26 Oct 2026); any rows on another database are dropped first,
-- since 1-5 research ratings cannot be mapped onto VPAA's items. Idempotent.

do $$
begin
  if exists (select 1 from information_schema.columns
             where table_name = 'company_evaluations' and column_name = 'supervision') then
    delete from company_evaluations; -- old 1-5 rows only: this runs before the columns change
  end if;
end $$;

alter table company_evaluations
  drop column if exists supervision,
  drop column if exists learning,
  drop column if exists safety,
  drop column if exists communication,
  drop column if exists integration,
  drop column if exists resources,
  drop column if exists recommend,
  add column if not exists obligations smallint[] not null
    check (array_length(obligations, 1) = 16 and 1 <= all(obligations) and 4 >= all(obligations)),
  add column if not exists quality smallint[] not null
    check (array_length(quality, 1) = 6 and 1 <= all(quality) and 4 >= all(quality)),
  add column if not exists liked text check (char_length(liked) <= 1000),
  add column if not exists improve text check (char_length(improve) <= 1000);
