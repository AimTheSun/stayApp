-- ── Profiles ──
create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  created_at timestamptz not null default now()
);

alter table profiles enable row level security;

create policy "Users can view own profile"   on profiles for select using (id = auth.uid());
create policy "Users can update own profile" on profiles for update using (id = auth.uid());

-- Auto-create profile on signup
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer as $$
begin
  insert into public.profiles (id) values (new.id);
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ── Location Points ──
create table location_points (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  lat double precision not null,
  lng double precision not null,
  accuracy double precision,
  recorded_at timestamptz not null,
  created_at timestamptz not null default now()
);

alter table location_points enable row level security;

create policy "Users can select own points"  on location_points for select using (user_id = auth.uid());
create policy "Users can insert own points"  on location_points for insert with check (user_id = auth.uid());

create index idx_location_points_user_recorded on location_points (user_id, recorded_at);

-- ── Places ──
create table places (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  label text,
  lat double precision not null,
  lng double precision not null,
  radius_m double precision not null default 100,
  created_at timestamptz not null default now()
);

alter table places enable row level security;

create policy "Users can select own places" on places for select using (user_id = auth.uid());
create policy "Users can insert own places" on places for insert with check (user_id = auth.uid());
create policy "Users can update own places" on places for update using (user_id = auth.uid());
create policy "Users can delete own places" on places for delete using (user_id = auth.uid());

create index idx_places_user on places (user_id);

-- ── Stays ──
create table stays (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  place_id uuid references places(id) on delete set null,
  lat double precision not null,
  lng double precision not null,
  arrived_at timestamptz not null,
  left_at timestamptz not null,
  duration_s integer not null,
  created_at timestamptz not null default now()
);

alter table stays enable row level security;

create policy "Users can select own stays" on stays for select using (user_id = auth.uid());
create policy "Users can insert own stays" on stays for insert with check (user_id = auth.uid());
create policy "Users can update own stays" on stays for update using (user_id = auth.uid());
create policy "Users can delete own stays" on stays for delete using (user_id = auth.uid());

create index idx_stays_user on stays (user_id);

-- ── Place Stats Daily ──
create table place_stats_daily (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  place_id uuid not null references places(id) on delete cascade,
  date date not null,
  total_duration_s integer not null default 0,
  visit_count integer not null default 0,
  unique (user_id, place_id, date)
);

alter table place_stats_daily enable row level security;

create policy "Users can select own stats" on place_stats_daily for select using (user_id = auth.uid());
create policy "Users can insert own stats" on place_stats_daily for insert with check (user_id = auth.uid());
create policy "Users can update own stats" on place_stats_daily for update using (user_id = auth.uid());
