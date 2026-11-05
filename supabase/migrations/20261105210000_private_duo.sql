-- Schéma générique uniquement : les comptes sont configurés séparément et en privé.
-- Compatible avec la migration Duo précédente. Aucune donnée personnelle déplacée.
begin;

create table if not exists public.logger_duo_links (
 id uuid primary key default gen_random_uuid(),
 inviter uuid not null references auth.users(id) on delete cascade,
 partner uuid references auth.users(id) on delete cascade,
 code uuid not null unique default gen_random_uuid(),
 expires_at timestamptz not null default now() + interval '24 hours',
 check (partner is null or partner <> inviter)
);
create table if not exists public.logger_duo_sharing (
 link_id uuid not null references public.logger_duo_links(id) on delete cascade,
 user_id uuid not null references auth.users(id) on delete cascade,
 permissions jsonb not null default '{}',
 primary key(link_id,user_id)
);
create table if not exists public.logger_private_duo_pair (
 singleton boolean primary key default true check (singleton),
 first_user uuid not null references auth.users(id) on delete cascade,
 second_user uuid not null references auth.users(id) on delete cascade,
 check (first_user <> second_user)
);
create table if not exists public.logger_private_duo_consents (
 user_id uuid primary key references auth.users(id) on delete cascade,
 accepted_at timestamptz not null default now()
);

alter table public.logger_duo_links enable row level security;
alter table public.logger_duo_sharing enable row level security;
alter table public.logger_private_duo_pair enable row level security;
alter table public.logger_private_duo_consents enable row level security;
revoke all on public.logger_duo_links, public.logger_duo_sharing,
 public.logger_private_duo_pair, public.logger_private_duo_consents from public, anon, authenticated;

-- The pair is provisioned privately by the administrator; no account IDs or names belong here.

create or replace function public.logger_duo(p_action text default 'snapshot', p_payload jsonb default '{}')
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
 uid uuid := auth.uid(); pair public.logger_private_duo_pair; l public.logger_duo_links;
 other_id uuid; consented boolean; both_consented boolean;
 own jsonb := '{}'; allowed jsonb := '{}'; docs jsonb := '[]';
 d record; projected jsonb; include_null boolean; field text; category text;
 partner_name jsonb; partner_accent jsonb;
