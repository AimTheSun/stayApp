-- Friends v2: requests + accept/decline, remove, avatars.
-- Handles are already unique (profiles.username unique from 004).

-- ── Avatars ──
alter table profiles add column if not exists avatar_url text;

-- ── Friend requests (pending) — must exist before the policy below ──
create table if not exists friend_requests (
  id uuid primary key default gen_random_uuid(),
  from_user uuid not null references auth.users(id) on delete cascade,
  to_user uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  check (from_user <> to_user),
  unique (from_user, to_user)
);

alter table friend_requests enable row level security;
create policy "requests visible to parties" on friend_requests for select
  using (auth.uid() in (from_user, to_user));

-- Let friends (and people you have a pending request with) read your profile.
drop policy if exists "profiles visible to contacts" on profiles;
create policy "profiles visible to contacts" on profiles for select using (
  id = auth.uid()
  or exists (
    select 1 from friendships f
    where (f.user_lo = auth.uid() and f.user_hi = profiles.id)
       or (f.user_hi = auth.uid() and f.user_lo = profiles.id)
  )
  or exists (
    select 1 from friend_requests r
    where (r.from_user = auth.uid() and r.to_user = profiles.id)
       or (r.to_user = auth.uid() and r.from_user = profiles.id)
  )
);

-- ── Send a request by handle (auto-accepts a reverse pending request) ──
create or replace function send_friend_request(p_username text)
returns text language plpgsql security definer set search_path = public as $$
declare v_to uuid; v_me uuid := auth.uid();
begin
  select id into v_to from profiles where username = lower(trim(p_username));
  if v_to is null then raise exception 'No one with that handle.'; end if;
  if v_to = v_me then raise exception 'That handle is you.'; end if;
  if exists (select 1 from friendships
             where user_lo = least(v_me, v_to) and user_hi = greatest(v_me, v_to)) then
    raise exception 'You are already friends.';
  end if;
  if exists (select 1 from friend_requests where from_user = v_to and to_user = v_me) then
    insert into friendships(user_lo, user_hi)
      values (least(v_me, v_to), greatest(v_me, v_to)) on conflict do nothing;
    delete from friend_requests
      where (from_user = v_to and to_user = v_me) or (from_user = v_me and to_user = v_to);
    return 'friend';
  end if;
  insert into friend_requests(from_user, to_user) values (v_me, v_to) on conflict do nothing;
  return 'sent';
end; $$;

create or replace function accept_friend_request(p_from uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_me uuid := auth.uid();
begin
  if not exists (select 1 from friend_requests where from_user = p_from and to_user = v_me) then
    raise exception 'No such request.';
  end if;
  insert into friendships(user_lo, user_hi)
    values (least(v_me, p_from), greatest(v_me, p_from)) on conflict do nothing;
  delete from friend_requests where from_user = p_from and to_user = v_me;
end; $$;

create or replace function decline_friend_request(p_from uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  delete from friend_requests where from_user = p_from and to_user = auth.uid();
end; $$;

create or replace function remove_friend(p_friend uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_me uuid := auth.uid();
begin
  delete from friendships
    where user_lo = least(v_me, p_friend) and user_hi = greatest(v_me, p_friend);
end; $$;

drop function if exists incoming_requests();
create or replace function incoming_requests()
returns table(from_user uuid, username text, avatar_url text)
language sql security definer set search_path = public as $$
  select r.from_user, p.username, p.avatar_url
  from friend_requests r
  join profiles p on p.id = r.from_user
  where r.to_user = auth.uid()
  order by r.created_at desc;
$$;

-- ── my_friends now returns avatars ──
drop function if exists my_friends();
create or replace function my_friends()
returns table(friend_id uuid, username text, avatar_url text)
language sql security definer set search_path = public as $$
  select p.id, p.username, p.avatar_url
  from friendships f
  join profiles p
    on p.id = case when f.user_lo = auth.uid() then f.user_hi else f.user_lo end
  where auth.uid() in (f.user_lo, f.user_hi)
  order by p.username;
$$;

-- ── leaderboard now returns avatars ──
drop function if exists place_leaderboard(double precision, double precision, double precision);
create or replace function place_leaderboard(
  p_lat double precision, p_lng double precision, p_radius_m double precision
)
returns table(user_id uuid, name text, avatar_url text, total_s bigint, is_me boolean)
language sql security definer set search_path = public as $$
  with visible as (
    select auth.uid() as uid
    union
    select case when f.user_lo = auth.uid() then f.user_hi else f.user_lo end
    from friendships f where auth.uid() in (f.user_lo, f.user_hi)
  )
  select s.user_id,
         coalesce(p.username, 'Friend') as name,
         p.avatar_url,
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
  group by s.user_id, p.username, p.avatar_url
  order by total_s desc;
$$;

-- ── Avatars storage bucket ──
insert into storage.buckets (id, name, public)
  values ('avatars', 'avatars', true)
  on conflict (id) do nothing;

drop policy if exists "avatar read" on storage.objects;
drop policy if exists "avatar write own" on storage.objects;
drop policy if exists "avatar update own" on storage.objects;
create policy "avatar read" on storage.objects for select
  using (bucket_id = 'avatars');
create policy "avatar write own" on storage.objects for insert
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "avatar update own" on storage.objects for update
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
