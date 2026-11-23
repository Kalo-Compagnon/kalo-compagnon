-- Private, immutable weekly recaps. Apply through a Supabase migration.
create table public.logger_weekly_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  enabled boolean not null default false,
  updated_at timestamptz not null default now()
);
create table public.logger_weekly_reports (
  user_id uuid not null references auth.users(id) on delete cascade,
  week_start date not null check (extract(isodow from week_start)=1),
  status text not null check (status in ('generating','ready','empty','failed')),
  metrics jsonb check (metrics is null or jsonb_typeof(metrics)='object'),
  narrative jsonb check (narrative is null or jsonb_typeof(narrative)='object'),
  generated_at timestamptz,
  attempts integer not null default 1 check(attempts between 1 and 3),
  lease_until timestamptz not null default now(),
  lease_token uuid not null default gen_random_uuid(),
  error_code text check(error_code in ('quota','access','unavailable')),
  notified_at timestamptz,
  primary key(user_id,week_start),
  check(status<>'ready' or (metrics is not null and narrative is not null))
);
alter table public.logger_weekly_preferences enable row level security;
alter table public.logger_weekly_reports enable row level security;
revoke all on public.logger_weekly_preferences, public.logger_weekly_reports from public,anon,authenticated;
grant select on public.logger_weekly_preferences to authenticated;
grant select(user_id,week_start,status,metrics,narrative,generated_at) on public.logger_weekly_reports to authenticated;
grant all on public.logger_weekly_preferences, public.logger_weekly_reports to service_role;
grant select on public.kermit_users, public.logger_documents to service_role;
create policy "Own weekly preferences" on public.logger_weekly_preferences for select to authenticated using ((select auth.uid())=user_id);
create policy "Own weekly recaps" on public.logger_weekly_reports for select to authenticated using ((select auth.uid())=user_id);

create function public.logger_weekly_claim(p_user uuid,p_week date)
returns uuid language plpgsql set search_path='' as $$
declare lease uuid := gen_random_uuid(); claimed integer;
begin
  insert into public.logger_weekly_reports(user_id,week_start,status,lease_until,lease_token)
  values(p_user,p_week,'generating',now()+interval '2 minutes',lease)
  on conflict(user_id,week_start) do update set
    status='generating',lease_until=now()+interval '2 minutes',lease_token=lease,error_code=null,
    attempts=public.logger_weekly_reports.attempts+1
  where public.logger_weekly_reports.status not in ('ready','empty')
    and public.logger_weekly_reports.lease_until<=now() and public.logger_weekly_reports.attempts<3;
  get diagnostics claimed = row_count;
  return case when claimed=1 then lease else null end;
end; $$;
create function public.logger_weekly_source(p_user uuid,p_week date)
returns jsonb language sql stable set search_path='' as $$
select jsonb_build_object(
  'settings',coalesce((select jsonb_object_agg(substr(key,10),value) from public.logger_documents where user_id=p_user and key in ('settings/basal','settings/birthDate','settings/deficitGoal')),'{}'::jsonb),
  'days',coalesce((select jsonb_object_agg(substr(key,5),jsonb_build_object(
    'isDeleted',value->'isDeleted','basal',value->'basal','steps',value->'steps','fitSteps',value->'fitSteps',
    'fitCoveredSteps',value->'fitCoveredSteps','fitCalories',value->'fitCalories','manualActivityCalories',value->'manualActivityCalories',
    'weightKg',value->'weightKg','measurements',value->'measurements'))
    from public.logger_documents where user_id=p_user and key between 'day/'||(p_week-7)::text and 'day/'||(p_week+6)::text and jsonb_typeof(value)='object'),'{}'::jsonb),
  'entries',coalesce((select jsonb_agg(jsonb_build_object(
    'timestamp',value->'timestamp','calories',value->'calories','proteinGrams',value->'proteinGrams','carbsGrams',value->'carbsGrams','fatGrams',value->'fatGrams'))
    from public.logger_documents where user_id=p_user and key like 'entry/%' and
    case when jsonb_typeof(value->'timestamp')='number' then
      (value->>'timestamp')::numeric>=extract(epoch from ((p_week-7)::timestamp at time zone 'Europe/Paris'))*1000
      and (value->>'timestamp')::numeric<=extract(epoch from (((p_week+6)::timestamp+interval '21 hours') at time zone 'Europe/Paris'))*1000
      else false end),'[]'::jsonb)
); $$;
revoke all on function public.logger_weekly_claim(uuid,date), public.logger_weekly_source(uuid,date) from public,anon,authenticated;
grant execute on function public.logger_weekly_claim(uuid,date), public.logger_weekly_source(uuid,date) to service_role;
