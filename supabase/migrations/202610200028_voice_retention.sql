-- Remove obsolete admission secrets only after billing is settled.
create index studio_voice_admissions_expiry on public.studio_voice_admissions(expires_at,id);
create function public.studio_voice_retention()
returns integer language plpgsql security definer set search_path=public as $$
declare removed integer;
begin
 delete from studio_voice_admissions where id in (
  select a.id from studio_voice_admissions a
  where a.expires_at < now()-interval '30 days'
   and (a.claimed_at is null or a.claimed_at+a.duration_ms*interval '1 millisecond' < now()-interval '30 days')
   and exists(select 1 from studio_usage u where u.id=a.id and u.user_id=a.user_id and u.state='settled')
  order by a.expires_at,a.id limit 1000 for update of a skip locked
 );
 get diagnostics removed = row_count;
 return removed;
end $$;
revoke all on function studio_voice_retention() from public,anon,authenticated;
grant execute on function studio_voice_retention() to service_role;

create or replace function public.studio_privacy_maintenance()
returns jsonb language plpgsql security definer set search_path=public as $$
declare activities integer; sessions integer; rooms integer; events integer; voice_admissions integer;
begin
 delete from studio_activity where id in (
  select id from studio_activity where created_at < now()-interval '30 days'
  order by created_at,id limit 1000 for update skip locked
 );
 get diagnostics activities = row_count;
 -- Alert -> job -> event deletion cascades remove related notification metadata.
 delete from studio_parent_sessions where token_hash in (
  select token_hash from studio_parent_sessions where expires_at <= now()
  order by expires_at,token_hash limit 1000 for update skip locked
 );
 get diagnostics sessions = row_count;
 delete from studio_rooms where id in (
  select id from studio_rooms where expires_at <= now()
  order by expires_at,id limit 1000 for update skip locked
 );
 get diagnostics rooms = row_count;
 delete from studio_mail_events where id in (
  select id from studio_mail_events where received_at < now()-interval '30 days'
  order by received_at,id limit 1000 for update skip locked
 );
 get diagnostics events = row_count;
 voice_admissions := studio_voice_retention();
 return jsonb_build_object('activities',activities,'sessions',sessions,'rooms',rooms,'events',events,'voice_admissions',voice_admissions);
end $$;
revoke all on function studio_privacy_maintenance() from public,anon,authenticated;
grant execute on function studio_privacy_maintenance() to service_role;

create or replace function public.studio_schema_status()
returns jsonb language sql security definer set search_path=public as $$
 select jsonb_build_object('revision',28,'ready',
  to_regprocedure('public.studio_voice_retention()') is not null
  and not has_function_privilege('anon','public.studio_voice_retention()','EXECUTE')
  and not has_function_privilege('authenticated','public.studio_voice_retention()','EXECUTE')
  and
  to_regprocedure('public.studio_parent_mail_claim(uuid,text,uuid,jsonb)') is not null
  and not has_function_privilege('authenticated','public.studio_parent_mail_claim(uuid,text,uuid,jsonb)','EXECUTE')
  and not has_function_privilege('anon','public.studio_parent_mail_claim(uuid,text,uuid,jsonb)','EXECUTE')
  and to_regprocedure('public.studio_parent_control(uuid,text,text,jsonb)') is not null
  and not has_function_privilege('authenticated','public.studio_parent_control(uuid,text,text,jsonb)','EXECUTE')
  and not has_function_privilege('anon','public.studio_parent_control(uuid,text,text,jsonb)','EXECUTE')
  and to_regprocedure('public.studio_erase_local_content(uuid,uuid,timestamptz)') is not null
  and (select count(*) from pg_trigger where tgname='studio_content_deletion_hold' and tgenabled in ('O','A') and tgrelid in ('studio_projects'::regclass,'studio_activity'::regclass,'studio_records'::regclass,'studio_outbox'::regclass))=4
  and to_regprocedure('public.studio_mail_claim_before_deletion_hold(uuid,text,jsonb)') is not null
  and not has_function_privilege('service_role','public.studio_mail_claim_before_deletion_hold(uuid,text,jsonb)','EXECUTE')
  and to_regprocedure('public.studio_request_deletion(uuid)') is not null
  and exists(select 1 from pg_trigger where tgname='studio_deletion_hold' and tgrelid='studio_profiles'::regclass and tgenabled in ('O','A'))
  and to_regprocedure('public.studio_billing_import(uuid,text,jsonb,boolean)') is not null
  and to_regprocedure('public.studio_voice_authorized(uuid,uuid)') is not null
  and to_regprocedure('public.studio_voice_end(uuid,uuid)') is not null
  and to_regprocedure('public.studio_voice_admit(uuid,uuid,uuid,text,bigint,integer,text,bigint)') is not null
  and to_regprocedure('public.studio_voice_claim(uuid,text)') is not null
  and to_regprocedure('public.studio_privacy_inventory(uuid)') is not null
  and to_regprocedure('public.studio_parent_attempt(uuid,text)') is not null
  and to_regprocedure('public.studio_parent_unlock(uuid,text,text,bigint)') is not null
  and to_regprocedure('public.studio_reserve(uuid,uuid,text,text,bigint,bigint)') is not null
  and to_regprocedure('public.studio_guarded_save(uuid,uuid,text,text,jsonb,bigint)') is not null
  and to_regprocedure('public.studio_account_review(uuid,uuid,boolean,bigint,text)') is not null
  and to_regprocedure('public.studio_withdraw_consent(uuid)') is not null
  and to_regprocedure('public.studio_generation_claim(uuid,uuid,uuid,bigint)') is not null
  and exists(select 1 from pg_trigger where tgname='studio_identity_changed' and tgrelid='auth.users'::regclass and tgenabled in ('O','A'))
  and exists(select 1 from pg_trigger where tgname='studio_safety_revision' and tgrelid='studio_profiles'::regclass and tgenabled in ('O','A'))
  and not exists(
   select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace
   where n.nspname='public' and c.relkind='r' and c.relname like 'studio_%'
   and (not c.relrowsecurity or has_table_privilege('anon',c.oid,'INSERT,UPDATE,DELETE,TRUNCATE')
    or has_table_privilege('authenticated',c.oid,'INSERT,UPDATE,DELETE,TRUNCATE'))
  )
 );
$$;
revoke all on function studio_schema_status() from public,anon,authenticated;
grant execute on function studio_schema_status() to service_role;
