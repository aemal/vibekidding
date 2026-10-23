-- Caller must have a freshly verified parent session at the server.
create function public.studio_withdraw_consent(p_user uuid)
returns void language plpgsql security definer set search_path=public as $$
begin
 perform 1 from studio_profiles where id=p_user for update;
 if not found then raise exception 'Account missing'; end if;
 update studio_profiles set consent_reference=null,supervised_until=null,
  status=case when status='suspended' then 'suspended' else 'pending' end where id=p_user;
 delete from studio_parent_sessions where user_id=p_user;
 update studio_projects set published=false,review_requested=false where owner_id=p_user;
 insert into studio_audit(actor,subject,action) values(p_user,p_user,'guardian withdrew consent; access and publication stopped');
end $$;
revoke all on function studio_withdraw_consent(uuid) from public,anon,authenticated;
grant execute on function studio_withdraw_consent(uuid) to service_role;
