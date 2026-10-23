-- Local content only. This receipt does not represent account/provider/backup erasure.
alter table public.studio_deletion_requests add column content_erased_at timestamptz;
alter table public.studio_deletion_requests add column content_erased_by uuid;
create function public.studio_content_deletion_hold()
returns trigger language plpgsql security definer set search_path=public as $$
declare owner_id uuid;
begin
 if tg_table_name='studio_projects' then owner_id:=new.owner_id; else owner_id:=new.user_id; end if;
 perform 1 from studio_profiles where id=owner_id for update;
 if exists(select 1 from studio_deletion_requests where user_id=owner_id) then
  raise exception 'Account deletion pending; content writes are closed';
 end if;
 return new;
end $$;
revoke all on function studio_content_deletion_hold() from public,anon,authenticated,service_role;
create trigger studio_content_deletion_hold before insert or update of owner_id,title,slug,html on studio_projects for each row execute function studio_content_deletion_hold();
create trigger studio_content_deletion_hold before insert or update on studio_activity for each row execute function studio_content_deletion_hold();
create trigger studio_content_deletion_hold before insert or update on studio_records for each row execute function studio_content_deletion_hold();
create trigger studio_content_deletion_hold before insert on studio_outbox for each row execute function studio_content_deletion_hold();
create or replace function public.studio_deletion_hold()
returns trigger language plpgsql security definer set search_path=public as $$
begin
 if exists(select 1 from studio_deletion_requests where user_id=new.id)
 and (new.status='approved' or new.consent_reference is not null or new.supervised_until is not null
  or (new.family_rules is distinct from old.family_rules and new.family_rules<>'[]'::jsonb)) then
  raise exception 'Account deletion review pending; access cannot be restarted';
 end if;
 return new;
end $$;
create function public.studio_erase_local_content(p_actor uuid,p_user uuid,p_requested_at timestamptz)
returns timestamptz language plpgsql security definer set search_path=public as $$
declare request studio_deletion_requests; receipt timestamptz;
begin
 if p_actor is null then raise exception 'Reviewer required'; end if;
 perform 1 from studio_profiles where id=p_user for update;
 select * into request from studio_deletion_requests where user_id=p_user for update;
 if request.user_id is null or request.requested_at is distinct from p_requested_at then raise exception 'Deletion request changed or missing'; end if;
 if request.content_erased_at is not null then return request.content_erased_at; end if;
 if exists(select 1 from studio_usage where user_id=p_user and state='reserved') then raise exception 'Resolve outstanding provider charges first'; end if;
 if exists(select 1 from studio_mail_jobs where user_id=p_user and lease_until>clock_timestamp()) then raise exception 'Notification send may still be in flight'; end if;
 -- Profile lock and write hold prevent late guarded content from being recreated.
 delete from studio_activity where user_id=p_user;
 delete from studio_records where user_id=p_user;
 delete from studio_projects where owner_id=p_user;
 delete from studio_rooms where host=p_user or guest=p_user;
 delete from studio_outbox where user_id=p_user;
 delete from studio_mail_jobs where user_id=p_user;
 delete from studio_parent_sessions where user_id=p_user;
 delete from studio_model_grants where user_id=p_user;
 update studio_profiles set family_rules='[]'::jsonb where id=p_user;
 receipt:=clock_timestamp();
 update studio_deletion_requests set content_erased_at=receipt,content_erased_by=p_actor where user_id=p_user;
 insert into studio_audit(actor,subject,action) values(p_actor,p_user,'local family content erased; identity, billing and external retention remain');
 return receipt;
end $$;
revoke all on function studio_erase_local_content(uuid,uuid,timestamptz) from public,anon,authenticated;
grant execute on function studio_erase_local_content(uuid,uuid,timestamptz) to service_role;

create or replace function public.studio_schema_status()
returns jsonb language sql security definer set search_path=public as $$
 select jsonb_build_object('revision',24,'ready',
  to_regprocedure('public.studio_erase_local_content(uuid,uuid,timestamptz)') is not null
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
