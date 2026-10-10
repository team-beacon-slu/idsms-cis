-- Manual migration — run once in the Supabase SQL editor, after 003.
-- Private bucket for server-generated PDFs (Module 8: weekly/monthly
-- reports, later endorsement letters). Object paths:
--   weekly/{studentProfileId}/{weeklyReportId}.pdf
--   monthly/{studentProfileId}/{calendarMonth}.pdf
-- Overwritten in place on regenerate (upsert), so one object per report.
-- Served only through server-created signed URLs (see 003's note on the
-- service-role key — that, plus public:false, is what keeps this private).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('generated-documents', 'generated-documents', false, 5242880, array['application/pdf'])
on conflict (id) do nothing;
