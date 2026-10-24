-- FR-AT-02: a host company's own non-working days (Chinese New Year at a Chinese company,
-- Thanksgiving at a US one, an anniversary), shared by every intern placed there.
-- Additive and nullable: existing PH holidays and per-intern opt-outs are untouched. Apply after 016.
alter type "HolidayType" add value if not exists 'COMPANY';

alter table holiday_calendar
  add column if not exists company_id uuid references companies (id),
  add column if not exists created_by uuid references users (id);

create index if not exists holiday_calendar_company_id_idx on holiday_calendar (company_id);
create index if not exists holiday_calendar_created_by_idx on holiday_calendar (created_by);
