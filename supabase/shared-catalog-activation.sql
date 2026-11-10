-- Initial remote activation: base catalogue with the latest field validator before backfill.
-- Preserves subtype, unit weight, soft deletion and cooking type from the outset.
-- Shared Kalo food definitions. Personal documents and their RLS stay private.
begin;

create table if not exists public.logger_food_catalog (
  id text primary key check (length(id) between 1 and 240),
  value jsonb not null,
  revision bigint not null default 1,
  updated_at timestamptz not null default now()
);
alter table public.logger_food_catalog enable row level security;
drop policy if exists "Read shared Kalo catalogue" on public.logger_food_catalog;
create policy "Read shared Kalo catalogue" on public.logger_food_catalog
  for select to authenticated using (true);
revoke all on public.logger_food_catalog from public, anon, authenticated;
grant select on public.logger_food_catalog to authenticated;

-- Whitelist fields; never publish favorites, usage, dates, photos or account data.
create or replace function public.logger_catalog_value(p_id text, p_value jsonb)
returns jsonb language plpgsql immutable set search_path = public as $$
declare field text;
begin
  if p_id is null or length(p_id) not between 1 and 240
    or p_value is null or jsonb_typeof(p_value) <> 'object'
    or p_value->>'id' is distinct from p_id
    or p_value->'isCustom' is distinct from 'true'::jsonb
    or coalesce(p_value->>'source', '') <> ''
    or jsonb_typeof(p_value->'name') is distinct from 'string'
    or length(trim(p_value->>'name')) not between 1 and 500
    or jsonb_typeof(p_value->'category') is distinct from 'string'
    or p_value->>'referenceUnit' not in ('g', 'ml', 'unité')
    or p_value->>'referenceUnit' is null then
    raise exception 'Invalid Kalo food';
  end if;
  foreach field in array array['kcalPer100','proteinPer100','carbsPer100','fatPer100'] loop
    if jsonb_typeof(p_value->field) is distinct from 'number'
      or (p_value->>field)::numeric < 0
      or (p_value->>field)::numeric > 1000000 then
      raise exception 'Invalid nutrition value: %', field;
    end if;
  end loop;
  if p_value ? 'brand' and jsonb_typeof(p_value->'brand') <> 'string' then
    raise exception 'Invalid brand';
  end if;
  if p_value ? 'subtype' and (jsonb_typeof(p_value->'subtype') <> 'string' or length(p_value->>'subtype') > 500) then
    raise exception 'Invalid subtype';
  end if;
  if p_value ? 'unitWeightGrams' then
    if jsonb_typeof(p_value->'unitWeightGrams') <> 'number'
      or (p_value->>'unitWeightGrams')::numeric <= 0
      or (p_value->>'unitWeightGrams')::numeric > 1000000
      or p_value->>'referenceUnit' <> 'unité' then
      raise exception 'Invalid unit weight';
    end if;
  end if;
  if p_value ? 'cookingType' and (jsonb_typeof(p_value->'cookingType') <> 'string' or p_value->>'cookingType' not in ('pasta', 'rice')) then
    raise exception 'Invalid cooking type';
  end if;
  if p_value ? 'isDeleted' and jsonb_typeof(p_value->'isDeleted') <> 'boolean' then
    raise exception 'Invalid deletion flag';
  end if;
  foreach field in array array['aliases','missingNutrients'] loop
    if p_value ? field then
      if jsonb_typeof(p_value->field) <> 'array' then raise exception 'Invalid %', field; end if;
      if exists (select 1 from jsonb_array_elements(p_value->field) x where jsonb_typeof(x) <> 'string') then
        raise exception 'Invalid %', field;
      end if;
    end if;
  end loop;
  return (case when p_value ? 'cookingType' then jsonb_build_object('cookingType',p_value->'cookingType') else '{}'::jsonb end) || (case when p_value->'isDeleted' = 'true'::jsonb then '{"isDeleted":true}'::jsonb else '{}'::jsonb end) || (case when p_value ? 'unitWeightGrams' then jsonb_build_object('unitWeightGrams',p_value->'unitWeightGrams') else '{}'::jsonb end) || jsonb_build_object(
    'id',p_id,'name',p_value->'name','brand',coalesce(p_value->'brand','""'::jsonb),
    'subtype',coalesce(p_value->'subtype','""'::jsonb),'category',p_value->'category','referenceUnit',p_value->'referenceUnit',
    'kcalPer100',p_value->'kcalPer100','proteinPer100',p_value->'proteinPer100',
    'carbsPer100',p_value->'carbsPer100','fatPer100',p_value->'fatPer100',
    'aliases',coalesce(p_value->'aliases','[]'::jsonb),
    'missingNutrients',coalesce(p_value->'missingNutrients','[]'::jsonb),'isCustom',true
  );
end; $$;
revoke all on function public.logger_catalog_value(text,jsonb) from public, anon, authenticated;

create or replace function public.logger_catalog_put(p_id text, p_value jsonb, p_revision bigint)
returns jsonb language plpgsql security definer set search_path = public as $$
declare row_value public.logger_food_catalog; clean jsonb;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if p_revision is null or p_revision < 0 then raise exception 'Invalid revision'; end if;
  clean := public.logger_catalog_value(p_id,p_value);
  perform pg_advisory_xact_lock(hashtextextended('kalo-catalog/' || p_id,0));
  select * into row_value from public.logger_food_catalog where id=p_id for update;
  if not found then
    if p_revision <> 0 then return jsonb_build_object('accepted',false,'revision',0,'value',null); end if;
    insert into public.logger_food_catalog(id,value) values(p_id,clean) returning * into row_value;
  elsif row_value.revision = p_revision then
    update public.logger_food_catalog set value=clean,revision=revision+1,updated_at=now()
      where id=p_id returning * into row_value;
  else
    return jsonb_build_object('accepted',false,'revision',row_value.revision,'value',row_value.value);
  end if;
  return jsonb_build_object('accepted',true,'revision',row_value.revision);
end; $$;
revoke all on function public.logger_catalog_put(text,jsonb,bigint) from public, anon;
grant execute on function public.logger_catalog_put(text,jsonb,bigint) to authenticated;

-- Carry over existing user-created foods, selecting the latest definition for
-- each id. Ignore malformed legacy records without blocking the migration.
do $$
declare food record; clean jsonb;
begin
  for food in
    select distinct on (value->>'id') value
    from public.logger_documents
    where key like 'food/%' and value->'isCustom' = 'true'::jsonb
      and coalesce(value->>'source','') = '' and key = 'food/' || (value->>'id')
    order by value->>'id', updated_at desc, user_id
  loop
    begin
      clean := public.logger_catalog_value(food.value->>'id',food.value);
    exception when others then continue;
    end;
    insert into public.logger_food_catalog(id,value) values(clean->>'id',clean)
      on conflict (id) do nothing;
  end loop;
end; $$;

commit;