begin
 if uid is null then raise exception 'Authentification requise' using errcode='42501'; end if;
 select * into pair from public.logger_private_duo_pair where singleton;
 if not found then return jsonb_build_object('status','unconfigured','mode','fixed'); end if;
 if uid not in (pair.first_user,pair.second_user) then
  return jsonb_build_object('status','unavailable','mode','fixed');
 end if;
 if p_action is null or p_action not in ('snapshot','join','share','revoke') then
  raise exception 'Action Duo inconnue';
 end if;
 perform pg_advisory_xact_lock(611052026);
 other_id:=case when uid=pair.first_user then pair.second_user else pair.first_user end;
 select * into l from public.logger_duo_links
  where (inviter=uid and partner=other_id) or (inviter=other_id and partner=uid)
  order by id limit 1;

 if p_action='revoke' then
  delete from public.logger_private_duo_consents where user_id in (uid,other_id);
  delete from public.logger_duo_links where id=l.id or (partner is null and inviter in (uid,other_id));
  return jsonb_build_object('status','none','mode','fixed','consented',false);
 end if;
 if p_action='join' then
  insert into public.logger_private_duo_consents(user_id) values(uid) on conflict do nothing;
 end if;
 consented:=exists(select 1 from public.logger_private_duo_consents where user_id=uid);
 both_consented:=consented and exists(select 1 from public.logger_private_duo_consents where user_id=other_id);
 if p_action='join' and both_consented and l.id is null then
  if exists(select 1 from public.logger_duo_links where partner is not null
    and (inviter in (uid,other_id) or partner in (uid,other_id))) then
   raise exception 'Une autre liaison existe : la révoquer avant d’activer le Duo privé.';
  end if;
  delete from public.logger_duo_links where partner is null and inviter in (uid,other_id);
  insert into public.logger_duo_links(inviter,partner) values(pair.first_user,pair.second_user) returning * into l;
 end if;
 if not both_consented or l.id is null then
  if p_action='share' then raise exception 'Les deux accords sont requis avant de partager.'; end if;
  return jsonb_build_object('status',case when consented then 'pending' else 'none' end,
   'mode','fixed','consented',consented);
 end if;

 if p_action='share' then
  foreach category in array array['weight','measurements','activity','goals','food'] loop
   own:=own || jsonb_build_object(category,coalesce(p_payload->category='true'::jsonb,false));
  end loop;
  insert into public.logger_duo_sharing(link_id,user_id,permissions) values(l.id,uid,own)
   on conflict(link_id,user_id) do update set permissions=excluded.permissions;
 end if;
 select permissions into own from public.logger_duo_sharing where link_id=l.id and user_id=uid;
 select permissions into allowed from public.logger_duo_sharing where link_id=l.id and user_id=other_id;
 own:=coalesce(own,'{}'); allowed:=coalesce(allowed,'{}');
 select value into partner_name from public.logger_documents where user_id=other_id and key='settings/displayName';
 select value into partner_accent from public.logger_documents where user_id=other_id and key='settings/haloColor';
 for d in select key,value from public.logger_documents where user_id=other_id
   and (value is not null or key like 'measurement/%') loop
  projected:=null; include_null:=false;
  if d.key like 'day/%' then
   projected:='{}';
   for field,category in select * from (values
    ('weightKg','weight'),('measurements','measurements'),('measurementHistory','measurements'),
    ('steps','activity'),('fitSteps','activity'),('fitCalories','activity'),('fitCoveredSteps','activity'),('manualActivityCalories','activity'),
    ('basal','goals'),('target','goals')) as fields(f,c) loop
    if allowed->category='true'::jsonb and d.value ? field then projected:=projected || jsonb_build_object(field,d.value->field); end if;
   end loop;
   if projected='{}'::jsonb then projected:=null; end if;
  elsif d.key like 'measurement/%' and allowed->'measurements'='true'::jsonb then
   projected:=d.value; include_null:=true;
  elsif d.key like 'entry/%' and allowed->'food'='true'::jsonb then
   projected:=jsonb_build_object('id',d.value->'id','timestamp',d.value->'timestamp','type',d.value->'type','foodName',d.value->'foodName','calories',d.value->'calories');
  elsif d.key in ('settings/target','settings/basal','settings/deficitGoal') and allowed->'goals'='true'::jsonb then projected:=d.value;
  elsif d.key like 'fit/%' and allowed->'activity'='true'::jsonb then
   projected:=jsonb_build_object('id',d.value->'id','timestamp',d.value->'timestamp','name',d.value->'name','days',d.value->'days','calories',d.value->'calories','steps',d.value->'steps','coveredSteps',d.value->'coveredSteps');
  elsif d.key like 'physical/%' then
   projected:=jsonb_build_object('id',d.value->'id','timestamp',d.value->'timestamp');
   if allowed->'weight'='true'::jsonb and d.value ? 'weightKg' then projected:=projected || jsonb_build_object('weightKg',d.value->'weightKg'); end if;
   if allowed->'measurements'='true'::jsonb and d.value ? 'waistCm' then projected:=projected || jsonb_build_object('waistCm',d.value->'waistCm'); end if;
   if not (projected ? 'weightKg' or projected ? 'waistCm') then projected:=null; end if;
  end if;
  if projected is not null or include_null then docs:=docs || jsonb_build_array(jsonb_build_object('key',d.key,'value',projected)); end if;
 end loop;
 return jsonb_build_object('status','active','mode','fixed','consented',true,
  'sharing',own,'partnerSharing',allowed,'partner',jsonb_build_object('name',partner_name,'accent',partner_accent),'documents',docs);
end $$;
revoke all on function public.logger_duo(text,jsonb) from public, anon, authenticated;
grant execute on function public.logger_duo(text,jsonb) to authenticated;
notify pgrst, 'reload schema';
commit;
