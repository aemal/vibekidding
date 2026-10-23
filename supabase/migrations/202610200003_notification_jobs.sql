-- Service-only retry state. Payloads contain recipient emails, never transcripts.
create table public.studio_mail_jobs (
 id uuid primary key,
 kind text not null check(kind in ('admin','parent')),
 user_id uuid not null references public.studio_profiles(id) on delete cascade,
 payload jsonb not null,
 status text not null default 'pending' check(status in ('pending','accepted','review')),
 attempts integer not null default 0,
 first_attempt_at timestamptz not null default now(),
 next_attempt_at timestamptz not null default now(),
 lease_until timestamptz,
 lease_token uuid,
 provider_id text,
 last_error text
);
alter table public.studio_mail_jobs enable row level security;
revoke all on public.studio_mail_jobs from anon,authenticated;
grant all on public.studio_mail_jobs to service_role;

create function public.studio_mail_claim(p_id uuid,p_kind text,p_payload jsonb)
returns jsonb language plpgsql security definer set search_path=public as $$
declare j studio_mail_jobs; owner_id uuid; already_sent timestamptz;
begin
 if p_kind='admin' then
  select user_id,sent_at into owner_id,already_sent from studio_outbox where id=p_id for update;
 elsif p_kind='parent' then
  select user_id,sent_at into owner_id,already_sent from studio_parent_alerts where id=p_id for update;
 else raise exception 'Invalid notification kind'; end if;
 if owner_id is null or already_sent is not null then return null; end if;
 if octet_length(p_payload::text)>8000 then raise exception 'Payload too large'; end if;
 insert into studio_mail_jobs(id,kind,user_id,payload) values(p_id,p_kind,owner_id,p_payload) on conflict do nothing;
 select * into j from studio_mail_jobs where id=p_id for update;
 if j.kind<>p_kind or j.user_id<>owner_id then raise exception 'Notification mismatch'; end if;
 if j.status<>'pending' or j.lease_until>now() then return null; end if;
 if j.payload is distinct from p_payload then
  update studio_mail_jobs set status='review',last_error='recipient_or_payload_changed' where id=p_id;
  return null;
 end if;
 -- Do not retry beyond the provider idempotency window. Investigate ambiguity manually.
 if j.first_attempt_at<now()-interval '23 hours' or j.attempts>=10 then
  update studio_mail_jobs set status='review',last_error='retry_limit' where id=p_id;
  return null;
 end if;
 if j.next_attempt_at>now() then return null; end if;
 update studio_mail_jobs set attempts=attempts+1,lease_token=gen_random_uuid(),lease_until=now()+interval '2 minutes'
 where id=p_id returning * into j;
 return to_jsonb(j);
end $$;

create function public.studio_mail_finish(p_id uuid,p_token uuid,p_provider_id text,p_error text)
returns boolean language plpgsql security definer set search_path=public as $$
declare j studio_mail_jobs;
begin
 -- Match claim/deletion lock order: source row, then job row.
 select * into j from studio_mail_jobs where id=p_id;
 if j.kind='admin' then perform 1 from studio_outbox where id=p_id for update;
 elsif j.kind='parent' then perform 1 from studio_parent_alerts where id=p_id for update;
 else return false; end if;
 select * into j from studio_mail_jobs where id=p_id for update;
 if j.id is null or j.lease_token is distinct from p_token or j.status<>'pending' then return false; end if;
 if p_provider_id is not null then
  update studio_mail_jobs set status='accepted',provider_id=p_provider_id,lease_token=null,lease_until=null,last_error=null where id=p_id;
  if j.kind='admin' then update studio_outbox set sent_at=now() where id=p_id;
  else update studio_parent_alerts set sent_at=now() where id=p_id; end if;
 else
  update studio_mail_jobs set lease_token=null,lease_until=null,last_error=left(p_error,80),
   next_attempt_at=now()+make_interval(secs=>least(3600,30*power(2,j.attempts)::integer)),
   status=case when p_error='recipient_unverified' or j.attempts>=10 or j.first_attempt_at<now()-interval '23 hours' then 'review' else 'pending' end
  where id=p_id;
 end if;
 return true;
end $$;

create function public.studio_mail_pending()
returns table(id uuid,kind text,user_id uuid) language sql security definer set search_path=public as $$
 select s.id,s.kind,s.user_id from (
 select id,'admin'::text kind,user_id,created_at from studio_outbox where sent_at is null
 union all
 select id,'parent'::text kind,user_id,created_at from studio_parent_alerts where sent_at is null
 ) s left join studio_mail_jobs j on j.id=s.id
 where j.id is null or (j.status='pending' and j.next_attempt_at<=now() and (j.lease_until is null or j.lease_until<=now()))
 order by s.created_at limit 5;
$$;
-- Deleting parent history also removes its frozen email metadata.
create function public.studio_mail_cleanup() returns trigger language plpgsql security definer set search_path=public as $$
begin delete from studio_mail_jobs where id=old.id; return old; end $$;
create trigger parent_mail_cleanup after delete on public.studio_parent_alerts for each row execute function studio_mail_cleanup();
create trigger admin_mail_cleanup after delete on public.studio_outbox for each row execute function studio_mail_cleanup();
revoke all on function studio_mail_claim(uuid,text,jsonb),studio_mail_finish(uuid,uuid,text,text),studio_mail_pending(),studio_mail_cleanup() from public,anon,authenticated;
grant execute on function studio_mail_claim(uuid,text,jsonb),studio_mail_finish(uuid,uuid,text,text),studio_mail_pending() to service_role;
