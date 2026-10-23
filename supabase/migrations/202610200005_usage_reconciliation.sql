alter table public.studio_usage add column provider_request_id text check(length(provider_request_id)<=200);
create table public.studio_reconciliations (
 usage_id uuid primary key references public.studio_usage,
 actor uuid not null,
 charge bigint not null check(charge>=0),
 evidence_reference text not null check(length(trim(evidence_reference)) between 8 and 500),
 provider_record text not null check(length(trim(provider_record)) between 3 and 200),
 created_at timestamptz not null default now()
);
alter table public.studio_reconciliations enable row level security;
revoke all on public.studio_reconciliations from anon,authenticated;
grant all on public.studio_reconciliations to service_role;
create function public.studio_reconcile_usage(p_actor uuid,p_usage uuid,p_charge bigint,p_evidence text,p_record text)
returns void language plpgsql security definer set search_path=public as $$
declare u studio_usage; r studio_reconciliations;
begin
 if p_actor is null then raise exception 'Actor required'; end if;
 perform 1 from studio_profiles where id=(select user_id from studio_usage where id=p_usage) for update;
 select * into u from studio_usage where id=p_usage for update;
 if u.id is null then raise exception 'Unknown reservation'; end if;
 select * into r from studio_reconciliations where usage_id=p_usage;
 if r.usage_id is not null then
  if r.charge=p_charge and r.evidence_reference=p_evidence and r.provider_record=p_record then return; end if;
  raise exception 'Reservation already reconciled with different evidence';
 end if;
 if u.state<>'reserved' then raise exception 'Reservation already settled'; end if;
 if u.created_at>now()-interval '1 hour' then raise exception 'Recent reservation may still be active'; end if;
 if p_charge is null or p_charge<0 or p_charge>u.reserved then raise exception 'Charge outside reservation; investigate provider overrun'; end if;
 insert into studio_reconciliations(usage_id,actor,charge,evidence_reference,provider_record) values(p_usage,p_actor,p_charge,p_evidence,p_record);
 perform studio_settle(p_usage,p_charge,null,null);
 insert into studio_audit(actor,subject,action,amount,request_id) values(p_actor,u.user_id,'provider evidence reviewed; reservation reconciled',p_charge,p_usage);
end $$;
revoke all on function studio_reconcile_usage(uuid,uuid,bigint,text,text) from public,anon,authenticated;
grant execute on function studio_reconcile_usage(uuid,uuid,bigint,text,text) to service_role;
