-- Atomic organizer save for the complete map editor aggregate.
-- Apply only after public.maps, public.points and public.paths exist with the
-- columns used below. The function must be protected by the owner's RLS policy.
create or replace function public.save_map_snapshot(p_map_id uuid, p_snapshot jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  result jsonb;
begin
  update maps
  set name = coalesce(p_snapshot->>'name', name),
      slug = coalesce(p_snapshot->>'slug', slug),
      description = coalesce(p_snapshot->>'description', description),
      access = p_snapshot->>'access',
      is_published = coalesce((p_snapshot->>'is_published')::boolean, is_published),
      plan_url = p_snapshot->>'plan_url',
      updated_at = now()
  where id = p_map_id;

  if not found then
    raise exception 'Map % not found or not owned by current organizer', p_map_id using errcode = 'P0002';
  end if;

  -- Rebuild the dependent graph in the same transaction. If any row fails,
  -- PostgreSQL rolls back the whole RPC and keeps the previous saved state.
  delete from paths where map_id = p_map_id;
  delete from points where map_id = p_map_id;

  insert into points (id, map_id, kind, category, icon, title, description, x, y)
  select (item->>'id')::uuid, p_map_id, item->>'kind', item->>'category', item->>'icon', item->>'title', item->>'description', (item->>'x')::numeric, (item->>'y')::numeric
  from jsonb_array_elements(coalesce(p_snapshot->'points', '[]'::jsonb)) item;

  insert into paths (id, map_id, from_point_id, to_point_id)
  select (item->>'id')::uuid, p_map_id, (item->>'from_id')::uuid, (item->>'to_id')::uuid
  from jsonb_array_elements(coalesce(p_snapshot->'paths', '[]'::jsonb)) item;

  -- Panoramas are part of this saved snapshot too. The unique place_id
  -- constraint makes replacement an update instead of a duplicate row.
  if to_regclass('public.panoramas') is not null then
    insert into panoramas (id, map_id, place_id, title, image_url, x, y, initial_yaw)
    select (item->>'id')::uuid, p_map_id, (item->>'place_id')::uuid, item->>'title', item->>'image_url',
           coalesce((item->>'x')::numeric, 0), coalesce((item->>'y')::numeric, 0),
           coalesce((item->>'initial_yaw')::numeric, 0)
    from jsonb_array_elements(coalesce(p_snapshot->'panoramas', '[]'::jsonb)) item
    on conflict (place_id) do update set
      title = excluded.title,
      image_url = excluded.image_url,
      x = excluded.x,
      y = excluded.y,
      initial_yaw = excluded.initial_yaw,
      updated_at = now();

    delete from panoramas
    where map_id = p_map_id
      and not (place_id = any(array(
        select (item->>'place_id')::uuid
        from jsonb_array_elements(coalesce(p_snapshot->'panoramas', '[]'::jsonb)) item
      )));
  end if;

  select to_jsonb(m) into result from maps m where m.id = p_map_id;
  return result;
end;
$$;
