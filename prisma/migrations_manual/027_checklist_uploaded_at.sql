-- The intern marks a checklist item "Uploaded to Classroom" (efficiency plan item 19,
-- decision D3, 5 Nov 2026). Documents stay in Google Classroom (D7); this only records
-- that the intern says the file is there, so the adviser reviews those first and in bulk.
-- An approve or return clears it. A nullable column, not a new ChecklistStatus value, so
-- every existing status check is unchanged. After 001-026. Idempotent.

alter table pre_deployment_checklist_items
  add column if not exists uploaded_at timestamptz(3);
