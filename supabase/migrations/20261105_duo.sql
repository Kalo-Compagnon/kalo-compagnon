-- Apply after schema.sql. No personal document or existing policy is modified.
create table public.logger_duo_links (
 id uuid primary key default gen_random_uuid(),
 inviter uuid not null references auth.users(id) on delete cascade,
 partner uuid references auth.users(id) on delete cascade,
 code uuid not null unique default gen_random_uuid(),
 expires_at timestamptz not null default now() + interval '24 hours',
 check (partner is null or partner <> inviter)
);
create table public.logger_duo_sharing (
 link_id uuid not null references public.logger_duo_links(id) on delete cascade,
 user_id uuid not null references auth.users(id) on delete cascade,
 permissions jsonb not null default '{}',
 primary key(link_id,user_id)
);
alter table public.logger_duo_links enable row level security;
alter table public.logger_duo_sharing enable row level security;
revoke all on public.logger_duo_links, public.logger_duo_sharing from anon, authenticated;

create or replace function public.logger_duo(p_action text default 'snapshot', p_payload jsonb default '{}')
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
 uid uuid := auth.uid(); l public.logger_duo_links; other_id uuid;
 own jsonb := '{}'; allowed jsonb := '{}'; docs jsonb := '[]';
 d record; projected jsonb; field text; category text; partner_name jsonb; partner_accent jsonb;
begin
 if uid is null then raise exception 'Authentification requise'; end if;
 -- Serialize link lifecycle, consent changes and reads, including concurrent accepts.
 perform pg_advisory_xact_lock(611052026);
 delete from public.logger_duo_links where partner is null and expires_at < now();
 select * into l from public.logger_duo_links where inviter=uid or partner=uid;
 if p_action='invite' then
   if l.id is not null then raise exception 'Une liaison existe déjà'; end if;
   insert into public.logger_duo_links(inviter) values(uid) returning * into l;
 elsif p_action='accept' then
   if l.id is not null then raise exception 'Une liaison existe déjà'; end if;
   select * into l from public.logger_duo_links where code::text=p_payload->>'code' and partner is null and expires_at > now() and inviter<>uid;
   if l.id is null then raise exception 'Code invalide ou expiré'; end if;
   update public.logger_duo_links set partner=uid where id=l.id returning * into l;
 elsif p_action='revoke' then
   delete from public.logger_duo_links where id=l.id;
   return jsonb_build_object('status','none');
 elsif p_action='share' then
   if l.partner is null then raise exception 'Liaison active requise'; end if;
   foreach category in array array['weight','measurements','activity','goals','food'] loop
     own := own || jsonb_build_object(category, coalesce(p_payload->category='true'::jsonb,false));
   end loop;
   insert into public.logger_duo_sharing(link_id,user_id,permissions) values(l.id,uid,own)
   on conflict(link_id,user_id) do update set permissions=excluded.permissions;
 elsif p_action <> 'snapshot' then raise exception 'Action inconnue';
 end if;
 if l.id is null then return jsonb_build_object('status','none'); end if;
 if l.partner is null then return jsonb_build_object('status','pending','code',l.code); end if;
 other_id := case when l.inviter=uid then l.partner else l.inviter end;
 select permissions into own from public.logger_duo_sharing where link_id=l.id and user_id=uid;
 select permissions into allowed from public.logger_duo_sharing where link_id=l.id and user_id=other_id;
 own:=coalesce(own,'{}'); allowed:=coalesce(allowed,'{}');
 -- Identity is the only information consented to by accepting the link itself.
 select value into partner_name from public.logger_documents where user_id=other_id and key='settings/displayName';
 select value into partner_accent from public.logger_documents where user_id=other_id and key='settings/haloColor';
 for d in select key,value from public.logger_documents where user_id=other_id and value is not null loop
   projected:=null;
   if d.key like 'day/%' then
     projected:='{}';
     for field,category in select * from (values
       ('weightKg','weight'),('measurements','measurements'),('measurementHistory','measurements'),
       ('steps','activity'),('fitSteps','activity'),('fitCalories','activity'),('fitCoveredSteps','activity'),('manualActivityCalories','activity'),
       ('basal','goals'),('target','goals')) as fields(f,c) loop
       if allowed->category='true'::jsonb and d.value ? field then projected:=projected || jsonb_build_object(field,d.value->field); end if;
     end loop;
     if projected='{}'::jsonb then projected:=null; end if;
   elsif d.key like 'measurement/%' and allowed->'measurements'='true'::jsonb then projected:=d.value;
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
   if projected is not null then docs:=docs || jsonb_build_array(jsonb_build_object('key',d.key,'value',projected)); end if;
 end loop;
 return jsonb_build_object('status','active','sharing',own,'partnerSharing',allowed,
   'partner',jsonb_build_object('name',partner_name,'accent',partner_accent),'documents',docs);
end; $$;
revoke all on function public.logger_duo(text,jsonb) from public,anon;
grant execute on function public.logger_duo(text,jsonb) to authenticated;
