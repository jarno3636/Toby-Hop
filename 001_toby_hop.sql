begin;

create extension if not exists pgcrypto;

create table if not exists public.toby_hop_users (
  fid bigint primary key,
  username text,
  display_name text,
  pfp_url text,
  current_title text not null default 'New Hopper',
  total_hops integer not null default 0 check (total_hops >= 0),
  current_streak integer not null default 0 check (current_streak >= 0),
  longest_streak integer not null default 0 check (longest_streak >= 0),
  big_pond_energy integer not null default 0 check (big_pond_energy >= 0),
  total_usdc_atomic numeric(78,0) not null default 0 check (total_usdc_atomic >= 0),
  total_toby_atomic numeric(78,0) not null default 0 check (total_toby_atomic >= 0),
  first_hop_at timestamptz,
  last_hop_at timestamptz,
  last_hop_day date,
  notifications_enabled boolean not null default false,
  notification_url text,
  notification_token text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.toby_hops (
  id uuid primary key default gen_random_uuid(),
  fid bigint not null references public.toby_hop_users(fid) on delete cascade,
  wallet_address text not null,
  input_token text not null default 'USDC' check (input_token = 'USDC'),
  input_amount_atomic numeric(78,0) not null check (input_amount_atomic > 0),
  toby_amount_atomic numeric(78,0) not null check (toby_amount_atomic > 0),
  transaction_hash text not null unique,
  block_number bigint not null,
  hop_day date not null,
  daily_position integer not null check (daily_position > 0),
  streak_after_hop integer not null check (streak_after_hop > 0),
  total_hops_after integer not null check (total_hops_after > 0),
  cast_text text,
  cast_hash text,
  verified_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (fid, hop_day)
);

create table if not exists public.toby_hop_webhook_events (
  id bigint generated always as identity primary key,
  event_type text not null,
  fid bigint,
  payload jsonb not null,
  created_at timestamptz not null default now()
);

create index if not exists toby_hops_day_position_idx on public.toby_hops(hop_day, daily_position);
create index if not exists toby_hop_users_streak_idx on public.toby_hop_users(current_streak desc, total_hops desc);
create index if not exists toby_hop_users_hops_idx on public.toby_hop_users(total_hops desc);
create index if not exists toby_hop_users_toby_idx on public.toby_hop_users(total_toby_atomic desc);

alter table public.toby_hop_users enable row level security;
alter table public.toby_hops enable row level security;
alter table public.toby_hop_webhook_events enable row level security;

-- Service role bypasses RLS. No direct public write policies are intentionally created.

create or replace function public.toby_hop_title(p_streak integer, p_daily_position integer)
returns text
language sql
immutable
as $$
  select case
    when p_daily_position = 1 then 'First in the Pond'
    when p_daily_position <= 50 then 'Lightning Hopper'
    when p_daily_position <= 250 then 'Quick Hopper'
    when p_streak >= 365 then 'Eternal Hopper'
    when p_streak >= 100 then 'Great Pond Guardian'
    when p_streak >= 60 then 'Pond Keeper'
    when p_streak >= 30 then 'Dedicated Hopper'
    when p_streak >= 14 then 'Lily Pad Leaper'
    when p_streak >= 7 then 'Pond Regular'
    when p_streak >= 3 then 'Pond Visitor'
    else 'First Hopper'
  end;
$$;

create or replace function public.toby_hop_get_or_create_user(
  p_fid bigint,
  p_username text,
  p_display_name text,
  p_pfp_url text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user public.toby_hop_users;
  v_today date := (now() at time zone 'utc')::date;
  v_rank bigint;
begin
  insert into public.toby_hop_users(fid, username, display_name, pfp_url)
  values (p_fid, p_username, p_display_name, p_pfp_url)
  on conflict (fid) do update set
    username = coalesce(excluded.username, toby_hop_users.username),
    display_name = coalesce(excluded.display_name, toby_hop_users.display_name),
    pfp_url = coalesce(excluded.pfp_url, toby_hop_users.pfp_url),
    updated_at = now();

  select * into v_user from public.toby_hop_users where fid = p_fid;

  select count(*) + 1 into v_rank
  from public.toby_hop_users u
  where (u.current_streak, u.total_hops, -u.fid) >
        (v_user.current_streak, v_user.total_hops, -v_user.fid);

  return to_jsonb(v_user) ||
    jsonb_build_object(
      'today_hopped', v_user.last_hop_day = v_today,
      'rank', v_rank
    );
end;
$$;

create or replace function public.toby_hop_record_verified(
  p_fid bigint,
  p_username text,
  p_display_name text,
  p_pfp_url text,
  p_wallet_address text,
  p_transaction_hash text,
  p_block_number bigint,
  p_input_amount_atomic numeric,
  p_toby_amount_atomic numeric
)
returns table(
  hop_id uuid,
  streak_after integer,
  total_hops_after integer,
  daily_position integer,
  title_after text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_today date := (now() at time zone 'utc')::date;
  v_user public.toby_hop_users;
  v_streak integer;
  v_total integer;
  v_position integer;
  v_title text;
  v_hop_id uuid;
begin
  perform pg_advisory_xact_lock(p_fid);
  perform pg_advisory_xact_lock(hashtext(v_today::text));

  if exists(select 1 from public.toby_hops where transaction_hash = lower(p_transaction_hash)) then
    raise exception 'Transaction has already been recorded.';
  end if;

  if exists(select 1 from public.toby_hops where fid = p_fid and hop_day = v_today) then
    raise exception 'Today''s official hop is already complete.';
  end if;

  insert into public.toby_hop_users(fid, username, display_name, pfp_url)
  values (p_fid, p_username, p_display_name, p_pfp_url)
  on conflict (fid) do update set
    username = coalesce(excluded.username, toby_hop_users.username),
    display_name = coalesce(excluded.display_name, toby_hop_users.display_name),
    pfp_url = coalesce(excluded.pfp_url, toby_hop_users.pfp_url),
    updated_at = now();

  select * into v_user from public.toby_hop_users where fid = p_fid for update;

  v_streak := case
    when v_user.last_hop_day = v_today - 1 then v_user.current_streak + 1
    else 1
  end;
  v_total := v_user.total_hops + 1;

  select count(*) + 1 into v_position from public.toby_hops where hop_day = v_today;
  v_title := public.toby_hop_title(v_streak, v_position);

  insert into public.toby_hops(
    fid, wallet_address, input_amount_atomic, toby_amount_atomic,
    transaction_hash, block_number, hop_day, daily_position,
    streak_after_hop, total_hops_after
  ) values (
    p_fid, lower(p_wallet_address), p_input_amount_atomic, p_toby_amount_atomic,
    lower(p_transaction_hash), p_block_number, v_today, v_position,
    v_streak, v_total
  ) returning id into v_hop_id;

  update public.toby_hop_users set
    current_title = v_title,
    total_hops = v_total,
    current_streak = v_streak,
    longest_streak = greatest(longest_streak, v_streak),
    big_pond_energy = big_pond_energy + 1,
    total_usdc_atomic = total_usdc_atomic + p_input_amount_atomic,
    total_toby_atomic = total_toby_atomic + p_toby_amount_atomic,
    first_hop_at = coalesce(first_hop_at, now()),
    last_hop_at = now(),
    last_hop_day = v_today,
    updated_at = now()
  where fid = p_fid;

  return query select v_hop_id, v_streak, v_total, v_position, v_title;
end;
$$;

create or replace function public.toby_hop_leaderboard(p_kind text, p_limit integer default 100)
returns table(
  fid bigint,
  username text,
  display_name text,
  pfp_url text,
  current_title text,
  current_streak integer,
  total_hops integer,
  total_toby_atomic numeric,
  rank bigint
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_kind = 'streak' then
    return query
      select u.fid,u.username,u.display_name,u.pfp_url,u.current_title,u.current_streak,u.total_hops,u.total_toby_atomic,
             row_number() over(order by u.current_streak desc,u.total_hops desc,u.fid asc)
      from public.toby_hop_users u
      order by u.current_streak desc,u.total_hops desc,u.fid asc
      limit least(greatest(p_limit,1),100);
  elsif p_kind = 'hops' then
    return query
      select u.fid,u.username,u.display_name,u.pfp_url,u.current_title,u.current_streak,u.total_hops,u.total_toby_atomic,
             row_number() over(order by u.total_hops desc,u.current_streak desc,u.fid asc)
      from public.toby_hop_users u
      order by u.total_hops desc,u.current_streak desc,u.fid asc
      limit least(greatest(p_limit,1),100);
  elsif p_kind = 'toby' then
    return query
      select u.fid,u.username,u.display_name,u.pfp_url,u.current_title,u.current_streak,u.total_hops,u.total_toby_atomic,
             row_number() over(order by u.total_toby_atomic desc,u.total_hops desc,u.fid asc)
      from public.toby_hop_users u
      order by u.total_toby_atomic desc,u.total_hops desc,u.fid asc
      limit least(greatest(p_limit,1),100);
  else
    raise exception 'Invalid leaderboard kind.';
  end if;
end;
$$;

revoke all on function public.toby_hop_record_verified from public, anon, authenticated;
revoke all on function public.toby_hop_get_or_create_user from public, anon, authenticated;
revoke all on function public.toby_hop_leaderboard from public, anon, authenticated;

commit;
