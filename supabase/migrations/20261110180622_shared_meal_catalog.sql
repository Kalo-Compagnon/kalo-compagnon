-- Recipe definitions only. Logs, batch tracking and account preferences stay private.
begin;
create table public.logger_meal_catalog (
  id text primary key check (length(id) between 1 and 240),
  value jsonb,
  revision bigint not null default 1,
  updated_at timestamptz not null default now()
);
alter table public.logger_meal_catalog enable row level security;
create policy "Read shared recipes" on public.logger_meal_catalog
  for select to authenticated using (true);
revoke all on public.logger_meal_catalog from public, anon, authenticated;
grant select on public.logger_meal_catalog to authenticated;

create function public.logger_meal_catalog_value(p_id text, p_value jsonb)
returns jsonb language plpgsql set search_path = '' as $$
declare item jsonb; food jsonb; clean jsonb; parts jsonb := '[]'; foods jsonb := '[]'; field text;
begin
  if p_id is null or length(p_id) not between 1 and 240 then raise exception 'Invalid recipe id'; end if;
  if p_value is null or p_value = 'null'::jsonb then return null; end if;
  if jsonb_typeof(p_value) <> 'object' or p_value->>'id' is distinct from p_id
    or jsonb_typeof(p_value->'name') is distinct from 'string'
    or length(trim(p_value->>'name')) not between 1 and 500
    or jsonb_typeof(p_value->'ingredients') is distinct from 'array'
    or jsonb_typeof(p_value->'ingredientFoods') is distinct from 'array' then
    raise exception 'Invalid recipe';
  end if;
  if jsonb_array_length(p_value->'ingredients') not between 1 and 200
    or jsonb_array_length(p_value->'ingredientFoods') not between 1 and 200 then
    raise exception 'Invalid recipe ingredients';
  end if;
  foreach field in array array['cachedCalories','cachedProtein','cachedCarbs','cachedFat'] loop
    if jsonb_typeof(p_value->field) is distinct from 'number'
      or (p_value->>field)::numeric < 0 or (p_value->>field)::numeric > 1000000 then
      raise exception 'Invalid recipe nutrition';
    end if;
  end loop;
  for food in select value from jsonb_array_elements(p_value->'ingredientFoods') loop
    if coalesce(food->>'source','') not in ('','ciqual')
      or jsonb_typeof(food->'isCustom') is distinct from 'boolean' then
      raise exception 'Invalid ingredient source';
    end if;
    clean := public.logger_catalog_value(food->>'id', (food - 'source' - 'isDeleted') || '{"isCustom":true}'::jsonb);
    clean := clean || jsonb_build_object('isCustom',food->'isCustom');
    if food->>'source' = 'ciqual' then clean := clean || '{"source":"ciqual"}'::jsonb; end if;
    foods := foods || jsonb_build_array(clean);
  end loop;
  for item in select value from jsonb_array_elements(p_value->'ingredients') loop
    if jsonb_typeof(item->'id') is distinct from 'string' or length(item->>'id') not between 1 and 240
      or jsonb_typeof(item->'foodId') is distinct from 'string' or length(item->>'foodId') not between 1 and 240
      or jsonb_typeof(item->'quantity') is distinct from 'number'
      or (item->>'quantity')::numeric <= 0 or (item->>'quantity')::numeric > 1000000
      or jsonb_typeof(item->'isVariable') is distinct from 'boolean'
      or (item ? 'weightBasis' and coalesce(item->>'weightBasis','') not in ('raw','cooked'))
      or not exists(select 1 from jsonb_array_elements(foods) f where f->>'id'=item->>'foodId') then
      raise exception 'Invalid recipe ingredient';
    end if;
    parts := parts || jsonb_build_array(jsonb_build_object('id',item->'id','foodId',item->'foodId',
      'quantity',item->'quantity','isVariable',item->'isVariable') ||
      case when item ? 'weightBasis' then jsonb_build_object('weightBasis',item->'weightBasis') else '{}'::jsonb end);
  end loop;
  return jsonb_build_object('id',p_id,'name',p_value->'name','ingredients',parts,'ingredientFoods',foods,
    'cachedCalories',p_value->'cachedCalories','cachedProtein',p_value->'cachedProtein',
    'cachedCarbs',p_value->'cachedCarbs','cachedFat',p_value->'cachedFat');
end;
$$;
revoke all on function public.logger_meal_catalog_value(text,jsonb) from public, anon, authenticated;

create function public.logger_meal_catalog_put(p_id text, p_value jsonb, p_revision bigint)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare row_value public.logger_meal_catalog; clean jsonb;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if p_revision is null or p_revision < 0 then raise exception 'Invalid revision'; end if;
  clean := public.logger_meal_catalog_value(p_id,p_value);
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('kalo-recipe/' || p_id,0));
  select * into row_value from public.logger_meal_catalog where id=p_id for update;
  if not found then
    if p_revision <> 0 then return jsonb_build_object('accepted',false,'revision',0,'value',null); end if;
    insert into public.logger_meal_catalog(id,value) values(p_id,clean) returning * into row_value;
  elsif row_value.revision = p_revision then
    update public.logger_meal_catalog set value=clean,revision=revision+1,updated_at=now()
      where id=p_id returning * into row_value;
  else
    return jsonb_build_object('accepted',false,'revision',row_value.revision,'value',row_value.value);
  end if;
  return jsonb_build_object('accepted',true,'revision',row_value.revision);
end;
$$;
revoke all on function public.logger_meal_catalog_put(text,jsonb,bigint) from public, anon, authenticated;
grant execute on function public.logger_meal_catalog_put(text,jsonb,bigint) to authenticated;

-- Reuse the latest recipe for each id and the author's ingredient definitions.
-- Neither personal documents nor their permissions are changed.
do $$
declare recipe record; payload jsonb; clean jsonb;
begin
  for recipe in
    select distinct on (value->>'id') value,user_id
    from public.logger_documents
    where key like 'meal/%' and jsonb_typeof(value)='object' and key='meal/'||(value->>'id')
    order by value->>'id',updated_at desc,user_id
  loop
    begin
      select recipe.value || jsonb_build_object('ingredientFoods',coalesce(jsonb_agg(food), '[]'::jsonb)) into payload
      from (
        select distinct on (part->>'foodId') coalesce(d.value,c.value) as food
        from jsonb_array_elements(recipe.value->'ingredients') part
        left join public.logger_documents d on d.user_id=recipe.user_id and d.key='food/'||(part->>'foodId')
        left join public.logger_food_catalog c on c.id=part->>'foodId'
        order by part->>'foodId'
      ) ingredients;
      clean := public.logger_meal_catalog_value(recipe.value->>'id',payload);
    exception when others then continue;
    end;
    insert into public.logger_meal_catalog(id,value) values(clean->>'id',clean) on conflict(id) do nothing;
  end loop;
end;
$$;
commit;
