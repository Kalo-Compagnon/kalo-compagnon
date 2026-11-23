-- Explicit administrator requests may notify outside the Sunday window.
-- Device permission, master notification preference, quiet hours and deduplication still apply.
alter table public.logger_weekly_jobs
  add column notify boolean not null default false;
