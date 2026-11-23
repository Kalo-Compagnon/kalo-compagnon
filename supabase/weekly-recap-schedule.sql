-- Server-controlled staggering, relative to Sunday 21:00 Europe/Paris.
alter table public.logger_weekly_preferences
  add column generation_delay_minutes integer not null default 0
  check(generation_delay_minutes between 0 and 59);
