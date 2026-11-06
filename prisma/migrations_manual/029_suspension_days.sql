-- Q14 option B (Nov 2026): a coordinator records "University suspension" days (weather, etc.).
-- They are semester-wide like PH holidays, so they reach every intern's calendar and weekly
-- report and count like a holiday. After 001-028. Additive; safe to re-run.
alter type "HolidayType" add value if not exists 'SUSPENSION';
