-- Three automatic attempts, then explicit manual retries with a server cooldown.
alter table public.logger_weekly_reports drop constraint logger_weekly_reports_attempts_check;
alter table public.logger_weekly_reports add constraint logger_weekly_reports_attempts_check check(attempts >= 1);
drop function public.logger_weekly_claim(uuid,date);
create function public.logger_weekly_claim(p_user uuid,p_week date,p_manual boolean default false)
returns uuid language plpgsql set search_path='' as $$
declare lease uuid := gen_random_uuid(); claimed integer;
begin
  insert into public.logger_weekly_reports(user_id,week_start,status,lease_until,lease_token)
  values(p_user,p_week,'generating',now()+interval '2 minutes',lease)
  on conflict(user_id,week_start) do update set
    status='generating',lease_until=now()+interval '2 minutes',lease_token=lease,error_code=null,
    attempts=public.logger_weekly_reports.attempts+1
  where public.logger_weekly_reports.status not in ('ready','empty')
    and public.logger_weekly_reports.lease_until<=now()
    and ((not p_manual and public.logger_weekly_reports.attempts<3)
      or (p_manual and public.logger_weekly_reports.attempts>=3));
  get diagnostics claimed = row_count;
  return case when claimed=1 then lease else null end;
end; $$;
revoke all on function public.logger_weekly_claim(uuid,date,boolean) from public,anon,authenticated;
grant execute on function public.logger_weekly_claim(uuid,date,boolean) to service_role;
-- Existing failed reports use the new cooldown without resetting their counters.
update public.logger_weekly_reports
set lease_until=lease_until-interval '10 minutes'+case when attempts<3 then interval '5 minutes' else interval '15 minutes' end
where status='failed';
