-- Safety limits for the role the app connects as (performance plan, Phase 0).
-- One slow query or a transaction left open can no longer hold a connection, and the
-- pool, forever. Applies to new sessions; pooled connections pick it up as they recycle.
--
-- Run as the app's own role: `postgres` on Supabase, `idsms` on the lab stack.
-- CURRENT_USER makes the same file work on both. Safe to re-run.
--
-- A long manual migration can lift the limit for its own session first:
--   set statement_timeout = 0;
alter role current_user set statement_timeout = '15s';
alter role current_user set idle_in_transaction_session_timeout = '30s';
