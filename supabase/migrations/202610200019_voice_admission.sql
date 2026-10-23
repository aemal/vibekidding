-- Inert relay foundation: no browser access or provider connection is enabled.
-- Store only a SHA-256 digest of a server-generated high-entropy admission secret.
create table public.studio_voice_admissions (
 id uuid primary key references public.studio_usage(id),
 user_id uuid not null references public.studio_profiles(id),
 project_id uuid not null references public.studio_projects(id) on delete cascade,
 token_hash text not null unique check(token_hash ~ '^[0-9a-f]{64}$'),
 safety_revision bigint not null,
 duration_ms integer not null check(duration_ms between 1000 and 180000),
 expires_at timestamptz not null,
 claimed_at timestamptz
);
alter table public.studio_voice_admissions enable row level security;
revoke all on public.studio_voice_admissions from public,anon,authenticated;
grant all on public.studio_voice_admissions to service_role;
create function public.studio_voice_admit(p_user uuid,p_id uuid,p_project uuid,p_hash text,p_revision bigint,p_duration integer,p_model text,p_amount bigint)
returns void language plpgsql security definer set search_path=public as $$
begin
 if p_hash is null or p_hash !~ '^[0-9a-f]{64}$' or p_duration is null
 or p_duration not between 1000 and 180000 or p_amount is null or p_amount<=0
 or p_model is null or length(p_model) not between 1 and 200 then
  raise exception 'Invalid voice admission';
 end if;
 perform studio_require_supervision(p_user);
 perform 1 from studio_projects where id=p_project and owner_id=p_user for update;
 if not found then raise exception 'Not your project'; end if;
 -- Both the reservation and admission commit, or neither does.
 perform studio_reserve(p_user,p_id,'elevenlabs',p_model,p_amount,p_revision);
 insert into studio_voice_admissions(id,user_id,project_id,token_hash,safety_revision,duration_ms,expires_at)
 values(p_id,p_user,p_project,p_hash,p_revision,p_duration,clock_timestamp()+interval '30 seconds');
end $$;
create function public.studio_voice_claim(p_user uuid,p_hash text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare admission studio_voice_admissions;
begin
 -- User identity comes from authenticated server context, never from the token alone.
 perform studio_require_supervision(p_user);
 select * into admission from studio_voice_admissions where user_id=p_user and token_hash=p_hash for update;
 if admission.id is null or admission.claimed_at is not null or admission.expires_at<=clock_timestamp()
 or not exists(select 1 from studio_profiles where id=p_user and safety_revision=admission.safety_revision)
 or not exists(select 1 from studio_projects where id=admission.project_id and owner_id=p_user)
 or not exists(select 1 from studio_usage where id=admission.id and user_id=p_user and state='reserved') then
  raise exception 'Voice admission unavailable';
 end if;
 update studio_voice_admissions set claimed_at=clock_timestamp() where id=admission.id;
 return jsonb_build_object('usage_id',admission.id,'project_id',admission.project_id,
  'duration_ms',admission.duration_ms,'safety_revision',admission.safety_revision);
end $$;
revoke all on function studio_voice_admit(uuid,uuid,uuid,text,bigint,integer,text,bigint),studio_voice_claim(uuid,text) from public,anon,authenticated;
grant execute on function studio_voice_admit(uuid,uuid,uuid,text,bigint,integer,text,bigint),studio_voice_claim(uuid,text) to service_role;

create or replace function public.studio_schema_status()
returns jsonb language sql security definer set search_path=public as $$
 select jsonb_build_object('revision',19,'ready',
  to_regprocedure('public.studio_voice_admit(uuid,uuid,uuid,text,bigint,integer,text,bigint)') is not null
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
