-- Durable authorization for the future relay watchdog; no endpoint is enabled.
alter table public.studio_voice_admissions add column ended_at timestamptz;
create function public.studio_voice_authorized(p_user uuid,p_id uuid)
returns boolean language plpgsql security definer set search_path=public as $$
declare profile studio_profiles; admission studio_voice_admissions; allowed boolean;
begin
 -- Serialize against parental changes and settlement, then the session itself.
 select * into profile from studio_profiles where id=p_user for update;
 select * into admission from studio_voice_admissions where id=p_id and user_id=p_user for update;
 if admission.id is null then return false; end if;
 allowed := coalesce(profile.status='approved' and profile.email_verified_at is not null
  and profile.consent_reference is not null and profile.supervised_until>clock_timestamp()
  and profile.safety_revision=admission.safety_revision and admission.claimed_at is not null
  and admission.ended_at is null and admission.claimed_at<=clock_timestamp()
  and admission.claimed_at + admission.duration_ms*interval '1 millisecond'>clock_timestamp()
  and exists(select 1 from studio_projects where id=admission.project_id and owner_id=p_user)
  and exists(select 1 from studio_usage where id=p_id and user_id=p_user and state='reserved'),false);
 if not allowed then
  update studio_voice_admissions set ended_at=coalesce(ended_at,clock_timestamp()) where id=p_id;
 end if;
 return allowed;
end $$;
create function public.studio_voice_end(p_user uuid,p_id uuid)
returns void language plpgsql security definer set search_path=public as $$
begin
 perform 1 from studio_profiles where id=p_user for update;
 update studio_voice_admissions set ended_at=coalesce(ended_at,clock_timestamp()) where id=p_id and user_id=p_user;
 -- Ending a session is not evidence of provider termination or billable usage.
 -- Keep the reservation until trusted reconciliation settles it.
end $$;
revoke all on function studio_voice_authorized(uuid,uuid),studio_voice_end(uuid,uuid) from public,anon,authenticated;
grant execute on function studio_voice_authorized(uuid,uuid),studio_voice_end(uuid,uuid) to service_role;

create or replace function public.studio_voice_claim(p_user uuid,p_hash text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare admission studio_voice_admissions;
begin
 -- User identity comes from authenticated server context, never from the token alone.
 perform studio_require_supervision(p_user);
 select * into admission from studio_voice_admissions where user_id=p_user and token_hash=p_hash for update;
 if admission.id is null or admission.claimed_at is not null or admission.ended_at is not null or admission.expires_at<=clock_timestamp()
 or not exists(select 1 from studio_profiles where id=p_user and safety_revision=admission.safety_revision)
 or not exists(select 1 from studio_projects where id=admission.project_id and owner_id=p_user)
 or not exists(select 1 from studio_usage where id=admission.id and user_id=p_user and state='reserved') then
  raise exception 'Voice admission unavailable';
 end if;
 update studio_voice_admissions set claimed_at=clock_timestamp() where id=admission.id;
 return jsonb_build_object('usage_id',admission.id,'project_id',admission.project_id,
  'duration_ms',admission.duration_ms,'safety_revision',admission.safety_revision);
end $$;

create or replace function public.studio_schema_status()
returns jsonb language sql security definer set search_path=public as $$
 select jsonb_build_object('revision',20,'ready',
  to_regprocedure('public.studio_voice_authorized(uuid,uuid)') is not null
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
