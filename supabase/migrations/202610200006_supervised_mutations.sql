-- Recheck authorization under the same transaction lock as the mutation.
create function public.studio_require_supervision(p_user uuid)
returns void language plpgsql security definer set search_path=public as $$
declare profile studio_profiles;
begin
 select * into profile from studio_profiles where id=p_user for update;
 -- Evaluate wall time after acquiring the lock, including time spent waiting.
 if profile.id is null or profile.status<>'approved' or profile.email_verified_at is null or profile.consent_reference is null or profile.supervised_until is null or profile.supervised_until<=clock_timestamp() then raise exception 'A current approved supervised session is required'; end if;
end $$;
alter function public.studio_project_create(uuid,text,text) rename to studio_project_create_unchecked;
alter function public.studio_record_put(uuid,uuid,text,jsonb) rename to studio_record_put_unchecked;
alter function public.studio_room_create(uuid) rename to studio_room_create_unchecked;
alter function public.studio_room_action(uuid,uuid,integer) rename to studio_room_action_unchecked;
revoke all on function studio_require_supervision(uuid),studio_project_create_unchecked(uuid,text,text),studio_record_put_unchecked(uuid,uuid,text,jsonb),studio_room_create_unchecked(uuid),studio_room_action_unchecked(uuid,uuid,integer) from public,anon,authenticated,service_role;
create function public.studio_project_create(p_user uuid,p_title text,p_slug text)
returns public.studio_projects language plpgsql security definer set search_path=public as $$
begin
 perform studio_require_supervision(p_user);
 return studio_project_create_unchecked(p_user,p_title,p_slug);
end $$;
create function public.studio_record_put(p_user uuid,p_project uuid,p_key text,p_value jsonb)
returns void language plpgsql security definer set search_path=public as $$
begin
 perform studio_require_supervision(p_user);
 perform studio_record_put_unchecked(p_user,p_project,p_key,p_value);
end $$;
create function public.studio_room_create(p_user uuid)
returns public.studio_rooms language plpgsql security definer set search_path=public as $$
begin
 perform studio_require_supervision(p_user);
 return studio_room_create_unchecked(p_user);
end $$;
create function public.studio_room_action(p_user uuid,p_room uuid,p_cell integer default null)
returns public.studio_rooms language plpgsql security definer set search_path=public as $$
declare snapshot studio_rooms; member uuid;
begin
 select * into snapshot from studio_rooms where id=p_room;
 if snapshot.id is null or snapshot.expires_at<=now() then raise exception 'Room expired or missing'; end if;
 -- A consistent profile lock order avoids two participants deadlocking each other.
 for member in select distinct x from unnest(array[p_user,snapshot.host,snapshot.guest]) x where x is not null order by x loop
  perform studio_require_supervision(member);
 end loop;
 -- If a join completed while acquiring profile locks, retry against its membership.
 if not exists(select 1 from studio_rooms r where r.id=p_room and r.host=snapshot.host and r.guest is not distinct from snapshot.guest and r.expires_at>clock_timestamp()) then raise exception 'Room changed or expired; refresh and retry'; end if;
 -- Locking the host serializes joins; the underlying action rechecks membership/turn.
 return studio_room_action_unchecked(p_user,p_room,p_cell);
end $$;
revoke all on function studio_project_create(uuid,text,text),studio_record_put(uuid,uuid,text,jsonb),studio_room_create(uuid),studio_room_action(uuid,uuid,integer) from public,anon,authenticated;
grant execute on function studio_project_create(uuid,text,text),studio_record_put(uuid,uuid,text,jsonb),studio_room_create(uuid),studio_room_action(uuid,uuid,integer) to service_role;

-- RLS helper checks the room itself so callers cannot query arbitrary profile status.
create function public.studio_room_visible(p_room uuid)
returns boolean language sql stable security definer set search_path=public as $$
 select exists(
  select 1 from studio_rooms r where r.id=p_room and (r.host=auth.uid() or r.guest=auth.uid()) and r.expires_at>now()
  and exists(select 1 from studio_profiles p where p.id=r.host and p.status='approved' and p.email_verified_at is not null and p.consent_reference is not null and p.supervised_until>now())
  and (r.guest is null or exists(select 1 from studio_profiles p where p.id=r.guest and p.status='approved' and p.email_verified_at is not null and p.consent_reference is not null and p.supervised_until>now()))
 );
$$;
revoke all on function studio_room_visible(uuid) from public,anon;
grant execute on function studio_room_visible(uuid) to authenticated,service_role;
drop policy room_members on public.studio_rooms;
create policy room_members on public.studio_rooms for select to authenticated using(studio_room_visible(id));

create function public.studio_publish(p_actor uuid,p_project uuid,p_reviewed text,p_published boolean)
returns void language plpgsql security definer set search_path=public as $$
declare project studio_projects; owner studio_profiles;
begin
 if p_actor is null or p_published is null then raise exception 'Invalid review'; end if;
 select * into owner from studio_profiles where id=(select owner_id from studio_projects where id=p_project) for update;
 select * into project from studio_projects where id=p_project for update;
 if project.id is null or project.html is distinct from p_reviewed then raise exception 'Project changed; review again'; end if;
 if p_published and (owner.status<>'approved' or owner.email_verified_at is null or owner.consent_reference is null or not project.review_requested or length(trim(project.html))=0) then raise exception 'Owner approval and requested review are required'; end if;
 update studio_projects set published=p_published,review_requested=false where id=p_project;
 insert into studio_audit(actor,subject,action) values(p_actor,project.owner_id,case when p_published then 'reviewed project published' else 'project unpublished' end);
end $$;
create function public.studio_published(p_username text,p_slug text)
returns table(title text,html text) language sql stable security definer set search_path=public as $$
 select pr.title,pr.html from studio_projects pr join studio_profiles p on p.id=pr.owner_id
 where p.username=p_username and pr.slug=p_slug and pr.published and p.status='approved' and p.email_verified_at is not null and p.consent_reference is not null;
$$;
revoke all on function studio_publish(uuid,uuid,text,boolean),studio_published(text,text) from public,anon,authenticated;
grant execute on function studio_publish(uuid,uuid,text,boolean),studio_published(text,text) to service_role;
