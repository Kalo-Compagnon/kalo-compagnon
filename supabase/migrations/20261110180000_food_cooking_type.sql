-- Preserve the dry-food cooking family in the shared catalogue.
begin;
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

commit;
