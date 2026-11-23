-- Internal one-off requests. No browser endpoint or user write access.
create table public.logger_weekly_jobs (
  user_id uuid not null references auth.users(id) on delete cascade,
  week_start date not null check(extract(isodow from week_start)=1),
  requested_at timestamptz not null default now(),
  primary key(user_id,week_start)
);
alter table public.logger_weekly_jobs enable row level security;
revoke all on public.logger_weekly_jobs from public,anon,authenticated,service_role;
grant select on public.logger_weekly_jobs to service_role;
