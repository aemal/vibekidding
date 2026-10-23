create or replace function public.studio_settle(p_id uuid,p_charge bigint,p_input integer,p_output integer)
returns void language plpgsql security definer set search_path=public as $$
declare u studio_usage;
begin
 if p_charge is null or p_charge<0
 or p_input<0 or p_output<0 or ((p_input is null)<>(p_output is null)) then
  raise exception 'Invalid settlement values';
 end if;
 -- Preserve profile-first lock order shared by reservations/reconciliation.
 perform 1 from studio_profiles where id=(select user_id from studio_usage where id=p_id) for update;
 select * into u from studio_usage where id=p_id for update;
 if u.id is null then raise exception 'Unknown reservation'; end if;
 if u.state='settled' then
  if u.charged=p_charge and u.input_tokens is not distinct from p_input
   and u.output_tokens is not distinct from p_output then return; end if;
  raise exception 'Settlement conflicts with recorded usage';
 end if;
 if p_charge>u.reserved then raise exception 'Charge outside reservation'; end if;
 update studio_profiles set credits=credits+u.reserved-p_charge where id=u.user_id;
 update studio_budget set reserved=reserved-u.reserved+p_charge where day=(u.created_at at time zone 'UTC')::date;
 update studio_usage set charged=p_charge,state='settled',input_tokens=p_input,output_tokens=p_output where id=p_id;
end $$;
revoke all on function studio_settle(uuid,bigint,integer,integer) from public,anon,authenticated;
grant execute on function studio_settle(uuid,bigint,integer,integer) to service_role;

create or replace function public.studio_schema_status()
returns jsonb language sql security definer set search_path=public as $$
 select jsonb_build_object('revision',18,'ready',
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
