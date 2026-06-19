-- See where your friends spend time + per-place privacy.
-- Friends-only: a place is visible to your accepted friends unless you hide it
-- (e.g. Home). Aggregates only — friends never read your raw stay coordinates.

-- ── Privacy: hide a place from friends ──
alter table places add column if not exists hidden_from_friends boolean not null default false;

-- ── A friend's (non-hidden) places + how much time they log at each ──
-- SECURITY DEFINER bypasses the owner-only RLS on places, but the join to
-- friendships restricts results to the caller's accepted friends.
create or replace function friends_places()
returns table(
  place_id uuid, owner_id uuid, username text, avatar_url text,
  label text, lat double precision, lng double precision, radius_m double precision,
  total_s bigint, visits bigint
)
language sql security definer set search_path = public as $$
  with friend_ids as (
    select case when f.user_lo = auth.uid() then f.user_hi else f.user_lo end as uid
    from friendships f
    where auth.uid() in (f.user_lo, f.user_hi)
  )
  select pl.id, pl.user_id, pr.username, pr.avatar_url,
         pl.label, pl.lat, pl.lng, pl.radius_m,
         coalesce(sum(s.duration_s), 0)::bigint as total_s,
         count(s.id)::bigint as visits
  from places pl
  join friend_ids fi on fi.uid = pl.user_id
  left join profiles pr on pr.id = pl.user_id
  left join stays s on s.place_id = pl.id and s.left_at is not null
  where coalesce(pl.hidden_from_friends, false) = false
  group by pl.id, pl.user_id, pr.username, pr.avatar_url,
           pl.label, pl.lat, pl.lng, pl.radius_m
  order by total_s desc;
$$;

-- ── Leaderboard now skips stays at a friend's hidden place ──
-- (Same return shape as 005, so create-or-replace is fine.)
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
  left join places pl on pl.id = s.place_id
  where s.left_at is not null
    and (pl.id is null or not pl.hidden_from_friends or s.user_id = auth.uid())
    and 6371000 * 2 * asin(sqrt(
          power(sin(radians(s.lat - p_lat) / 2), 2) +
          cos(radians(p_lat)) * cos(radians(s.lat)) *
          power(sin(radians(s.lng - p_lng) / 2), 2)
        )) <= p_radius_m
  group by s.user_id, p.username, p.avatar_url
  order by total_s desc;
$$;
