-- Claim the client request ID before any paid guard or generation call.
create table public.studio_generation_claims (
 id uuid primary key,
 user_id uuid not null references public.studio_profiles on delete cascade,
 project_id uuid not null references public.studio_projects on delete cascade,
 safety_revision bigint not null,
 created_at timestamptz not null default now()
);
alter table public.studio_generation_claims enable row level security;
revoke all on public.studio_generation_claims from anon,authenticated;
grant all on public.studio_generation_claims to service_role;
create function public.studio_generation_claim(p_user uuid,p_id uuid,p_project uuid,p_revision bigint)
returns void language plpgsql security definer set search_path=public as $$
begin
 perform studio_require_supervision(p_user);
 if not exists(select 1 from studio_profiles where id=p_user and safety_revision=p_revision) then
  raise exception 'Session changed; start a new request';
 end if;
 if not exists(select 1 from studio_projects where id=p_project and owner_id=p_user) then
  raise exception 'Not your project';
 end if;
 insert into studio_generation_claims(id,user_id,project_id,safety_revision) values(p_id,p_user,p_project,p_revision);
end $$;
revoke all on function studio_generation_claim(uuid,uuid,uuid,bigint) from public,anon,authenticated;
grant execute on function studio_generation_claim(uuid,uuid,uuid,bigint) to service_role;
