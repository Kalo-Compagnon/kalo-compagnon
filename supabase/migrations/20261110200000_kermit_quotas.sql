-- No conversation, photos, or credentials. Access list is populated by the operator.
create table public.kermit_users (
  user_id uuid primary key references auth.users(id) on delete cascade
);
create table public.kermit_calls (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  called_at timestamptz not null default clock_timestamp(),
  reserved_tokens integer not null check (reserved_tokens between 1 and 180000)
);
create index kermit_calls_time on public.kermit_calls(called_at);
create index kermit_calls_user_time on public.kermit_calls(user_id, called_at);
alter table public.kermit_users enable row level security;
alter table public.kermit_calls enable row level security;
revoke all on public.kermit_users, public.kermit_calls from public, anon, authenticated;

create function public.reserve_kermit_call(p_user uuid, p_tokens integer)
returns text language plpgsql security definer set search_path = '' as $$
declare
  current_time_utc timestamptz;
  start_day timestamptz;
  user_calls integer;
  day_calls integer;
  minute_calls integer;
  minute_tokens bigint;
begin
  -- Serializes all reservations, including competing users and parallel instances.
  perform pg_catalog.pg_advisory_xact_lock(1647829301);
  current_time_utc := pg_catalog.clock_timestamp();
  start_day := pg_catalog.date_trunc('day', current_time_utc at time zone 'UTC') at time zone 'UTC';
  if not exists(select 1 from public.kermit_users where user_id = p_user) then return 'denied'; end if;
  if p_tokens is null or p_tokens < 1 or p_tokens > 180000 then return 'busy'; end if;
  select count(*) into user_calls from public.kermit_calls where user_id = p_user and called_at >= start_day;
  if user_calls >= 50 then return 'daily'; end if;
  select count(*) into day_calls from public.kermit_calls where called_at >= start_day;
  select count(*), coalesce(sum(reserved_tokens),0) into minute_calls, minute_tokens
    from public.kermit_calls where called_at > current_time_utc - interval '60 seconds';
  -- Headroom for other clients of the Google project: 10/15 RPM, 100/500 RPD,
  -- 180000/250000 TPM. Google remains authoritative for external traffic.
  if day_calls >= 100 then return 'daily'; end if;
  if minute_calls >= 10 or minute_tokens + p_tokens > 180000 then return 'busy'; end if;
  insert into public.kermit_calls(user_id, called_at, reserved_tokens) values(p_user, current_time_utc, p_tokens);
  delete from public.kermit_calls where called_at < start_day - interval '7 days';
  return 'ok';
end;
$$;
revoke all on function public.reserve_kermit_call(uuid, integer) from public, anon, authenticated;
grant execute on function public.reserve_kermit_call(uuid, integer) to service_role;
