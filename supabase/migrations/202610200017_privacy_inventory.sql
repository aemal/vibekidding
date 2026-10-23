-- Informational snapshot only; never an authorization to erase billing evidence.
create function public.studio_privacy_inventory(p_user uuid)
returns jsonb language sql stable security definer set search_path=public as $$
 select jsonb_build_object(
  'projects',(select count(*) from studio_projects where owner_id=p_user),
  'published_projects',(select count(*) from studio_projects where owner_id=p_user and published),
  'activity',(select count(*) from studio_activity where user_id=p_user),
  'records',(select count(*) from studio_records where user_id=p_user),
  'usage_records',(select count(*) from studio_usage where user_id=p_user),
  'unsettled_usage',(select count(*) from studio_usage where user_id=p_user and state='reserved'),
  'notification_jobs',(select count(*) from studio_mail_jobs where user_id=p_user),
  'active_mail_leases',(select count(*) from studio_mail_jobs where user_id=p_user and lease_until>now()),
  'rooms',(select count(*) from studio_rooms where host=p_user or guest=p_user)
 ) where exists(select 1 from studio_profiles where id=p_user);
$$;
revoke all on function studio_privacy_inventory(uuid) from public,anon,authenticated;
grant execute on function studio_privacy_inventory(uuid) to service_role;

create or replace function public.studio_schema_status()
returns jsonb language sql security definer set search_path=public as $$
 select jsonb_build_object('revision',17,'ready',
  to_regprocedure('public.studio_privacy_inventory(uuid)') is not null
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
