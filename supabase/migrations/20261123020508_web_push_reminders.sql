-- Preferences and subscriptions are private. Only the authenticated Edge Function writes.
create schema if not exists kalo_private;
revoke all on schema kalo_private from public, anon, authenticated;
grant usage on schema kalo_private to service_role;

create table kalo_private.push_configuration (
  singleton boolean primary key default true check (singleton),
  public_key text,
  private_key text,
  dispatch_secret_hash bytea
);
insert into kalo_private.push_configuration(singleton) values(true);
alter table kalo_private.push_configuration enable row level security;
revoke all on kalo_private.push_configuration from public, anon, authenticated;
grant select, update on kalo_private.push_configuration to service_role;

create table public.logger_push_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  settings jsonb not null check (jsonb_typeof(settings) = 'object' and settings->>'version' = '1'),
  updated_at timestamptz not null default now()
);
create table public.logger_push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  installation_id uuid not null,
  endpoint text not null unique check (length(endpoint) between 30 and 4096),
  p256dh text not null check (length(p256dh) between 80 and 100),
  auth text not null check (length(auth) between 20 and 30),
  origin text not null check (length(origin) between 8 and 300),
  created_at timestamptz not null default now(),
  unique (user_id, installation_id)
);
create table public.logger_push_snoozes (
  user_id uuid not null references auth.users(id) on delete cascade,
  day date not null,
  kind text not null check (kind in ('weight','steps','meal:breakfast','meal:lunch','meal:snack','meal:dinner')),
  started_at timestamptz not null default now(),
  primary key (user_id,day,kind)
);
create table public.logger_push_deliveries (
  subscription_id uuid not null references public.logger_push_subscriptions(id) on delete cascade,
  delivery_key text not null check (length(delivery_key) < 300),
  day date not null,
  sent_at timestamptz,
  lease_until timestamptz not null default now(),
  attempts integer not null default 0,
  primary key(subscription_id, delivery_key)
);
create index logger_push_deliveries_day on public.logger_push_deliveries(day);
alter table public.logger_push_preferences enable row level security;
alter table public.logger_push_subscriptions enable row level security;
alter table public.logger_push_snoozes enable row level security;
alter table public.logger_push_deliveries enable row level security;
revoke all on public.logger_push_preferences, public.logger_push_subscriptions, public.logger_push_snoozes, public.logger_push_deliveries from public, anon, authenticated;
grant select on public.logger_push_preferences, public.logger_push_snoozes to authenticated;
grant select(id,user_id,installation_id,created_at) on public.logger_push_subscriptions to authenticated;
grant all on public.logger_push_preferences, public.logger_push_subscriptions, public.logger_push_snoozes, public.logger_push_deliveries to service_role;
create policy "Own notification preferences" on public.logger_push_preferences for select to authenticated using ((select auth.uid()) = user_id);
create policy "Own notification devices" on public.logger_push_subscriptions for select to authenticated using ((select auth.uid()) = user_id);
create policy "Own notification snoozes" on public.logger_push_snoozes for select to authenticated using ((select auth.uid()) = user_id);

create function public.logger_push_keys(p_public text default null, p_private text default null)
returns jsonb language plpgsql set search_path = '' as $$
declare result jsonb;
begin
  if p_public is not null and p_private is not null then
    if length(p_public) <> 87 or length(p_private) <> 43 then raise exception 'Invalid VAPID keys'; end if;
    update kalo_private.push_configuration set public_key=p_public,private_key=p_private where singleton and public_key is null;
  end if;
  select jsonb_build_object('publicKey',public_key,'privateKey',private_key) into result from kalo_private.push_configuration where singleton;
  return result;
end; $$;
create function public.logger_push_dispatch_allowed(p_secret text)
returns boolean language sql stable set search_path = '' as $$
  select coalesce(length(p_secret) between 32 and 128 and dispatch_secret_hash = extensions.digest(p_secret,'sha256'),false)
  from kalo_private.push_configuration where singleton;
$$;
create function public.logger_push_claim(p_subscription uuid,p_key text,p_day date)
returns boolean language plpgsql set search_path = '' as $$
declare claimed integer;
begin
  insert into public.logger_push_deliveries(subscription_id,delivery_key,day,lease_until,attempts)
  values(p_subscription,p_key,p_day,now()+interval '2 minutes',1)
  on conflict(subscription_id,delivery_key) do update
  set lease_until=now()+interval '2 minutes',attempts=public.logger_push_deliveries.attempts+1
  where public.logger_push_deliveries.sent_at is null and public.logger_push_deliveries.lease_until <= now()
    and public.logger_push_deliveries.attempts < 3;
  get diagnostics claimed = row_count;
  return claimed = 1;
end; $$;
create function public.logger_push_snapshot(p_user uuid,p_day date,p_timezone text)
returns jsonb language sql stable set search_path = '' as $$
  select jsonb_build_object(
    'day',coalesce((select nullif(value,'null'::jsonb) from public.logger_documents where user_id=p_user and key='day/'||p_day::text),'{}'::jsonb),
    'entries',coalesce((select jsonb_agg(jsonb_build_object('timestamp',value->'timestamp','calories',value->'calories','type',value->'type','mealSlot',value->'mealSlot'))
      from public.logger_documents where user_id=p_user and key like 'entry/%'
      and case when jsonb_typeof(value->'timestamp')='number' then
        (value->>'timestamp')::numeric >= extract(epoch from (p_day::timestamp at time zone p_timezone))*1000
        and (value->>'timestamp')::numeric < extract(epoch from ((p_day+1)::timestamp at time zone p_timezone))*1000
        else false end),'[]'::jsonb));
$$;
create function public.logger_push_register(p_user uuid,p_installation uuid,p_endpoint text,p_p256dh text,p_auth text,p_origin text)
returns uuid language plpgsql set search_path = '' as $$
declare existing public.logger_push_subscriptions; result uuid;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_endpoint,0));
  select * into existing from public.logger_push_subscriptions where endpoint=p_endpoint for update;
  if found and (existing.p256dh <> p_p256dh or existing.auth <> p_auth) then raise exception 'Subscription mismatch'; end if;
  if existing.user_id = p_user and existing.installation_id = p_installation then
    update public.logger_push_subscriptions set origin=p_origin where id=existing.id;
    return existing.id;
  end if;
  if (select count(*) from public.logger_push_subscriptions where user_id=p_user and installation_id<>p_installation) >= 4 then raise exception 'Too many devices'; end if;
  delete from public.logger_push_subscriptions where endpoint=p_endpoint or (user_id=p_user and installation_id=p_installation);
  insert into public.logger_push_subscriptions(user_id,installation_id,endpoint,p256dh,auth,origin)
    values(p_user,p_installation,p_endpoint,p_p256dh,p_auth,p_origin) returning id into result;
  return result;
end; $$;
revoke all on function public.logger_push_keys(text,text), public.logger_push_dispatch_allowed(text), public.logger_push_claim(uuid,text,date), public.logger_push_snapshot(uuid,date,text) from public, anon, authenticated;
grant execute on function public.logger_push_keys(text,text), public.logger_push_dispatch_allowed(text), public.logger_push_claim(uuid,text,date), public.logger_push_snapshot(uuid,date,text) to service_role;
revoke all on function public.logger_push_register(uuid,uuid,text,text,text,text) from public,anon,authenticated;
grant execute on function public.logger_push_register(uuid,uuid,text,text,text,text) to service_role;
