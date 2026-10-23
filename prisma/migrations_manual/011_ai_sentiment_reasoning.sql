-- Phase 4 Workstream D: FR-AI-03 "brief reasoning". Additive, nullable.
-- Apply after Jay's OK, after 001–010. The embedding column
-- (daily_report_entries.embedding_vector vector(768)) is from 001 and was
-- added to the dev DB on 2026-10-21.
alter table weekly_reports add column if not exists sentiment_reasoning text;
