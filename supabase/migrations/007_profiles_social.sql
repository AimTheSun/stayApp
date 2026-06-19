-- Richer profiles + an Instagram-style "view profile, then add" flow.
-- Adds region, interests, bio and an onboarding flag; search + get-profile
-- RPCs (so you can find and inspect people before sending a request); and a
-- data-wipe RPC for privacy. `created_at` already exists (001) = joined date.

alter table profiles add column if not exists region text;
alter table profiles add column if not exists interests text[];
alter table profiles add column if not exists bio text;
alter table profiles add column if not exists onboarded boolean not null default false;

-- ── Save own profile (onboarding + later edits) ──
create or replace function save_profile(
  p_region text, p_interests text[], p_bio text
) returns void language plpgsql security definer set search_path = public as $$
begin
  update profiles set
    region    = nullif(trim(coalesce(p_region, '')), ''),
    interests = p_interests,
    bio       = nullif(trim(coalesce(p_bio, '')), ''),
    onboarded = true
  where id = auth.uid();
end; $$;

-- ── Search people by handle prefix (find non-friends to view/add) ──
create or replace function search_profiles(p_q text)
returns table(id uuid, username text, avatar_url text, region text)
language sql security definer set search_path = public as $$
  select p.id, p.username, p.avatar_url, p.region
  from profiles p
  where p.username is not null
    and p.id <> auth.uid()
    and p.username ilike (lower(trim(p_q)) || '%')
  order by p.username
  limit 20;
$$;

-- ── Full public profile + my relationship to them ──
create or replace function get_profile(p_id uuid)
returns table(
  id uuid, username text, avatar_url text, region text,
  interests text[], bio text, created_at timestamptz,
  is_me boolean, is_friend boolean, req_outgoing boolean, req_incoming boolean
)
language sql security definer set search_path = public as $$
  select p.id, p.username, p.avatar_url, p.region, p.interests, p.bio, p.created_at,
    (p.id = auth.uid()) as is_me,
    exists(select 1 from friendships f
           where f.user_lo = least(auth.uid(), p.id)
             and f.user_hi = greatest(auth.uid(), p.id)) as is_friend,
    exists(select 1 from friend_requests r
           where r.from_user = auth.uid() and r.to_user = p.id) as req_outgoing,
    exists(select 1 from friend_requests r
           where r.from_user = p.id and r.to_user = auth.uid()) as req_incoming
  from profiles p
  where p.id = p_id;
$$;

-- ── Privacy: wipe my stays + places (keeps account & profile) ──
create or replace function delete_my_data()
returns void language plpgsql security definer set search_path = public as $$
begin
  delete from stays  where user_id = auth.uid();
  delete from places where user_id = auth.uid();
end; $$;
