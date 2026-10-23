-- Bounded cleanup; no provider calls and no deletion of billing evidence or projects.
create index on public.studio_activity(created_at);
create index on public.studio_parent_sessions(expires_at);
create index on public.studio_rooms(expires_at);
create index on public.studio_mail_events(received_at);
create function public.studio_privacy_maintenance()
returns jsonb language plpgsql security definer set search_path=public as $$
declare activities integer; sessions integer; rooms integer; events integer;
begin
 delete from studio_activity where id in (
  select id from studio_activity where created_at < now()-interval '30 days'
  order by created_at,id limit 1000 for update skip locked
 );
 get diagnostics activities = row_count;
 -- Alert -> job -> event deletion cascades remove related notification metadata.
 delete from studio_parent_sessions where token_hash in (
  select token_hash from studio_parent_sessions where expires_at <= now()
  order by expires_at,token_hash limit 1000 for update skip locked
 );
 get diagnostics sessions = row_count;
 delete from studio_rooms where id in (
  select id from studio_rooms where expires_at <= now()
  order by expires_at,id limit 1000 for update skip locked
 );
 get diagnostics rooms = row_count;
 delete from studio_mail_events where id in (
  select id from studio_mail_events where received_at < now()-interval '30 days'
  order by received_at,id limit 1000 for update skip locked
 );
 get diagnostics events = row_count;
 return jsonb_build_object('activities',activities,'sessions',sessions,'rooms',rooms,'events',events);
end $$;
revoke all on function studio_privacy_maintenance() from public,anon,authenticated;
grant execute on function studio_privacy_maintenance() to service_role;
