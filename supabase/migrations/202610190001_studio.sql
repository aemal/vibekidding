-- Reviewed fixed schema. Apply to a dedicated Supabase project, never the legacy Neon database.
create table public.studio_profiles (
 id uuid primary key references auth.users(id) on delete cascade,
 username text unique not null check (username ~ '^[a-z][a-z0-9-]{2,23}$' and username not in ('api','admin','v1','auth','project','builder','preview','leaderboard','play')),
 email text not null, email_verified_at timestamptz,
 status text not null default 'pending' check (status in ('pending','approved','suspended')),
 guardian_requested_at timestamptz, consent_reference text,
 credits bigint not null default 0 check (credits >= 0),
 daily_cap bigint not null default 1000000 check(daily_cap between 0 and 10000000),
 created_at timestamptz not null default now()
);
-- Credits are micro-USD: 1,000,000 credits = $1, not provider tokens.
create table public.studio_models (
 id text primary key, input_rate bigint not null check(input_rate > 0),
 output_rate bigint not null check(output_rate > 0), enabled boolean not null default false,
 max_output integer not null default 2048 check(max_output between 128 and 4096),
 reviewed_at timestamptz not null default now()
);
create table public.studio_model_grants (
 user_id uuid references public.studio_profiles on delete cascade,
 model_id text references public.studio_models on delete cascade, primary key(user_id,model_id)
);
create table public.studio_projects (
 id uuid primary key default gen_random_uuid(), owner_id uuid not null references public.studio_profiles on delete cascade,
 title text not null check(length(title) between 1 and 80), slug text not null check(slug ~ '^[a-z][a-z0-9-]{2,39}$'),
 html text not null default '' check(octet_length(html) <= 100000),
 review_requested boolean not null default false, published boolean not null default false,
 created_at timestamptz not null default now(), unique(owner_id,slug)
);
create table public.studio_usage (
 id uuid primary key, user_id uuid not null references public.studio_profiles,
 provider text not null check(provider in ('openai','elevenlabs')), model text not null,
 reserved bigint not null check(reserved > 0), charged bigint, state text not null default 'reserved' check(state in ('reserved','settled')),
 input_tokens integer, output_tokens integer, created_at timestamptz not null default now()
);
create table public.studio_budget (
 day date primary key, reserved bigint not null default 0, cap bigint not null default 5000000 check(cap >= 0)
);
create table public.studio_audit (
 id uuid primary key default gen_random_uuid(), actor uuid not null, subject uuid not null,
 action text not null, amount bigint, request_id uuid unique, created_at timestamptz not null default now()
);
create table public.studio_outbox (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references public.studio_profiles,
 kind text not null check(kind in ('signup','credits')), day date not null default current_date,
 sent_at timestamptz, created_at timestamptz not null default now(), unique(user_id,kind,day)
);
create table public.studio_rooms (
 id uuid primary key default gen_random_uuid(), host uuid not null references public.studio_profiles,
 guest uuid references public.studio_profiles, board text[] not null default array['','','','','','','','',''],
 turn text not null default 'X', winner text, revision integer not null default 0,
 expires_at timestamptz not null default now()+interval '1 hour', check(guest is distinct from host)
);
create table public.studio_records (
 project_id uuid not null references public.studio_projects on delete cascade,
 user_id uuid not null references public.studio_profiles on delete cascade,
 key text not null check(length(key) between 1 and 100), value jsonb not null check(octet_length(value::text)<=8192),
 primary key(project_id,user_id,key)
);
-- All mutations go through authenticated server routes. Browser clients get scoped read access only.
DO $$ declare t text; begin
 foreach t in array array['studio_profiles','studio_models','studio_model_grants','studio_projects','studio_usage','studio_budget','studio_audit','studio_outbox','studio_rooms','studio_records'] loop
 execute format('alter table public.%I enable row level security',t);
 execute format('revoke all on public.%I from anon, authenticated',t);
 execute format('grant all on public.%I to service_role',t);
 end loop;
