create function public.studio_account_review(p_actor uuid,p_user uuid,p_approve boolean,p_revision bigint,p_reference text)
returns void language plpgsql security definer set search_path=public as $$
declare p studio_profiles;
begin
 if p_actor is null or p_approve is null then raise exception 'Invalid review'; end if;
 select * into p from studio_profiles where id=p_user for update;
 if p.id is null then raise exception 'Account missing'; end if;
 if p_approve then
  if p.safety_revision is distinct from p_revision or p.email_verified_at is null
   or p_reference is null or length(trim(p_reference)) not between 1 and 500 then
   raise exception 'Account changed or consent review missing; refresh and review again';
  end if;
  update studio_profiles set status='approved',consent_reference=trim(p_reference),supervised_until=null where id=p_user;
 else
  update studio_profiles set status='suspended',supervised_until=null where id=p_user;
  update studio_projects set published=false,review_requested=false where owner_id=p_user;
 end if;
 delete from studio_parent_sessions where user_id=p_user;
 insert into studio_audit(actor,subject,action) values(p_actor,p_user,
  case when p_approve then 'guardian consent reviewed and approved' else 'account suspended and sessions revoked' end);
end $$;
revoke all on function studio_account_review(uuid,uuid,boolean,bigint,text) from public,anon,authenticated;
grant execute on function studio_account_review(uuid,uuid,boolean,bigint,text) to service_role;
