-- At most two reusable rows per account; no email, token or request body stored.
create table public.studio_parent_attempts(
 user_id uuid not null references public.studio_profiles(id) on delete cascade,
 operation text not null check(operation in ('send-code','unlock')),
 attempts integer not null check(attempts between 1 and 10),
 window_ends_at timestamptz not null,
 primary key(user_id,operation)
);
alter table public.studio_parent_attempts enable row level security;
revoke all on studio_parent_attempts from public,anon,authenticated;

create function public.studio_parent_attempt(p_user uuid,p_operation text)
returns boolean language plpgsql security definer set search_path=public as $$
declare maximum integer; admitted uuid;
begin
 maximum := case p_operation when 'send-code' then 3 when 'unlock' then 10 else null end;
 if maximum is null or p_user is null then raise exception 'Invalid parent operation'; end if;
 insert into studio_parent_attempts(user_id,operation,attempts,window_ends_at)
 values(p_user,p_operation,1,clock_timestamp()+interval '15 minutes')
 on conflict(user_id,operation) do update
 set attempts=case when studio_parent_attempts.window_ends_at<=clock_timestamp() then 1 else studio_parent_attempts.attempts+1 end,
 window_ends_at=case when studio_parent_attempts.window_ends_at<=clock_timestamp() then clock_timestamp()+interval '15 minutes' else studio_parent_attempts.window_ends_at end
 where studio_parent_attempts.window_ends_at<=clock_timestamp() or studio_parent_attempts.attempts<maximum
 returning user_id into admitted;
 return admitted is not null;
end $$;
revoke all on function studio_parent_attempt(uuid,text) from public,anon,authenticated;
grant execute on function studio_parent_attempt(uuid,text) to service_role;

create or replace function public.studio_schema_status()
returns jsonb language sql security definer set search_path=public as $$
 select jsonb_build_object('revision',16,'ready',
  to_regprocedure('public.studio_parent_attempt(uuid,text)') is not null
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
