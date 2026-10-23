-- Recheck fresh parent authority after acquiring account/session locks.
-- Service-only: the server supplies the hash of the HTTP-only parent cookie.
create function public.studio_parent_control(p_user uuid,p_hash text,p_operation text,p_rules jsonb)
returns void language plpgsql security definer set search_path=public as $$
declare p studio_profiles; s studio_parent_sessions;
begin
 select * into p from studio_profiles where id=p_user for update;
 if p.id is null or p_hash is null or p_hash !~ '^[a-f0-9]{64}$' then raise exception 'Fresh parent verification required'; end if;
 select * into s from studio_parent_sessions where user_id=p_user and token_hash=p_hash for update;
 if s.user_id is null or s.expires_at<=clock_timestamp() then raise exception 'Fresh parent verification required'; end if;
 if p_operation='start' then
  if p_rules is not null or p.status<>'approved' or p.email_verified_at is null or p.consent_reference is null then
   raise exception 'Approved guardian consent required';
  end if;
  update studio_profiles set supervised_until=clock_timestamp()+interval '30 minutes' where id=p_user;
 elsif p_operation='rules' then
  if p_rules is null or jsonb_typeof(p_rules)<>'array' then raise exception 'Invalid family rules'; end if;
  if jsonb_array_length(p_rules)>10 or exists(
   select 1 from jsonb_array_elements(p_rules) r
   where jsonb_typeof(r)<>'string' or length(trim(r#>>'{}'))=0 or length(r#>>'{}')>400
  ) then raise exception 'Invalid family rules'; end if;
  update studio_profiles set family_rules=p_rules,supervised_until=null where id=p_user;
 else raise exception 'Unknown parent operation';
 end if;
end $$;
revoke all on function studio_parent_control(uuid,text,text,jsonb) from public,anon,authenticated;
grant execute on function studio_parent_control(uuid,text,text,jsonb) to service_role;

create or replace function public.studio_schema_status()
returns jsonb language sql security definer set search_path=public as $$
 select jsonb_build_object('revision',25,'ready',
  to_regprocedure('public.studio_parent_control(uuid,text,text,jsonb)') is not null
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
