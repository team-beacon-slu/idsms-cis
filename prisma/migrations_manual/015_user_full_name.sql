-- Staff accounts had no name: the sidebar, review lines and audit log could only show an
-- email. Students keep their legal name on student_profiles.full_name; this is the display
-- name for staff (and optional for students). Additive, nullable. Apply after 014.
alter table users add column if not exists full_name text;
