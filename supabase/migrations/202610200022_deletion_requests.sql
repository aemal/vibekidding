-- A request is not an erasure receipt. No provider or accounting records are deleted.
create table public.studio_deletion_requests (
 user_id uuid primary key references public.studio_profiles,
 requested_at timestamptz not null default clock_timestamp()
);
alter table public.studio_deletion_requests enable row level security;
revoke all on public.studio_deletion_requests from public,anon,authenticated;
grant all on public.studio_deletion_requests to service_role;
create function public.studio_request_deletion(p_user uuid)
returns void language plpgsql security definer set search_path=public as $$
begin
 perform 1 from studio_profiles where id=p_user for update;
 if not found then raise exception 'Account missing'; end if;
 if exists(select 1 from studio_deletion_requests where user_id=p_user) then return; end if;
 perform studio_withdraw_consent(p_user);
 insert into studio_deletion_requests(user_id) values(p_user);
 insert into studio_audit(actor,subject,action) values(p_user,p_user,'guardian requested account deletion review; not erased');
end $$;
revoke all on function studio_request_deletion(uuid) from public,anon,authenticated;
grant execute on function studio_request_deletion(uuid) to service_role;
create function public.studio_deletion_hold()
returns trigger language plpgsql security definer set search_path=public as $$
begin
 if exists(select 1 from studio_deletion_requests where user_id=new.id)
 and (new.status='approved' or new.consent_reference is not null or new.supervised_until is not null) then
  raise exception 'Account deletion review pending; access cannot be restarted';
 end if;
 return new;
end $$;
revoke all on function studio_deletion_hold() from public,anon,authenticated,service_role;
create trigger studio_deletion_hold before update on public.studio_profiles for each row execute function studio_deletion_hold();

create or replace function public.studio_schema_status()
returns jsonb language sql security definer set search_path=public as $$
 select jsonb_build_object('revision',22,'ready',
  to_regprocedure('public.studio_request_deletion(uuid)') is not null
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
