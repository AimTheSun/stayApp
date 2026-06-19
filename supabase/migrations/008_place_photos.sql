-- Place photo albums (BeReal-style). Each person adds photos at their own
-- places; friends can view the album when they open that place. A place with
-- photos shows a "story" ring on the map. Hidden places stay private.

create table if not exists place_photos (
  id uuid primary key default gen_random_uuid(),
  place_id uuid not null references places(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  image_url text not null,
  created_at timestamptz not null default now()
);
create index if not exists idx_place_photos_place on place_photos (place_id, created_at desc);

alter table place_photos enable row level security;

-- Add a photo only to a place you own.
create policy "insert own place photo" on place_photos for insert
  with check (
    user_id = auth.uid()
    and exists (select 1 from places p where p.id = place_id and p.user_id = auth.uid())
  );
create policy "select own place photos" on place_photos for select using (user_id = auth.uid());
create policy "delete own place photos" on place_photos for delete using (user_id = auth.uid());

-- ── A place's album: owner always; friends only if the place isn't hidden ──
create or replace function place_album(p_place_id uuid)
returns table(id uuid, user_id uuid, image_url text, created_at timestamptz)
language sql security definer set search_path = public as $$
  select ph.id, ph.user_id, ph.image_url, ph.created_at
  from place_photos ph
  join places pl on pl.id = ph.place_id
  where ph.place_id = p_place_id
    and (
      pl.user_id = auth.uid()
      or (
        not coalesce(pl.hidden_from_friends, false)
        and exists (
          select 1 from friendships f
          where f.user_lo = least(auth.uid(), pl.user_id)
            and f.user_hi = greatest(auth.uid(), pl.user_id)
        )
      )
    )
  order by ph.created_at desc;
$$;

-- ── friends_places now also reports a photo count (return shape changed → drop) ──
drop function if exists friends_places();
create or replace function friends_places()
returns table(
  place_id uuid, owner_id uuid, username text, avatar_url text,
  label text, lat double precision, lng double precision, radius_m double precision,
  total_s bigint, visits bigint, photo_count bigint
)
language sql security definer set search_path = public as $$
  with friend_ids as (
    select case when f.user_lo = auth.uid() then f.user_hi else f.user_lo end as uid
    from friendships f
    where auth.uid() in (f.user_lo, f.user_hi)
  )
  select pl.id, pl.user_id, pr.username, pr.avatar_url,
         pl.label, pl.lat, pl.lng, pl.radius_m,
         coalesce((select sum(s.duration_s) from stays s
                   where s.place_id = pl.id and s.left_at is not null), 0)::bigint as total_s,
         (select count(*) from stays s
          where s.place_id = pl.id and s.left_at is not null)::bigint as visits,
         (select count(*) from place_photos ph where ph.place_id = pl.id)::bigint as photo_count
  from places pl
  join friend_ids fi on fi.uid = pl.user_id
  left join profiles pr on pr.id = pl.user_id
  where coalesce(pl.hidden_from_friends, false) = false
  order by total_s desc;
$$;

-- ── Photos storage bucket ──
insert into storage.buckets (id, name, public)
  values ('place-photos', 'place-photos', true)
  on conflict (id) do nothing;

drop policy if exists "place photo read" on storage.objects;
drop policy if exists "place photo write own" on storage.objects;
create policy "place photo read" on storage.objects for select
  using (bucket_id = 'place-photos');
create policy "place photo write own" on storage.objects for insert
  with check (bucket_id = 'place-photos' and (storage.foldername(name))[1] = auth.uid()::text);
