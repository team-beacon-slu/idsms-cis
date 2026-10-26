-- AI assist platform (docs/plans/ai-assist-plan.md R1, R2, step 6): a per-person
-- "AI assist" switch, advisers' Correct / Not right ratings that switch a job off,
-- and the per-report hints the nightly job caches (similar day, tone quote,
-- summary quotes, plan coverage). Apply after 001–019. Additive and idempotent:
-- one table, two columns, no change to existing data. RLS on with no policies
-- (default-deny, as 002), since the app connects as postgres.

alter table users add column if not exists ai_assist boolean not null default true;

alter table weekly_reports add column if not exists ai_hints jsonb;

create table if not exists ai_feedback (
  id uuid primary key default gen_random_uuid(),
  job text not null check (char_length(job) <= 40),
  target_id text not null check (char_length(target_id) <= 200), -- the hint rated
  user_id uuid not null references users(id),
  correct boolean not null,
  created_at timestamptz(3) not null default now(),
  unique (job, target_id, user_id) -- re-rating replaces the earlier vote
);
create index if not exists ai_feedback_job_created_idx on ai_feedback (job, created_at desc);
create index if not exists ai_feedback_user_id_idx on ai_feedback (user_id);

alter table ai_feedback enable row level security;
