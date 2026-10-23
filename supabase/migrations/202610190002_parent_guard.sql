-- Parent controls: service-only writes and reads, including activity history.
alter table public.studio_profiles add column supervised_until timestamptz;
alter table public.studio_profiles add column family_rules jsonb not null default '[]'::jsonb check(jsonb_typeof(family_rules)='array' and jsonb_array_length(family_rules)<=10 and octet_length(family_rules::text)<=6000);
create table public.studio_parent_sessions(token_hash text primary key,user_id uuid not null references public.studio_profiles on delete cascade,expires_at timestamptz not null);
create table public.studio_activity(id uuid primary key default gen_random_uuid(), user_id uuid not null references public.studio_profiles on delete cascade, project_id uuid references public.studio_projects on delete set null, role text not null check(role in ('user','assistant')), content text not null check(length(content)<=24000), decision text not null check(decision in ('clear','blocked','uncertain','unavailable')), categories text[] not null default '{}', created_at timestamptz not null default now());
create table public.studio_parent_alerts(id uuid primary key default gen_random_uuid(),user_id uuid not null references public.studio_profiles on delete cascade,activity_id uuid not null unique references public.studio_activity on delete cascade,sent_at timestamptz,created_at timestamptz not null default now());
DO $$ declare t text; begin foreach t in array array['studio_parent_sessions','studio_activity','studio_parent_alerts'] loop
 execute format('alter table public.%I enable row level security',t);
 execute format('revoke all on public.%I from anon,authenticated',t);
 execute format('grant all on public.%I to service_role',t);
end loop; end $$;
create index studio_activity_owner_date on public.studio_activity(user_id,created_at desc);
alter table public.studio_usage drop constraint studio_usage_provider_check;
alter table public.studio_usage add constraint studio_usage_provider_check check(provider in ('openai','elevenlabs','typesafe'));
-- The same account lock used by spending also protects the supervised-session gate.
create function public.studio_supervision_guard() returns trigger language plpgsql set search_path=public as $$
begin
 perform 1 from studio_profiles where id=new.user_id and status='approved' and supervised_until>now() for update;
 if not found then raise exception 'A supervised session is required'; end if;
 return new;
end $$;
create trigger studio_usage_supervised before insert on public.studio_usage for each row execute function public.studio_supervision_guard();
-- Never expose history by adding a browser read policy: it requires a fresh parent OTP at the server.

create function public.studio_activity_record(p_user uuid,p_project uuid,p_role text,p_content text,p_decision text,p_categories text[])
returns jsonb language plpgsql security definer set search_path=public as $$
declare event_id uuid; alert_id uuid;
begin
 if not exists(select 1 from studio_projects where id=p_project and owner_id=p_user) then raise exception 'Not your project'; end if;
 insert into studio_activity(user_id,project_id,role,content,decision,categories) values(p_user,p_project,p_role,p_content,p_decision,p_categories) returning id into event_id;
 if p_decision<>'clear' then
  update studio_profiles set supervised_until=null where id=p_user;
  insert into studio_parent_alerts(user_id,activity_id) values(p_user,event_id) returning id into alert_id;
 end if;
 return jsonb_build_object('activity_id',event_id,'alert_id',alert_id);
end $$;
create function public.studio_guarded_save(p_user uuid,p_project uuid,p_old text,p_new text,p_rules jsonb)
returns public.studio_projects language plpgsql security definer set search_path=public as $$
declare saved studio_projects;
begin
 perform 1 from studio_profiles where id=p_user and status='approved' and email_verified_at is not null and consent_reference is not null and supervised_until>now() and family_rules=p_rules for update;
 if not found then raise exception 'Session paused or policy changed'; end if;
 update studio_projects set html=p_new,published=false,review_requested=false where id=p_project and owner_id=p_user and html=p_old returning * into saved;
 if not found then raise exception 'Project changed'; end if;
 return saved;
end $$;
revoke all on function public.studio_activity_record(uuid,uuid,text,text,text,text[]),public.studio_guarded_save(uuid,uuid,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.studio_activity_record(uuid,uuid,text,text,text,text[]),public.studio_guarded_save(uuid,uuid,text,text,jsonb) to service_role;