end $$;
grant select on public.studio_profiles, public.studio_projects, public.studio_usage, public.studio_rooms, public.studio_records to authenticated;
create policy own_profile on public.studio_profiles for select to authenticated using(id=auth.uid());
create policy own_projects on public.studio_projects for select to authenticated using(owner_id=auth.uid());
create policy own_usage on public.studio_usage for select to authenticated using(user_id=auth.uid());
create policy room_members on public.studio_rooms for select to authenticated using((host=auth.uid() or guest=auth.uid()) and expires_at>now() and exists(select 1 from public.studio_profiles where id=auth.uid() and status='approved'));
create policy own_records on public.studio_records for select to authenticated using(user_id=auth.uid() and exists(select 1 from public.studio_projects where id=project_id and owner_id=auth.uid()));

create function public.studio_reserve(p_user uuid,p_id uuid,p_provider text,p_model text,p_amount bigint)
returns void language plpgsql security definer set search_path=public as $$
declare p studio_profiles; spent bigint;
begin
 select * into p from studio_profiles where id=p_user for update;
 if p.id is null or p.status<>'approved' or p.email_verified_at is null or p.consent_reference is null then raise exception 'Access not approved'; end if;
 if p_amount<=0 or p_amount>1000000 or p.credits<p_amount then raise exception 'Insufficient credits or request cap'; end if;
 if p_provider='openai' and not exists(select 1 from studio_model_grants g join studio_models m on m.id=g.model_id where g.user_id=p_user and m.id=p_model and m.enabled) then raise exception 'Model not allowed'; end if;
 select coalesce(sum(coalesce(charged,reserved)),0) into spent from studio_usage where user_id=p_user and created_at >= (current_date::timestamp at time zone 'UTC');
 if spent+p_amount>p.daily_cap then raise exception 'Daily cap reached'; end if;
 insert into studio_budget(day) values(current_date) on conflict do nothing;
 update studio_budget set reserved=reserved+p_amount where day=current_date and reserved+p_amount<=cap;
 if not found then raise exception 'Global daily cap reached'; end if;
 insert into studio_usage(id,user_id,provider,model,reserved) values(p_id,p_user,p_provider,p_model,p_amount);
 update studio_profiles set credits=credits-p_amount where id=p_user;
end $$;

create function public.studio_settle(p_id uuid,p_charge bigint,p_input integer,p_output integer)
returns void language plpgsql security definer set search_path=public as $$
declare u studio_usage;
begin
 -- Same profile-first lock order as reserve, avoiding deadlocks.
 perform 1 from studio_profiles where id=(select user_id from studio_usage where id=p_id) for update;
 select * into u from studio_usage where id=p_id for update;
 if u.id is null then raise exception 'Unknown reservation'; end if;
 if u.state='settled' then return; end if;
 if p_charge<0 or p_charge>u.reserved then raise exception 'Charge outside reservation'; end if;
 update studio_profiles set credits=credits+u.reserved-p_charge where id=u.user_id;
 update studio_budget set reserved=reserved-u.reserved+p_charge where day=(u.created_at at time zone 'UTC')::date;
 update studio_usage set charged=p_charge,state='settled',input_tokens=p_input,output_tokens=p_output where id=p_id;
end $$;

create function public.studio_grant(p_actor uuid,p_user uuid,p_amount bigint,p_request uuid)
returns void language plpgsql security definer set search_path=public as $$
begin
 if p_amount=0 or abs(p_amount)>10000000 then raise exception 'Invalid adjustment'; end if;
 insert into studio_audit(actor,subject,action,amount,request_id) values(p_actor,p_user,'credit adjustment',p_amount,p_request) on conflict(request_id) do nothing;
 if not found then return; end if;
 update studio_profiles set credits=credits+p_amount where id=p_user and credits+p_amount>=0;
 if not found then raise exception 'Invalid balance'; end if;
end $$;

