-- Roadmap backlog (Nov 2026): department events the coordinator posts (orientation, seminars,
-- deadlines that are not weekly reports). Shown on every intern's, adviser's and the
-- coordinator's calendar for the semester. Informational only: not a day off, no effect on
-- hours. After 001-029. Additive; safe to re-run.
create table if not exists public.department_events (
  id          uuid primary key default gen_random_uuid(),
  semester_id uuid not null references public.semesters(id),
  date        timestamp(3) not null,
  title       text not null,
  created_by  uuid references public.users(id),
  created_at  timestamp(3) not null default current_timestamp
);
create index if not exists department_events_semester_id_date_idx
  on public.department_events (semester_id, date);
create index if not exists department_events_created_by_idx on public.department_events (created_by);
alter table public.department_events enable row level security;
