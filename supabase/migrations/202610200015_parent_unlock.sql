-- Called only after the server verifies a fresh email OTP.
-- Serialize final unlock with consent, identity and suspension changes.
create function public.studio_parent_unlock(p_user uuid,p_hash text,p_email text,p_revision bigint)
returns void language plpgsql security definer set search_path=public as $$
declare p studio_profiles;
begin
 select * into p from studio_profiles where id=p_user for update;
 if p.id is null or p_revision is null or p.safety_revision<>p_revision
 or p.email_verified_at is null or p_email is null
 or lower(p.email)<>lower(p_email) then
  raise exception 'Account changed; verify a new parent code';
 end if;
 if p_hash is null or p_hash !~ '^[a-f0-9]{64}$' then
  raise exception 'Invalid unlock token';
 end if;
 insert into studio_parent_sessions(token_hash,user_id,expires_at)
 values(p_hash,p_user,clock_timestamp()+interval '15 minutes');
end $$;
revoke all on function studio_parent_unlock(uuid,text,text,bigint) from public,anon,authenticated;
grant execute on function studio_parent_unlock(uuid,text,text,bigint) to service_role;

create or replace function public.studio_schema_status()
returns jsonb language sql security definer set search_path=public as $$
 select jsonb_build_object('revision',15,'ready',
  to_regprocedure('public.studio_parent_unlock(uuid,text,text,bigint)') is not null
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
