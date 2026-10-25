-- Places -> Panoramas is optional one-to-one:
--   Place has zero or one panorama; each panorama has exactly one place.
-- Keep the newest panorama for duplicate place_id values and re-parent its
-- hotspots before removing superseded panorama rows.

begin;

-- Preserve associated hotspots by moving them to the canonical panorama row.
do $$
begin
  if to_regclass('public.panorama_hotspots') is not null
     and exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'panorama_hotspots' and column_name = 'panorama_id') then
    execute $sql$
      with ranked as (
        select id, place_id,
               first_value(id) over (partition by place_id order by updated_at desc nulls last, created_at desc nulls last, id desc) as keep_id,
               row_number() over (partition by place_id order by updated_at desc nulls last, created_at desc nulls last, id desc) as rn
        from public.panoramas
        where place_id is not null
      ), duplicates as (select id, keep_id from ranked where rn > 1)
      update public.panorama_hotspots h
      set panorama_id = d.keep_id
      from duplicates d
      where h.panorama_id = d.id
    $sql$;
  end if;
end $$;

-- Deterministically retain the most recently updated panorama per place.
with ranked as (
  select id,
         row_number() over (
           partition by place_id
           order by updated_at desc nulls last, created_at desc nulls last, id desc
         ) as rn
  from public.panoramas
  where place_id is not null
)
delete from public.panoramas p
using ranked r
where p.id = r.id and r.rn > 1;

-- Nullable FK preserves places that have not received a panorama yet.
do $$
begin
  if to_regclass('public.places') is not null
     and not exists (select 1 from pg_constraint where conname = 'panoramas_place_id_fkey' and conrelid = 'public.panoramas'::regclass) then
    alter table public.panoramas
      add constraint panoramas_place_id_fkey
      foreign key (place_id) references public.places(id)
      on delete cascade;
  end if;
end $$;

-- The database, not only the UI, enforces at most one panorama per place.
create unique index if not exists panoramas_place_id_unique
  on public.panoramas (place_id)
  where place_id is not null;

commit;
