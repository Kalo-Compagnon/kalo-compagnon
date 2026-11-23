-- Apply after the notifications migration and deploy the notifications Edge Function.
-- Secrets are generated within Postgres and never written to source or returned.
create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;
do $$
declare secret text;
begin
  select decrypted_secret into secret from vault.decrypted_secrets where name='kalo_push_dispatch' limit 1;
  if secret is null then
    secret := encode(extensions.gen_random_bytes(32),'hex');
    perform vault.create_secret(secret,'kalo_push_dispatch','Private credential for the Kalo reminder scheduler');
  end if;
  update kalo_private.push_configuration set dispatch_secret_hash=extensions.digest(secret,'sha256') where singleton;
end; $$;
select cron.schedule('kalo-push-reminders','* * * * *',$cron$
  select net.http_post(
    url:='https://rlatjredsjvgjsbrqmtm.supabase.co/functions/v1/notifications',
    headers:=jsonb_build_object('Content-Type','application/json','x-kalo-dispatch',(select decrypted_secret from vault.decrypted_secrets where name='kalo_push_dispatch' limit 1)),
    body:='{"action":"dispatch"}'::jsonb, timeout_milliseconds:=60000
  );
$cron$);
-- Old delivery leases and snoozes are operational metadata, not journal entries.
select cron.schedule('kalo-push-cleanup','17 3 * * *',$cron$
  delete from public.logger_push_deliveries where day < current_date - 7;
  delete from public.logger_push_snoozes where day < current_date - 7;
$cron$);
