begin;
-- Reviewed RLS + atomic save proposal for the schema in 01_schema.sql.
-- Not applied to a remote database. The RPC validates map ownership and
-- rejects cross-map point/path/panorama/hotspot references inside a snapshot.
alter table public.maps enable row level security;
alter table public.points enable row level security;
alter table public.paths enable row level security;
alter table public.panoramas enable row level security;
alter table public.panorama_hotspots enable row level security;

do $$ begin
 if not exists(select 1 from pg_policies where schemaname='public' and tablename='maps' and policyname='maps_owner_select') then create policy maps_owner_select on public.maps for select to authenticated using(owner_id=auth.uid()); end if;
 if not exists(select 1 from pg_policies where schemaname='public' and tablename='maps' and policyname='maps_owner_insert') then create policy maps_owner_insert on public.maps for insert to authenticated with check(owner_id=auth.uid()); end if;
 if not exists(select 1 from pg_policies where schemaname='public' and tablename='maps' and policyname='maps_owner_update') then create policy maps_owner_update on public.maps for update to authenticated using(owner_id=auth.uid()) with check(owner_id=auth.uid()); end if;
 if not exists(select 1 from pg_policies where schemaname='public' and tablename='maps' and policyname='maps_owner_delete') then create policy maps_owner_delete on public.maps for delete to authenticated using(owner_id=auth.uid()); end if;
 if not exists(select 1 from pg_policies where schemaname='public' and tablename='maps' and policyname='maps_public_published_select') then create policy maps_public_published_select on public.maps for select to anon,authenticated using(is_published and access='public'); end if;
 if not exists(select 1 from pg_policies where schemaname='public' and tablename='points' and policyname='points_owner_all') then create policy points_owner_all on public.points for all to authenticated using(exists(select 1 from public.maps m where m.id=map_id and m.owner_id=auth.uid())) with check(exists(select 1 from public.maps m where m.id=map_id and m.owner_id=auth.uid())); end if;
 if not exists(select 1 from pg_policies where schemaname='public' and tablename='points' and policyname='points_public_select') then create policy points_public_select on public.points for select to anon,authenticated using(exists(select 1 from public.maps m where m.id=map_id and m.is_published and m.access='public')); end if;
 if not exists(select 1 from pg_policies where schemaname='public' and tablename='paths' and policyname='paths_owner_all') then create policy paths_owner_all on public.paths for all to authenticated using(exists(select 1 from public.maps m where m.id=map_id and m.owner_id=auth.uid())) with check(exists(select 1 from public.maps m where m.id=map_id and m.owner_id=auth.uid())); end if;
 if not exists(select 1 from pg_policies where schemaname='public' and tablename='paths' and policyname='paths_public_select') then create policy paths_public_select on public.paths for select to anon,authenticated using(exists(select 1 from public.maps m where m.id=map_id and m.is_published and m.access='public')); end if;
 if not exists(select 1 from pg_policies where schemaname='public' and tablename='panoramas' and policyname='panoramas_owner_all') then create policy panoramas_owner_all on public.panoramas for all to authenticated using(exists(select 1 from public.maps m where m.id=map_id and m.owner_id=auth.uid())) with check(exists(select 1 from public.maps m where m.id=map_id and m.owner_id=auth.uid())); end if;
 if not exists(select 1 from pg_policies where schemaname='public' and tablename='panoramas' and policyname='panoramas_public_select') then create policy panoramas_public_select on public.panoramas for select to anon,authenticated using(exists(select 1 from public.maps m where m.id=map_id and m.is_published and m.access='public')); end if;
 -- Replace this policy rather than adding a permissive policy alongside it:
 -- PostgreSQL combines permissive policies with OR. The optional references
 -- must stay inside the same map as the hotspot's panorama.
 drop policy if exists hotspots_owner_all on public.panorama_hotspots;
 create policy hotspots_owner_all on public.panorama_hotspots
   for all to authenticated
   using(exists(
     select 1 from public.panoramas p
     join public.maps m on m.id=p.map_id
     where p.id=panorama_id and m.owner_id=auth.uid()
   ))
   with check(
     exists(
       select 1 from public.panoramas p
       join public.maps m on m.id=p.map_id
       where p.id=panorama_id and m.owner_id=auth.uid()
     )
     and (poi_id is null or exists(
       select 1 from public.points pt
       join public.panoramas p on p.map_id=pt.map_id
       where pt.id=poi_id and p.id=panorama_id
     ))
     and (target_panorama_id is null or exists(
       select 1 from public.panoramas source
       join public.panoramas target on target.map_id=source.map_id
       where source.id=panorama_id and target.id=target_panorama_id
     ))
   );
 if not exists(select 1 from pg_policies where schemaname='public' and tablename='panorama_hotspots' and policyname='hotspots_public_select') then create policy hotspots_public_select on public.panorama_hotspots for select to anon,authenticated using(exists(select 1 from public.panoramas p join public.maps m on m.id=p.map_id where p.id=panorama_id and m.is_published and m.access='public')); end if;
end $$;

grant select on public.maps,public.points,public.paths,public.panoramas,public.panorama_hotspots to anon,authenticated;
grant insert,update,delete on public.maps,public.points,public.paths,public.panoramas,public.panorama_hotspots to authenticated;

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




