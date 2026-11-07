-- Efficiency plan item 40 (5 Nov 2026): the 11 foreign keys still without an index (found
-- with a pg_constraint / pg_index query on the beta DB). They back the adviser and class
-- group lookups, holiday calendars, generated documents and the user deletes that cascade
-- through accounts and reset tokens. Additive; safe to re-run. After 001-027. Tables are
-- small, so no CONCURRENTLY.
create index if not exists accounts_user_id_idx on accounts (user_id);
create index if not exists student_profiles_semester_id_idx on student_profiles (semester_id);
create index if not exists faculty_class_groups_class_group_id_idx
  on faculty_class_groups (class_group_id);
create index if not exists faculty_class_groups_semester_id_idx
  on faculty_class_groups (semester_id);
create index if not exists generated_documents_student_profile_id_idx
  on generated_documents (student_profile_id);
create index if not exists holiday_calendar_semester_id_idx on holiday_calendar (semester_id);
create index if not exists holiday_calendar_student_profile_id_idx
  on holiday_calendar (student_profile_id);
create index if not exists password_reset_tokens_user_id_idx on password_reset_tokens (user_id);
create index if not exists data_requests_fulfilled_by_idx on data_requests (fulfilled_by);
create index if not exists company_placements_retraction_noted_by_idx
  on company_placements (retraction_noted_by);
create index if not exists company_visits_visited_by_idx on company_visits (visited_by);
