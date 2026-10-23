-- Invalidate in-flight results even when a parent pauses/resumes or changes rules back.
alter table public.studio_profiles add column safety_revision bigint not null default 0;
create function public.studio_safety_revision() returns trigger language plpgsql set search_path=public as $$
begin
 new.safety_revision := old.safety_revision;
 if row(new.status,new.email_verified_at,new.consent_reference,new.supervised_until,new.family_rules)
  is distinct from row(old.status,old.email_verified_at,old.consent_reference,old.supervised_until,old.family_rules) then
  new.safety_revision := old.safety_revision + 1;
 end if;
 return new;
end $$;
create trigger studio_safety_revision before update on public.studio_profiles
for each row execute function public.studio_safety_revision();
revoke all on function studio_safety_revision() from public,anon,authenticated;

-- Remove the old signature so service callers cannot omit the generation snapshot.
drop function public.studio_guarded_save(uuid,uuid,text,text,jsonb);
create function public.studio_guarded_save(p_user uuid,p_project uuid,p_old text,p_new text,p_rules jsonb,p_revision bigint)
returns public.studio_projects language plpgsql security definer set search_path=public as $$
declare saved studio_projects;
begin
 perform studio_require_supervision(p_user);
 if not exists(select 1 from studio_profiles where id=p_user and family_rules=p_rules and safety_revision=p_revision) then
  raise exception 'Session or safety policy changed; start a new request';
 end if;
 update studio_projects set html=p_new,published=false,review_requested=false
 where id=p_project and owner_id=p_user and html=p_old returning * into saved;
 if not found then raise exception 'Project changed'; end if;
 return saved;
end $$;
revoke all on function studio_guarded_save(uuid,uuid,text,text,jsonb,bigint) from public,anon,authenticated;
grant execute on function studio_guarded_save(uuid,uuid,text,text,jsonb,bigint) to service_role;
