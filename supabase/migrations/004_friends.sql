-- Friends (friends-only social layer).
-- A username is your shareable handle AND the name friends see.
-- Friendships are mutual; adding someone by their handle is instant
-- (sharing your handle is the consent). Place leaderboards only ever
-- aggregate time for you + your friends — never raw locations.

-- ── Username handle on profiles ──
alter table profiles add column if not exists username text unique;

-- ── Friendships: one canonical row per pair (user_lo < user_hi) ──
create table if not exists friendships (
  id uuid primary key default gen_random_uuid(),
  user_lo uuid not null references auth.users(id) on delete cascade,
  user_hi uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  check (user_lo < user_hi),
  unique (user_lo, user_hi)
);

alter table friendships enable row level security;

-- Members can see / remove their own friendships. Inserts only via add_friend().
create policy "friends read"   on friendships for select using (auth.uid() in (user_lo, user_hi));
create policy "friends delete" on friendships for delete using (auth.uid() in (user_lo, user_hi));

-- ── Claim / change your handle ──
create or replace function set_username(p_username text)
returns void
language plpgsql security definer set search_path = public as $$
declare v text := lower(trim(p_username));
begin
  if v !~ '^[a-z0-9_]{3,20}$' then
    raise exception 'Handle must be 3–20 chars: letters, numbers, underscore.';
  end if;
  update profiles set username = v where id = auth.uid();
end; $$;

-- ── Add a friend by handle (instant, mutual) ──
create or replace function add_friend(p_username text)
returns table(friend_id uuid, username text)
language plpgsql security definer set search_path = public as $$
declare v_target uuid; v_me uuid := auth.uid();
begin
  select id into v_target from profiles where profiles.username = lower(trim(p_username));
  if v_target is null then raise exception 'No one with that handle.'; end if;
  if v_target = v_me then raise exception 'That handle is you.'; end if;
  insert into friendships(user_lo, user_hi)
    values (least(v_me, v_target), greatest(v_me, v_target))
    on conflict do nothing;
  return query select p.id, p.username from profiles p where p.id = v_target;
end; $$;

-- ── List my friends ──
create or replace function my_friends()
returns table(friend_id uuid, username text)
language sql security definer set search_path = public as $$
  select p.id, p.username
  from friendships f
  join profiles p
    on p.id = case when f.user_lo = auth.uid() then f.user_hi else f.user_lo end
  where auth.uid() in (f.user_lo, f.user_hi)
  order by p.username;
$$;

-- ── Place leaderboard: time me + my friends spent near a point ──
create or replace function place_leaderboard(
  p_lat double precision,
  p_lng double precision,
  p_radius_m double precision
)
returns table(user_id uuid, name text, total_s bigint, is_me boolean)
language sql security definer set search_path = public as $$
  with visible as (
    select auth.uid() as uid
    union
    select case when f.user_lo = auth.uid() then f.user_hi else f.user_lo end
    from friendships f
    where auth.uid() in (f.user_lo, f.user_hi)
  )
  select s.user_id,
         coalesce(p.username, 'Friend') as name,
         sum(s.duration_s)::bigint as total_s,
         (s.user_id = auth.uid()) as is_me
  from stays s
  join visible v on v.uid = s.user_id
  left join profiles p on p.id = s.user_id
  where s.left_at is not null
    and 6371000 * 2 * asin(sqrt(
          power(sin(radians(s.lat - p_lat) / 2), 2) +
          cos(radians(p_lat)) * cos(radians(s.lat)) *
          power(sin(radians(s.lng - p_lng) / 2), 2)
        )) <= p_radius_m
  group by s.user_id, p.username
  order by total_s desc;
$$;
