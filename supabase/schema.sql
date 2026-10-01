-- Exécuter dans le SQL Editor du projet Supabase, une seule fois.
create table if not exists public.logger_documents (
 user_id uuid not null references auth.users(id) on delete cascade,
 key text not null check (length(key) between 1 and 240),
 value jsonb,
 revision bigint not null default 1,
 updated_at timestamptz not null default now(),
 primary key(user_id,key)
);
alter table public.logger_documents enable row level security;
create policy "Lire ses données" on public.logger_documents for select to authenticated using ((select auth.uid())=user_id);
create policy "Insérer ses données" on public.logger_documents for insert to authenticated with check ((select auth.uid())=user_id);
create policy "Modifier ses données" on public.logger_documents for update to authenticated using ((select auth.uid())=user_id) with check ((select auth.uid())=user_id);
create or replace function public.logger_put(p_key text,p_value jsonb,p_revision bigint)
returns jsonb language plpgsql security definer set search_path=public as $$
declare row_value public.logger_documents; uid uuid := auth.uid();
begin
 if uid is null then raise exception 'Authentification requise'; end if;
 -- Lock also serializes concurrent initial inserts for a key.
 perform pg_advisory_xact_lock(hashtextextended(uid::text || '/' || p_key,0));
 select * into row_value from public.logger_documents where user_id=uid and key=p_key for update;
 if not found then
  if p_revision <> 0 then return jsonb_build_object('accepted',false,'revision',0,'value',null); end if;
  insert into public.logger_documents(user_id,key,value) values(uid,p_key,p_value) returning * into row_value;
 elsif row_value.revision = p_revision then
  update public.logger_documents set value=p_value,revision=revision+1,updated_at=now() where user_id=uid and key=p_key returning * into row_value;
 else return jsonb_build_object('accepted',false,'revision',row_value.revision,'value',row_value.value);
 end if;
 return jsonb_build_object('accepted',true,'revision',row_value.revision);
end; $$;
revoke all on function public.logger_put(text,jsonb,bigint) from public,anon;
grant execute on function public.logger_put(text,jsonb,bigint) to authenticated;
-- Writes exclusively through the revision-checked function.
revoke insert,update,delete on public.logger_documents from authenticated,anon;
grant select on public.logger_documents to authenticated;
