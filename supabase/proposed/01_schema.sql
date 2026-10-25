begin;
-- Bootstrap schema for a NEW Supabase project for the current app model.
-- This file is prepared locally only; it has NOT been applied to any remote project.
-- Refuses to run if any target table already exists, so it cannot silently
-- overwrite/alter an existing user's schema. Inspect and write a separate,
-- data-preserving upgrade migration if the guard fails.
do $$
begin
  if to_regclass('public.maps') is not null
     or to_regclass('public.points') is not null
     or to_regclass('public.paths') is not null
     or to_regclass('public.panoramas') is not null
     or to_regclass('public.panorama_hotspots') is not null then
    raise exception 'Map schema already exists. Stop; inspect it and prepare a reviewed upgrade migration instead of running this bootstrap.';
  end if;
end $$;

create table public.maps (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null,
  slug text not null unique,
  description text not null default '',
  access text not null default 'public' check (access in ('public','password')),
  is_published boolean not null default false,
  plan_url text,
  floor_plans jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.points (
  id uuid primary key default gen_random_uuid(),
  map_id uuid not null references public.maps(id) on delete cascade,
  kind text not null check (kind in ('poi','node')),
  category text not null check (category in ('hall','entrance','stand','service','wifi','toilet','food','other')),
  icon text,
  title text not null default '',
  description text not null default '',
  x double precision not null check (x between 0 and 1),
  y double precision not null check (y between 0 and 1),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, map_id)
);

create table public.paths (
  id uuid primary key default gen_random_uuid(),
  map_id uuid not null references public.maps(id) on delete cascade,
  from_point_id uuid not null,
  to_point_id uuid not null,
  weight double precision check (weight is null or weight >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (from_point_id <> to_point_id),
  foreign key (from_point_id, map_id) references public.points(id, map_id) on delete cascade,
  foreign key (to_point_id, map_id) references public.points(id, map_id) on delete cascade
);

create table public.panoramas (
  id uuid primary key default gen_random_uuid(),
  map_id uuid not null references public.maps(id) on delete cascade,
  place_id uuid not null,
  title text not null,
  image_url text not null,
  thumbnail_url text,
  x double precision not null check (x between 0 and 1),
  y double precision not null check (y between 0 and 1),
  initial_yaw double precision not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (place_id),
  unique (id, map_id),
  foreign key (place_id, map_id) references public.points(id, map_id) on delete cascade
);

create table public.panorama_hotspots (
  id uuid primary key default gen_random_uuid(),
  panorama_id uuid not null references public.panoramas(id) on delete cascade,
  kind text not null check (kind in ('poi','transition','info')),
  yaw double precision not null,
  pitch double precision not null,
  label text not null,
  description text,
  poi_id uuid references public.points(id) on delete set null,
  target_panorama_id uuid references public.panoramas(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index points_map_id_idx on public.points(map_id);
create index paths_map_id_idx on public.paths(map_id);
create index panoramas_map_id_idx on public.panoramas(map_id);
create index panorama_hotspots_panorama_id_idx on public.panorama_hotspots(panorama_id);

commit;

