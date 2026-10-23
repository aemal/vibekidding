-- Store minimal authenticated provider events. No email addresses or transcript payloads.
create table public.studio_mail_events (
 id text primary key check(length(id) between 1 and 200),
 provider_id text not null check(length(provider_id) between 1 and 200),
 event_type text not null check(event_type in ('email.delivered','email.bounced','email.complained','email.failed','email.delivery_delayed','email.suppressed')),
 occurred_at timestamptz not null,
 received_at timestamptz not null default now()
);
create index on public.studio_mail_events(provider_id);
alter table public.studio_mail_events enable row level security;
revoke all on public.studio_mail_events from anon,authenticated;
grant all on public.studio_mail_events to service_role;
alter table public.studio_mail_jobs add column delivery_status text not null default 'unknown' check(delivery_status in ('unknown','delivery_delayed','failed','delivered','suppressed','bounced','complained'));
alter table public.studio_mail_jobs add column delivery_updated_at timestamptz;
create index on public.studio_mail_jobs(provider_id);

create function public.studio_mail_reconcile_events()
returns void language plpgsql security definer set search_path=public as $$
begin
 -- Adverse outcomes remain visible even if an older delivery event arrives later.
 with latest as (
  select distinct on (provider_id) provider_id,event_type,occurred_at
  from studio_mail_events
  order by provider_id,
   case event_type when 'email.complained' then 6 when 'email.bounced' then 5 when 'email.suppressed' then 4 when 'email.delivered' then 3 when 'email.failed' then 2 else 1 end desc,
   occurred_at desc,id desc
 )
 update studio_mail_jobs j set delivery_status=replace(e.event_type,'email.',''),delivery_updated_at=e.occurred_at
 from latest e where j.provider_id=e.provider_id
 and array_position(array['unknown','delivery_delayed','failed','delivered','suppressed','bounced','complained'],replace(e.event_type,'email.','')) >= array_position(array['unknown','delivery_delayed','failed','delivered','suppressed','bounced','complained'],j.delivery_status)
 and (j.delivery_status is distinct from replace(e.event_type,'email.','') or j.delivery_updated_at is null or j.delivery_updated_at<e.occurred_at);
 -- Bound minimal event retention; summarized job status remains until its source is deleted.
 delete from studio_mail_events where received_at<now()-interval '30 days';
end $$;
create function public.studio_mail_event(p_id text,p_provider text,p_type text,p_time timestamptz)
returns void language plpgsql security definer set search_path=public as $$
begin
 if p_time>now()+interval '5 minutes' then raise exception 'Invalid event time'; end if;
 insert into studio_mail_events(id,provider_id,event_type,occurred_at) values(p_id,p_provider,p_type,p_time) on conflict do nothing;
 perform studio_mail_reconcile_events();
end $$;
create function public.studio_mail_event_cleanup() returns trigger language plpgsql security definer set search_path=public as $$
begin delete from studio_mail_events where provider_id=old.provider_id; return old; end $$;
create trigger mail_event_cleanup after delete on public.studio_mail_jobs for each row execute function studio_mail_event_cleanup();
revoke all on function studio_mail_reconcile_events(),studio_mail_event(text,text,text,timestamptz),studio_mail_event_cleanup() from public,anon,authenticated;
grant execute on function studio_mail_reconcile_events(),studio_mail_event(text,text,text,timestamptz) to service_role;
