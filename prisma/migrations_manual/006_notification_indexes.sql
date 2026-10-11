-- Phase 4 Workstream C: notification indexes. Additive only. Run once in the
-- Supabase SQL editor after 001–005. Idempotent.

-- Concurrent cron runs (platform retry, manual re-trigger, lab-server host
-- cron overlapping Vercel's) both pass the "already sent?" check before
-- either writes. This index makes the second IN_APP insert fail with P2002,
-- which notify() treats as "already sent" and skips the email too.
-- Partial + expression index: Prisma can't express it, so it lives here only.
create unique index if not exists notifications_in_app_dedupe_key
  on notifications (user_id, trigger_type, (payload ->> 'dedupeKey'))
  where channel = 'IN_APP' and (payload ->> 'dedupeKey') is not null;

-- Unread badge and inbox list: WHERE user_id = ? AND channel = 'IN_APP'
-- [AND read_at IS NULL]. Same name Prisma gives the schema's @@index, so
-- `prisma db push` and this file agree.
create index if not exists notifications_user_id_channel_read_at_idx
  on notifications (user_id, channel, read_at);
