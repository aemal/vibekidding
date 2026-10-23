-- Supabase Auth updates must invalidate prior guardian approval immediately.
create function public.studio_identity_changed() returns trigger
language plpgsql security definer set search_path=public as $$
begin
 if (to_jsonb(new)->>'email') is distinct from (to_jsonb(old)->>'email')
 or ((to_jsonb(old)->>'email_confirmed_at') is not null and (to_jsonb(new)->>'email_confirmed_at') is null) then
  update studio_profiles set email=coalesce(to_jsonb(new)->>'email',''),email_verified_at=null,
   status=case when status='suspended' then 'suspended' else 'pending' end,
   consent_reference=null,supervised_until=null where id=new.id;
  delete from studio_parent_sessions where user_id=new.id;
  update studio_projects set published=false,review_requested=false where owner_id=new.id;
 end if;
 return new;
end $$;
revoke all on function studio_identity_changed() from public,anon,authenticated,service_role;
create trigger studio_identity_changed after update on auth.users
for each row execute function public.studio_identity_changed();
