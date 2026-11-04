-- SLU Technical Report outline: the work assessment and self-assessment ratings
-- ({ work: [10], others: [{label, rating}], supervisorGuidance, coworkers, self: [10] },
-- each 1-4), kept beside the written parts in sections. After 001-022. Additive and
-- idempotent. The written parts change keys inside the sections JSON, no column change.

alter table final_technical_reports
  add column if not exists assessment jsonb not null default '{}'::jsonb;
