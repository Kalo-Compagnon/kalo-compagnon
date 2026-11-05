-- Legacy checks for 20261105_duo.sql ONLY (invitation-based Duo).
-- Current fixed-pair SQL is tested by tests/private-duo-sql.test.ts with npm test.
-- Integration checks for a disposable LOCAL Supabase database, after both SQL files.
-- Run with an administrator connection. All fixtures are rolled back.
begin;
insert into auth.users(id) values
 ('10000000-0000-4000-8000-000000000001'),
 ('10000000-0000-4000-8000-000000000002'),
 ('10000000-0000-4000-8000-000000000003');
insert into public.logger_documents(user_id,key,value) values
 ('10000000-0000-4000-8000-000000000001','day/2026-11-01','{"weightKg":80,"steps":1000,"basal":1500,"measurements":{"Taille":80}}'),
 ('10000000-0000-4000-8000-000000000001','settings/displayName','"Alice"'),
 ('10000000-0000-4000-8000-000000000001','entry/secret','{"id":"secret","calories":500,"note":"private"}');
create function pg_temp.check_true(ok boolean, message text) returns void language plpgsql as $$
begin if ok is distinct from true then raise exception '%',message; end if; end $$;
set local role authenticated;
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000001',true);
select pg_temp.check_true(public.logger_duo()->>'status'='none','initial state');
select set_config('duo_test.code',public.logger_duo('invite')->>'code',true);
select pg_temp.check_true(public.logger_duo()->>'status'='pending','pending invitation');
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000002',true);
select pg_temp.check_true(public.logger_duo('accept',jsonb_build_object('code',current_setting('duo_test.code')))->>'status'='active','explicit acceptance');
select pg_temp.check_true(public.logger_duo()->'documents'='[]'::jsonb,'all categories private by default');
select pg_temp.check_true((select count(*) from public.logger_documents)=0,'RLS still blocks raw partner documents');
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000001',true);
select public.logger_duo('share','{"weight":true}');
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000002',true);
select pg_temp.check_true(public.logger_duo()->'documents'='[{"key":"day/2026-11-01","value":{"weightKg":80}}]'::jsonb,'field projection excludes activity, goals, food and measurements');
do $$ begin
 begin
   perform public.logger_duo('invite');
   raise exception 'TEST FAILED: second partner permitted';
 exception when raise_exception then
   if sqlerrm like 'TEST FAILED:%' then raise; end if;
 end;
end $$;
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000003',true);
select pg_temp.check_true(public.logger_duo()->>'status'='none','unrelated account has no link');
select pg_temp.check_true((select count(*) from public.logger_documents)=0,'unrelated account cannot read documents');
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000001',true);
select public.logger_duo('share','{}');
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000002',true);
select pg_temp.check_true(public.logger_duo()->'documents'='[]'::jsonb,'category revocation is immediate on server');
select public.logger_duo('revoke');
select pg_temp.check_true(public.logger_duo()->>'status'='none','revoked partner loses access');
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000001',true);
select pg_temp.check_true(public.logger_duo()->>'status'='none','revocation clears both ends');
reset role;
select pg_temp.check_true((select count(*) from public.logger_duo_sharing)=0,'permissions deleted on unlink');
rollback;
