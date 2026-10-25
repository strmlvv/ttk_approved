begin;

-- Safe, data-preserving upgrade for an already initialized project.
alter table public.maps
  add column if not exists floor_plans jsonb not null default '{}'::jsonb;

-- The bucket is created manually in Supabase Dashboard. Refuse to continue
-- rather than creating it or silently changing an existing bucket's settings.
do $$
begin
  if not exists (
    select 1 from storage.buckets
    where id = 'map-floor-plans'
      and name = 'map-floor-plans'
      and public = false
  ) then
    raise exception 'Create a private Storage bucket named map-floor-plans in Supabase Dashboard, then rerun this migration.';
  end if;
end $$;

drop policy if exists map_floor_plans_read on storage.objects;
create policy map_floor_plans_read
  on storage.objects for select to anon, authenticated
  using (
    bucket_id = 'map-floor-plans'
    and (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    and exists (
      select 1 from public.maps m
      where m.id = ((storage.foldername(name))[1])::uuid
        and (
          m.owner_id = auth.uid()
          or (m.is_published and m.access = 'public')
        )
    )
  );

drop policy if exists map_floor_plans_owner_insert on storage.objects;
create policy map_floor_plans_owner_insert
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'map-floor-plans'
    and (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    and exists (
      select 1 from public.maps m
      where m.id = ((storage.foldername(name))[1])::uuid
        and m.owner_id = auth.uid()
    )
  );

drop policy if exists map_floor_plans_owner_update on storage.objects;
create policy map_floor_plans_owner_update
  on storage.objects for update to authenticated
  using (
    bucket_id = 'map-floor-plans'
    and (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    and exists (
      select 1 from public.maps m
      where m.id = ((storage.foldername(name))[1])::uuid
        and m.owner_id = auth.uid()
    )
  )
  with check (
    bucket_id = 'map-floor-plans'
    and (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    and exists (
      select 1 from public.maps m
      where m.id = ((storage.foldername(name))[1])::uuid
        and m.owner_id = auth.uid()
    )
  );

drop policy if exists map_floor_plans_owner_delete on storage.objects;
create policy map_floor_plans_owner_delete
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'map-floor-plans'
    and (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    and exists (
      select 1 from public.maps m
      where m.id = ((storage.foldername(name))[1])::uuid
        and m.owner_id = auth.uid()
    )
  );

-- Recreate the existing atomic RPC with support for per-floor plan URLs.
create or replace function public.save_map_snapshot(p_map_id uuid,p_snapshot jsonb)
returns jsonb language plpgsql security invoker set search_path=public as $$
declare v_result jsonb;
begin
 update public.maps set name=p_snapshot->>'name',slug=p_snapshot->>'slug',description=coalesce(p_snapshot->>'description',''),access=p_snapshot->>'access',is_published=coalesce((p_snapshot->>'is_published')::boolean,false),plan_url=nullif(p_snapshot->>'plan_url',''),floor_plans=coalesce(p_snapshot->'floor_plans','{}'::jsonb),updated_at=now()
 where id=p_map_id and owner_id=auth.uid();
 if not found then raise exception 'Map not found or not owned by current user' using errcode='42501'; end if;

 delete from public.paths where map_id=p_map_id;

 -- Hotspots are replaced as part of the submitted snapshot below. Delete
 -- current-map children before changing/deleting panorama IDs; the transaction
 -- restores all data if any later validation or insert fails.

 if exists(
   select 1 from jsonb_array_elements(coalesce(p_snapshot->'points','[]'::jsonb)) j
   join public.points existing on existing.id=(j->>'id')::uuid
   where existing.map_id <> p_map_id
 ) then raise exception 'Point ID belongs to another map' using errcode='23503'; end if;

 insert into public.points(id,map_id,kind,category,icon,title,description,x,y,updated_at)
 select (j->>'id')::uuid,p_map_id,j->>'kind',j->>'category',j->>'icon',coalesce(j->>'title',''),coalesce(j->>'description',''),(j->>'x')::double precision,(j->>'y')::double precision,now()
 from jsonb_array_elements(coalesce(p_snapshot->'points','[]'::jsonb)) j
 on conflict(id) do update set kind=excluded.kind,category=excluded.category,icon=excluded.icon,title=excluded.title,description=excluded.description,x=excluded.x,y=excluded.y,updated_at=now() where public.points.map_id=p_map_id;

 -- Hotspots are part of the submitted aggregate. Remove the current
 -- hotspots for this map before replacing panorama rows so deleted hotspots
 -- cannot survive a successful snapshot save. This also makes replacing a
 -- panorama with a new id safe: no child row still references the old id.
 delete from public.panorama_hotspots h
 where exists(
   select 1
   from public.panoramas p
   where p.id=h.panorama_id and p.map_id=p_map_id
 );

 delete from public.panoramas p where p.map_id=p_map_id and not exists(select 1 from jsonb_array_elements(coalesce(p_snapshot->'panoramas','[]'::jsonb)) j where (j->>'place_id')::uuid=p.place_id);
 if exists(
   select 1 from jsonb_array_elements(coalesce(p_snapshot->'panoramas','[]'::jsonb)) j
   join public.panoramas existing on existing.place_id=(j->>'place_id')::uuid
   where existing.map_id <> p_map_id
 ) then raise exception 'Panorama place_id belongs to another map' using errcode='23503'; end if;
 if exists(
   select 1
   from jsonb_array_elements(coalesce(p_snapshot->'panoramas','[]'::jsonb)) j
   where not exists(
     select 1
     from public.points p
     where p.id=(j->>'place_id')::uuid and p.map_id=p_map_id
   )
 ) then raise exception 'Panorama place_id does not belong to this map' using errcode='23503'; end if;
 if exists(
   select 1
   from jsonb_array_elements(coalesce(p_snapshot->'panoramas','[]'::jsonb)) j
   join public.panoramas existing on existing.id=(j->>'id')::uuid
   where existing.map_id <> p_map_id
 ) then raise exception 'Panorama ID belongs to another map' using errcode='23503'; end if;
 insert into public.panoramas(id,map_id,place_id,title,image_url,thumbnail_url,x,y,initial_yaw,updated_at)
 select (j->>'id')::uuid,p_map_id,(j->>'place_id')::uuid,j->>'title',j->>'image_url',j->>'thumbnail_url',coalesce((j->>'x')::double precision,0),coalesce((j->>'y')::double precision,0),coalesce((j->>'initial_yaw')::double precision,0),now()
 from jsonb_array_elements(coalesce(p_snapshot->'panoramas','[]'::jsonb)) j
 on conflict(place_id) do update set id=excluded.id,title=excluded.title,image_url=excluded.image_url,thumbnail_url=excluded.thumbnail_url,x=excluded.x,y=excluded.y,initial_yaw=excluded.initial_yaw,updated_at=now() where public.panoramas.map_id=p_map_id;



 -- Validate all graph endpoints belong to the map before inserting paths.
 if exists(
   select 1 from jsonb_array_elements(coalesce(p_snapshot->'paths','[]'::jsonb)) j
   where not exists(select 1 from public.points p where p.id=(j->>'from_id')::uuid and p.map_id=p_map_id)
      or not exists(select 1 from public.points p where p.id=(j->>'to_id')::uuid and p.map_id=p_map_id)
 ) then raise exception 'Path references a point from another map' using errcode='23503'; end if;
 insert into public.paths(id,map_id,from_point_id,to_point_id,weight)
 select (j->>'id')::uuid,p_map_id,(j->>'from_id')::uuid,(j->>'to_id')::uuid,nullif(j->>'weight','')::double precision
 from jsonb_array_elements(coalesce(p_snapshot->'paths','[]'::jsonb)) j;

 if exists(
   select 1 from jsonb_array_elements(coalesce(p_snapshot->'panorama_hotspots','[]'::jsonb)) h
   where not exists(select 1 from public.panoramas p where p.id=(h->>'panorama_id')::uuid and p.map_id=p_map_id)
       or (nullif(h->>'poi_id','') is not null and not exists(select 1 from public.points p where p.id=(h->>'poi_id')::uuid and p.map_id=p_map_id))
       or (nullif(h->>'target_panorama_id','') is not null and not exists(select 1 from public.panoramas p where p.id=(h->>'target_panorama_id')::uuid and p.map_id=p_map_id))
 ) then raise exception 'Hotspot references an object from another map' using errcode='23503'; end if;
 if exists(
   select 1
   from jsonb_array_elements(coalesce(p_snapshot->'panorama_hotspots','[]'::jsonb)) h
   join public.panorama_hotspots existing on existing.id=(h->>'id')::uuid
   join public.panoramas owner_panorama on owner_panorama.id=existing.panorama_id
   where owner_panorama.map_id <> p_map_id
 ) then raise exception 'Hotspot ID belongs to another map' using errcode='23503'; end if;
 insert into public.panorama_hotspots(id,panorama_id,kind,yaw,pitch,label,description,poi_id,target_panorama_id)
 select (h->>'id')::uuid,(h->>'panorama_id')::uuid,h->>'kind',(h->>'yaw')::double precision,(h->>'pitch')::double precision,h->>'label',h->>'description',nullif(h->>'poi_id','')::uuid,nullif(h->>'target_panorama_id','')::uuid
 from jsonb_array_elements(coalesce(p_snapshot->'panorama_hotspots','[]'::jsonb)) h
 on conflict(id) do update set panorama_id=excluded.panorama_id,kind=excluded.kind,yaw=excluded.yaw,pitch=excluded.pitch,label=excluded.label,description=excluded.description,poi_id=excluded.poi_id,target_panorama_id=excluded.target_panorama_id,updated_at=now()
 where exists(
   select 1
   from public.panoramas owner_panorama
   where owner_panorama.id=public.panorama_hotspots.panorama_id
     and owner_panorama.map_id=p_map_id
 );

 delete from public.points p where p.map_id=p_map_id and not exists(select 1 from jsonb_array_elements(coalesce(p_snapshot->'points','[]'::jsonb)) j where (j->>'id')::uuid=p.id);
 select to_jsonb(m) into v_result from public.maps m where m.id=p_map_id;
 return v_result;
end $$;
revoke all on function public.save_map_snapshot(uuid,jsonb) from public,anon;
grant execute on function public.save_map_snapshot(uuid,jsonb) to authenticated;


commit;
