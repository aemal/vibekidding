-- Dedicated viewer storage, separate from the builder's private studio_records.
create table public.studio_app_storage_permissions (
 project_id uuid primary key references studio_projects on delete cascade,
 reviewed_html text not null check(octet_length(reviewed_html)<=400000),
 reviewer uuid not null references studio_profiles,
 reviewed_at timestamptz not null default now()
);
create table public.studio_app_records (
 project_id uuid not null references studio_projects on delete cascade,
 user_id uuid not null references studio_profiles on delete cascade,
 key text not null check(key ~ '^[a-z][a-z0-9_-]{0,63}$'),
 value text not null check(octet_length(value)<=4096),
 primary key(project_id,user_id,key)
);
create table public.studio_app_requests (
 project_id uuid not null references studio_projects on delete cascade,
 user_id uuid not null references studio_profiles on delete cascade,
 request_id uuid not null,
 created_at timestamptz not null default now(),
 primary key(project_id,user_id,request_id)
);
create index studio_app_requests_budget on studio_app_requests(project_id,created_at,user_id);
do $$ declare t text; begin
 foreach t in array array['studio_app_storage_permissions','studio_app_records','studio_app_requests'] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('revoke all on public.%I from public,anon,authenticated',t);
  execute format('grant all on public.%I to service_role',t);
 end loop;
end $$;
create function public.studio_app_storage_review(p_actor uuid,p_project uuid,p_html text,p_allow boolean)
returns void language plpgsql security definer set search_path=public as $$
declare project studio_projects;
begin
 if p_actor is null or p_allow is null then raise exception 'Review required'; end if;
 perform 1 from studio_profiles where id=(select owner_id from studio_projects where id=p_project) for update;
 select * into project from studio_projects where id=p_project for update;
 if project.id is null then raise exception 'Project unavailable'; end if;
 if not p_allow then
  delete from studio_app_storage_permissions where project_id=p_project;
  insert into studio_audit(actor,subject,action) values(p_actor,project.owner_id,'published storage permission revoked');
  return;
 end if;
 if not project.published or project.html is distinct from p_html or project.html='' then raise exception 'Review current published code'; end if;
 insert into studio_app_storage_permissions(project_id,reviewed_html,reviewer) values(p_project,p_html,p_actor)
 on conflict(project_id) do update set reviewed_html=excluded.reviewed_html,reviewer=excluded.reviewer,reviewed_at=now();
 insert into studio_audit(actor,subject,action) values(p_actor,project.owner_id,'published storage permission reviewed');
end $$;
create function public.studio_app_record(p_user uuid,p_project uuid,p_request uuid,p_operation text,p_key text,p_value text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare project studio_projects; owner uuid; member uuid; stored text; day_start timestamptz;
begin
 if p_user is null or p_request is null or p_operation is null or p_operation not in ('read','write')
 or p_key is null or p_key !~ '^[a-z][a-z0-9_-]{0,63}$'
 or (p_operation='read' and p_value is not null)
 or (p_operation='write' and (p_value is null or octet_length(p_value)>4096)) then raise exception 'Invalid storage operation'; end if;
 select owner_id into owner from studio_projects where id=p_project;
 if owner is null then raise exception 'Project unavailable'; end if;
 for member in select distinct x from unnest(array[p_user,owner]) x order by x loop
  perform 1 from studio_profiles where id=member for update;
 end loop;
 perform studio_require_supervision(p_user);
 if exists(select 1 from studio_deletion_requests where user_id in (p_user,owner)) then raise exception 'Account unavailable'; end if;
 if not exists(select 1 from studio_profiles where id=owner and status='approved' and email_verified_at is not null and consent_reference is not null) then raise exception 'Project unavailable'; end if;
 select * into project from studio_projects where id=p_project for update;
 if project.owner_id is distinct from owner or not project.published
 or not exists(select 1 from studio_app_storage_permissions where project_id=p_project and reviewed_html=project.html) then raise exception 'Storage permission unavailable'; end if;
 -- Project lock serializes quota accounting and writes across every viewer.
 if exists(select 1 from studio_app_requests where project_id=p_project and user_id=p_user and request_id=p_request) then raise exception 'Request already used'; end if;
 day_start:=date_trunc('day',clock_timestamp() at time zone 'UTC') at time zone 'UTC';
 if (select count(*) from studio_app_requests where project_id=p_project and created_at>=day_start)>=10000
 or (select count(*) from studio_app_requests where project_id=p_project and user_id=p_user and created_at>=day_start)>=200 then raise exception 'Daily storage limit reached'; end if;
 if p_operation='write' then
  if not exists(select 1 from studio_app_records where project_id=p_project and user_id=p_user and key=p_key)
   and ((select count(*) from studio_app_records where project_id=p_project and user_id=p_user)>=100
    or (select count(*) from studio_app_records where project_id=p_project)>=10000) then raise exception 'Storage quota reached'; end if;
  insert into studio_app_records values(p_project,p_user,p_key,p_value)
   on conflict(project_id,user_id,key) do update set value=excluded.value;
 end if;
 insert into studio_app_requests(project_id,user_id,request_id) values(p_project,p_user,p_request);
 select value into stored from studio_app_records where project_id=p_project and user_id=p_user and key=p_key;
 return jsonb_build_object('value',stored);
end $$;
revoke all on function studio_app_storage_review(uuid,uuid,text,boolean),studio_app_record(uuid,uuid,uuid,text,text,text) from public,anon,authenticated;
grant execute on function studio_app_storage_review(uuid,uuid,text,boolean),studio_app_record(uuid,uuid,uuid,text,text,text) to service_role;
-- Extend local erasure without weakening its original authorization/receipt checks.
alter function studio_erase_local_content(uuid,uuid,timestamptz) rename to studio_erase_local_content_before_app_storage;
revoke all on function studio_erase_local_content_before_app_storage(uuid,uuid,timestamptz) from public,anon,authenticated,service_role;
create function public.studio_erase_local_content(p_actor uuid,p_user uuid,p_requested_at timestamptz)
returns timestamptz language plpgsql security definer set search_path=public as $$
declare receipt timestamptz;
begin
 receipt:=studio_erase_local_content_before_app_storage(p_actor,p_user,p_requested_at);
 delete from studio_app_records where user_id=p_user;
 delete from studio_app_requests where user_id=p_user;
 return receipt;
end $$;
revoke all on function studio_erase_local_content(uuid,uuid,timestamptz) from public,anon,authenticated;
grant execute on function studio_erase_local_content(uuid,uuid,timestamptz) to service_role;

-- Informational snapshot only; never an authorization to erase billing evidence.
create or replace function public.studio_privacy_inventory(p_user uuid)
returns jsonb language sql stable security definer set search_path=public as $$
 select jsonb_build_object(
  'projects',(select count(*) from studio_projects where owner_id=p_user),
  'published_projects',(select count(*) from studio_projects where owner_id=p_user and published),
  'activity',(select count(*) from studio_activity where user_id=p_user),
  'records',(select count(*) from studio_records where user_id=p_user)+(select count(*) from studio_app_records where user_id=p_user),
  'app_requests',(select count(*) from studio_app_requests where user_id=p_user),
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
 select jsonb_build_object('revision',29,'ready',
  to_regprocedure('public.studio_app_record(uuid,uuid,uuid,text,text,text)') is not null
  and not has_function_privilege('authenticated','public.studio_app_record(uuid,uuid,uuid,text,text,text)','EXECUTE')
  and not has_function_privilege('service_role','public.studio_erase_local_content_before_app_storage(uuid,uuid,timestamptz)','EXECUTE')
  and
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
