-- Run after the Kermit quota migration, with the administrator connection.
-- Reuses the existing private Duo pair without copying personal IDs into Git.
-- Stops if the pair or an existing access list is ambiguous. No journal data changes.
begin;
do $$
begin
  if to_regclass('public.logger_private_duo_pair') is null then
    raise exception 'La paire Duo privee doit etre configuree avant activation de Kermit.';
  end if;
  if (select count(*) from public.logger_private_duo_pair) <> 1 then
    raise exception 'Une unique paire Duo privee est necessaire pour activer Kermit.';
  end if;
  if exists (
    select 1 from public.kermit_users u
    where not exists (
      select 1 from public.logger_private_duo_pair p
      where u.user_id in (p.first_user, p.second_user)
    )
  ) then
    raise exception 'La liste Kermit contient un compte hors de la paire. Verification requise.';
  end if;
  insert into public.kermit_users(user_id)
    select first_user from public.logger_private_duo_pair
    union select second_user from public.logger_private_duo_pair
    on conflict (user_id) do nothing;
end;
$$;
commit;
