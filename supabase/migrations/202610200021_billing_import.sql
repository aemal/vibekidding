-- Reviewed, normalized per-request evidence only; never distribute aggregate invoices.
create table public.studio_billing_imports (
 usage_id uuid primary key references public.studio_usage,
 provider text not null,
 provider_request_id text not null,
 charge bigint not null,
 source_sha256 text not null,
 actor uuid not null,
 created_at timestamptz not null default now(),
 unique(provider,provider_request_id)
);
alter table public.studio_billing_imports enable row level security;
revoke all on public.studio_billing_imports from public,anon,authenticated;
grant all on public.studio_billing_imports to service_role;
create function public.studio_billing_import(p_actor uuid,p_digest text,p_rows jsonb,p_apply boolean)
returns jsonb language plpgsql security definer set search_path=public as $$
declare row jsonb; u studio_usage; imported studio_billing_imports; n integer:=0;
begin
 if p_actor is null or p_digest is null or p_digest !~ '^[0-9a-f]{64}$'
 or p_apply is null or jsonb_typeof(p_rows) is distinct from 'array' then raise exception 'Invalid import'; end if;
 if jsonb_array_length(p_rows) not between 1 and 100 then raise exception 'Import requires 1 to 100 rows'; end if;
 if exists(select 1 from jsonb_array_elements(p_rows) r group by r->>'usageId' having count(*)>1)
 or exists(select 1 from jsonb_array_elements(p_rows) r group by r->>'provider',r->>'requestId' having count(*)>1)
 then raise exception 'Duplicate import rows'; end if;
 -- Serialize imports; take all account locks before any usage locks, in stable order.
 perform pg_advisory_xact_lock(827341,21);
 perform 1 from studio_profiles where id in
 (select user_id from studio_usage where id in(select (r->>'usageId')::uuid from jsonb_array_elements(p_rows) r)) order by id for update;
 for row in select value from jsonb_array_elements(p_rows) order by value->>'usageId' loop
  select * into u from studio_usage where id=(row->>'usageId')::uuid for update;
  if u.id is null or u.provider is distinct from row->>'provider'
  or u.provider_request_id is null or u.provider_request_id is distinct from row->>'requestId'
  or jsonb_typeof(row->'chargeMicroUsd') is distinct from 'number'
  or (row->>'chargeMicroUsd') !~ '^[0-9]+$'
  or (row->>'chargeMicroUsd')::numeric>u.reserved then raise exception 'Provider record mismatch or invalid charge'; end if;
  select * into imported from studio_billing_imports where provider=u.provider and provider_request_id=u.provider_request_id;
  if imported.usage_id is not null then
   if imported.usage_id<>u.id or imported.charge<>(row->>'chargeMicroUsd')::bigint or imported.source_sha256<>p_digest then
    raise exception 'Conflicting imported evidence';
   end if;
   continue;
  end if;
  if u.state<>'reserved' or u.created_at>now()-interval '1 hour' then raise exception 'Reservation is settled or still recent'; end if;
  if exists(select 1 from studio_reconciliations where usage_id=u.id) then raise exception 'Previously reconciled reservation'; end if;
  if p_apply then
   perform studio_reconcile_usage(p_actor,u.id,(row->>'chargeMicroUsd')::bigint,'sha256:'||p_digest,u.provider_request_id);
   insert into studio_billing_imports(usage_id,provider,provider_request_id,charge,source_sha256,actor)
   values(u.id,u.provider,u.provider_request_id,(row->>'chargeMicroUsd')::bigint,p_digest,p_actor);
  end if;
  n:=n+1;
 end loop;
 return jsonb_build_object('apply',p_apply,'eligible',n,'already_imported',jsonb_array_length(p_rows)-n);
end $$;
revoke all on function studio_billing_import(uuid,text,jsonb,boolean) from public,anon,authenticated;
grant execute on function studio_billing_import(uuid,text,jsonb,boolean) to service_role;

create or replace function public.studio_schema_status()
returns jsonb language sql security definer set search_path=public as $$
 select jsonb_build_object('revision',21,'ready',
  to_regprocedure('public.studio_billing_import(uuid,text,jsonb,boolean)') is not null
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