create function public.studio_room_action(p_user uuid,p_room uuid,p_cell integer default null)
returns public.studio_rooms language plpgsql security definer set search_path=public as $$
declare r studio_rooms; symbol text; line integer[];
begin
 if not exists(select 1 from studio_profiles where id=p_user and status='approved' and email_verified_at is not null and consent_reference is not null) then raise exception 'Not approved'; end if;
 select * into r from studio_rooms where id=p_room for update;
 if r.id is null or r.expires_at<=now() then raise exception 'Room expired or missing'; end if;
 if p_cell is null then
  if p_user<>r.host and r.guest is null then r.guest:=p_user;
  elsif p_user<>r.host and p_user is distinct from r.guest then raise exception 'Room full'; end if;
 else
  symbol:=case when p_user=r.host then 'X' when p_user=r.guest then 'O' else null end;
  if symbol is null or r.guest is null or r.winner is not null or r.turn<>symbol or p_cell<0 or p_cell>8 or r.board[p_cell+1]<>'' then raise exception 'Invalid move'; end if;
  r.board[p_cell+1]:=symbol;
  foreach line slice 1 in array array[[1,2,3],[4,5,6],[7,8,9],[1,4,7],[2,5,8],[3,6,9],[1,5,9],[3,5,7]] loop
   if r.board[line[1]]=symbol and r.board[line[2]]=symbol and r.board[line[3]]=symbol then r.winner:=symbol; end if;
  end loop;
  if r.winner is null and not(''=any(r.board)) then r.winner:='draw'; end if;
  r.turn:=case when symbol='X' then 'O' else 'X' end;
 end if;
 update studio_rooms set guest=r.guest,board=r.board,turn=r.turn,winner=r.winner,revision=revision+1 where id=r.id returning * into r;
 return r;
end $$;

revoke all on function public.studio_reserve(uuid,uuid,text,text,bigint),public.studio_settle(uuid,bigint,integer,integer),public.studio_grant(uuid,uuid,bigint,uuid),public.studio_room_action(uuid,uuid,integer) from public,anon,authenticated;
grant execute on function public.studio_reserve(uuid,uuid,text,text,bigint),public.studio_settle(uuid,bigint,integer,integer),public.studio_grant(uuid,uuid,bigint,uuid),public.studio_room_action(uuid,uuid,integer) to service_role;
-- Supabase realtime uses RLS above; never publish profile/email/ledger tables.
DO $$ begin
 if exists(select 1 from pg_publication where pubname='supabase_realtime') then
  alter publication supabase_realtime add table public.studio_rooms;
 end if;
end $$;

create function public.studio_record_put(p_user uuid,p_project uuid,p_key text,p_value jsonb)
returns void language plpgsql security definer set search_path=public as $$
begin
 perform 1 from studio_profiles where id=p_user and status='approved' and email_verified_at is not null and consent_reference is not null for update;
 if not found then raise exception 'Not approved'; end if;
 if not exists(select 1 from studio_projects where id=p_project and owner_id=p_user) then raise exception 'Not your project'; end if;
 if not exists(select 1 from studio_records where project_id=p_project and user_id=p_user and key=p_key)
 and (select count(*) from studio_records where project_id=p_project and user_id=p_user)>=100 then raise exception 'Storage quota reached'; end if;
 insert into studio_records(project_id,user_id,key,value) values(p_project,p_user,p_key,p_value)
 on conflict(project_id,user_id,key) do update set value=excluded.value;
end $$;
revoke all on function public.studio_record_put(uuid,uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.studio_record_put(uuid,uuid,text,jsonb) to service_role;

create function public.studio_project_create(p_user uuid,p_title text,p_slug text)
returns public.studio_projects language plpgsql security definer set search_path=public as $$
declare result studio_projects;
begin
 perform 1 from studio_profiles where id=p_user and status='approved' and email_verified_at is not null and consent_reference is not null for update;
 if not found then raise exception 'Not approved'; end if;
 if (select count(*) from studio_projects where owner_id=p_user)>=50 then raise exception 'Project quota reached'; end if;
 insert into studio_projects(owner_id,title,slug) values(p_user,p_title,p_slug) returning * into result;
 return result;
end $$;
create function public.studio_room_create(p_user uuid)
returns public.studio_rooms language plpgsql security definer set search_path=public as $$
declare result studio_rooms;
begin
 perform 1 from studio_profiles where id=p_user and status='approved' and email_verified_at is not null and consent_reference is not null for update;
 if not found then raise exception 'Not approved'; end if;
 if (select count(*) from studio_rooms where host=p_user and expires_at>now())>=5 then raise exception 'Active room quota reached'; end if;
 insert into studio_rooms(host) values(p_user) returning * into result;
 return result;
end $$;
revoke all on function public.studio_project_create(uuid,text,text),public.studio_room_create(uuid) from public,anon,authenticated;
grant execute on function public.studio_project_create(uuid,text,text),public.studio_room_create(uuid) to service_role;
