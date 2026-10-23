-- A deletion request stops new notification attempts, including retries.
-- Already leased/in-flight sends cannot be recalled; retain their results for review.
alter function public.studio_mail_claim(uuid,text,jsonb) rename to studio_mail_claim_before_deletion_hold;
revoke all on function studio_mail_claim_before_deletion_hold(uuid,text,jsonb) from public,anon,authenticated,service_role;
create function public.studio_mail_claim(p_id uuid,p_kind text,p_payload jsonb)
returns jsonb language plpgsql security definer set search_path=public as $$
declare owner_id uuid; claimed jsonb;
begin
 if p_kind='admin' then select user_id into owner_id from studio_outbox where id=p_id;
 elsif p_kind='parent' then select user_id into owner_id from studio_parent_alerts where id=p_id;
 else raise exception 'Invalid notification kind'; end if;
 if owner_id is null then return null; end if;
 -- Same profile-first order as deletion requests. Evaluate after lock acquisition.
 perform 1 from studio_profiles where id=owner_id for update;
 if not found or exists(select 1 from studio_deletion_requests where user_id=owner_id) then return null; end if;
 claimed:=studio_mail_claim_before_deletion_hold(p_id,p_kind,p_payload);
 if claimed is not null and (claimed->>'user_id')::uuid is distinct from owner_id then
  raise exception 'Notification owner changed';
 end if;
 return claimed;
end $$;
revoke all on function studio_mail_claim(uuid,text,jsonb) from public,anon,authenticated;
grant execute on function studio_mail_claim(uuid,text,jsonb) to service_role;
create or replace function public.studio_mail_pending()
returns table(id uuid,kind text,user_id uuid) language sql security definer set search_path=public as $$
 select s.id,s.kind,s.user_id from (
 select id,'admin'::text kind,user_id,created_at from studio_outbox where sent_at is null
 union all
 select id,'parent'::text kind,user_id,created_at from studio_parent_alerts where sent_at is null
 ) s left join studio_mail_jobs j on j.id=s.id
 where not exists(select 1 from studio_deletion_requests d where d.user_id=s.user_id)
 and (j.id is null or (j.status='pending' and j.next_attempt_at<=now() and (j.lease_until is null or j.lease_until<=now())))
 order by s.created_at limit 5;
$$;

create or replace function public.studio_schema_status()
returns jsonb language sql security definer set search_path=public as $$
 select jsonb_build_object('revision',23,'ready',
  to_regprocedure('public.studio_mail_claim_before_deletion_hold(uuid,text,jsonb)') is not null
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
