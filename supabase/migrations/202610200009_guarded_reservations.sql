-- Bind paid work to the safety settings that were checked by the server.
alter function public.studio_reserve(uuid,uuid,text,text,bigint) rename to studio_reserve_unchecked;
revoke all on function studio_reserve_unchecked(uuid,uuid,text,text,bigint) from public,anon,authenticated,service_role;
create function public.studio_reserve(p_user uuid,p_id uuid,p_provider text,p_model text,p_amount bigint,p_revision bigint)
returns void language plpgsql security definer set search_path=public as $$
begin
 perform studio_require_supervision(p_user);
 if not exists(select 1 from studio_profiles where id=p_user and safety_revision=p_revision) then
  raise exception 'Session or safety policy changed; start a new request';
 end if;
 perform studio_reserve_unchecked(p_user,p_id,p_provider,p_model,p_amount);
end $$;
revoke all on function studio_reserve(uuid,uuid,text,text,bigint,bigint) from public,anon,authenticated;
grant execute on function studio_reserve(uuid,uuid,text,text,bigint,bigint) to service_role;
