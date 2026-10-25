begin;

-- This migration does not create or modify the bucket and does not delete
-- existing policies. Create a private bucket named map-floor-plans manually
-- in Supabase Dashboard before running this file.
do $$
begin
  if not exists (
    select 1
    from storage.buckets
    where id = 'map-floor-plans'
      and name = 'map-floor-plans'
      and public = false
  ) then
    raise exception 'Expected private Storage bucket map-floor-plans was not found';
  end if;
end $$;

-- Application path format:
--   <maps.id>/<floor>/<generated-file-name>.<png|svg>
-- The first path segment is compared to maps.id and is never trusted as an
-- owner id supplied by the browser.
do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'map_floor_plans_read'
  ) then
    create policy map_floor_plans_read
      on storage.objects
      for select
      to anon, authenticated
      using (
        bucket_id = 'map-floor-plans'
        and exists (
          select 1
          from public.maps m
          where m.id::text = (storage.foldername(name))[1]
            and (
              m.owner_id = auth.uid()
              or (m.is_published = true and m.access = 'public')
            )
        )
      );
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'map_floor_plans_insert'
  ) then
    create policy map_floor_plans_insert
      on storage.objects
      for insert
      to authenticated
      with check (
        bucket_id = 'map-floor-plans'
        and exists (
          select 1
          from public.maps m
          where m.id::text = (storage.foldername(name))[1]
            and m.owner_id = auth.uid()
        )
      );
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'map_floor_plans_update'
  ) then
    create policy map_floor_plans_update
      on storage.objects
      for update
      to authenticated
      using (
        bucket_id = 'map-floor-plans'
        and exists (
          select 1
          from public.maps m
          where m.id::text = (storage.foldername(name))[1]
            and m.owner_id = auth.uid()
        )
      )
      with check (
        bucket_id = 'map-floor-plans'
        and exists (
          select 1
          from public.maps m
          where m.id::text = (storage.foldername(name))[1]
            and m.owner_id = auth.uid()
        )
      );
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'map_floor_plans_delete'
  ) then
    create policy map_floor_plans_delete
      on storage.objects
      for delete
      to authenticated
      using (
        bucket_id = 'map-floor-plans'
        and exists (
          select 1
          from public.maps m
          where m.id::text = (storage.foldername(name))[1]
            and m.owner_id = auth.uid()
        )
      );
  end if;
end $$;

commit;
