import type { EditorPath, EditorPoint, OrganizerMap, MapAccess } from './types';
import { getSupabaseClient, assertNoSupabaseError } from '../api/client';
import { getCurrentOrganizer } from '../api/auth';

const storageKey = 'ttk-organizer-maps-v1';
const cacheKey = 'ttk-organizer-maps-cache-v2';
const seed: OrganizerMap[] = [{ id: 'map-central', name: 'ТТК «Центральный»', slug: 'central', access: 'public', is_published: true, created_at: '2026-10-20T12:00:00.000Z', updated_at: '2026-10-24T09:00:00.000Z', points: [], paths: [] }];
const read = (): OrganizerMap[] => { try { const raw = window.localStorage.getItem(storageKey); return raw ? JSON.parse(raw) : seed; } catch { return seed; } };
const readCache = (): OrganizerMap[] => { try { const raw = window.localStorage.getItem(cacheKey); return raw ? JSON.parse(raw) : []; } catch { return []; } };
const compactForCache = (map: OrganizerMap): OrganizerMap => ({
  ...map,
  plan_url: map.plan_url && !isImageDataUrl(map.plan_url) ? map.plan_url : undefined,
  floor_plans: Object.fromEntries(Object.entries(map.floor_plans ?? {}).filter(([, value]) => !isImageDataUrl(value))),
  panoramas: (map.panoramas ?? []).filter((panorama) => !isImageDataUrl(panorama.image_url)).map((panorama) => ({ ...panorama, hotspots: undefined })),
});
const write = (maps: OrganizerMap[]) => {
  try {
    window.localStorage.setItem(storageKey, JSON.stringify(maps));
  } catch (error) {
    try { window.localStorage.setItem(cacheKey, JSON.stringify(maps.map(compactForCache))); } catch { /* Preserve the original value; never clear data on quota errors. */ }
    throw new Error('Локальное хранилище переполнено: изображения не помещаются в localStorage. Данные не удалены; сохраните изображения в Supabase Storage.');
  }
};
const now = () => new Date().toISOString();
async function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  let timer: number | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => { timer = window.setTimeout(() => reject(new Error(message)), ms); }),
    ]);
  } finally {
    if (timer !== undefined) window.clearTimeout(timer);
  }
}
const normalizeServerMap = (data: any): OrganizerMap => ({ ...data, points: data.points ?? [], paths: (data.paths ?? []).map((path: any) => ({ ...path, from_id: path.from_id ?? path.from_point_id, to_id: path.to_id ?? path.to_point_id })), panoramas: data.panoramas ?? [], panorama_hotspots: data.panorama_hotspots ?? [] });
const findCachedPublishedMap = (slug: string): OrganizerMap | null => [...readCache(), ...read()].find((map) => map.slug === slug && map.is_published && map.access === 'public') ?? null;
const cacheMap = (map: OrganizerMap) => {
  try {
    const cached = readCache().filter((item) => item.id !== map.id);
    window.localStorage.setItem(cacheKey, JSON.stringify([...cached, compactForCache(map)]));
  } catch { /* Cache is optional; never block Supabase-backed loading. */ }
};
const FLOOR_PLAN_BUCKET = 'map-floor-plans';
const FLOOR_PLAN_STORAGE_PREFIX = `storage://${FLOOR_PLAN_BUCKET}/`;
const isImageDataUrl = (value?: string): value is string => Boolean(value?.startsWith('data:image/'));
const isStorageReference = (value?: string): value is string => Boolean(value?.startsWith(FLOOR_PLAN_STORAGE_PREFIX));
const isMissingFloorPlanBucketError = (error: unknown): boolean => error instanceof Error && error.message.toLowerCase().includes('bucket not found');
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function storageOperationError(operation: string, bucket: string, path: string, error: { message?: string; code?: string; statusCode?: string | number } | null | undefined): Error {
  const details = [
    error?.message || 'Неизвестная ошибка Supabase Storage',
    error?.code ? `code=${error.code}` : '',
    error?.statusCode ? `status=${error.statusCode}` : '',
  ].filter(Boolean).join('; ');
  return new Error(`Storage ${operation} не выполнен. bucket=${bucket}; path=${path}; ответ Supabase: ${details}`);
}

async function assertMapUploadContext(client: NonNullable<ReturnType<typeof getSupabaseClient>>, mapId: string): Promise<void> {
  if (!uuidPattern.test(mapId)) {
    throw new Error(`Невозможно загрузить план: ID карты «${mapId}» не является UUID Supabase.`);
  }
  const { data: sessionData, error: sessionError } = await client.auth.getSession();
  if (sessionError) throw new Error(`Не удалось проверить сессию Supabase перед загрузкой: ${sessionError.message}`);
  const userId = sessionData.session?.user?.id;
  if (!userId) throw new Error('Сессия Supabase отсутствует или истекла. Войдите в кабинет организатора заново.');
  const { data: mapRow, error: mapError } = await client.from('maps').select('id, owner_id').eq('id', mapId).maybeSingle();
  if (mapError) throw new Error(`Не удалось проверить владельца карты перед загрузкой: ${mapError.message}`);
  if (!mapRow) throw new Error(`Карта ${mapId} не найдена в Supabase.`);
  if (mapRow.owner_id !== userId) throw new Error('Текущий пользователь Supabase не является владельцем этой карты.');
}

async function uploadPlanImage(client: NonNullable<ReturnType<typeof getSupabaseClient>>, mapId: string, floor: string, dataUrl: string): Promise<string> {
  await assertMapUploadContext(client, mapId);
  const match = dataUrl.match(/^data:(image\/(?:png|svg\+xml));base64,(.+)$/);
  if (!match) throw new Error(`План ${floor} этажа имеет неподдерживаемый формат. Используйте PNG или SVG.`);
  const contentType = match[1];
  const extension = contentType === 'image/svg+xml' ? 'svg' : 'png';
  const bytes = Uint8Array.from(atob(match[2]), (char) => char.charCodeAt(0));
  const objectPath = `${mapId}/${floor}/${crypto.randomUUID()}.${extension}`;
  const { error } = await client.storage.from(FLOOR_PLAN_BUCKET).upload(objectPath, new Blob([bytes], { type: contentType }), {
    contentType,
    cacheControl: '3600',
    upsert: false,
  });
  if (error) throw storageOperationError('insert', FLOOR_PLAN_BUCKET, objectPath, error);
  return `${FLOOR_PLAN_STORAGE_PREFIX}${objectPath}`;
}

async function readablePlanUrl(client: NonNullable<ReturnType<typeof getSupabaseClient>>, reference?: string): Promise<string | undefined> {
  if (!reference) return undefined;
  if (!isStorageReference(reference)) return reference;
  const { data, error } = await client.storage.from(FLOOR_PLAN_BUCKET).createSignedUrl(reference.slice(FLOOR_PLAN_STORAGE_PREFIX.length), 60 * 60);
  assertNoSupabaseError(error);
  if (!data?.signedUrl) throw new Error('Не удалось получить ссылку на сохранённый план этажа');
  return data.signedUrl;
}

async function hydrateFloorPlans(client: NonNullable<ReturnType<typeof getSupabaseClient>>, map: OrganizerMap): Promise<OrganizerMap> {
  const floor_plan_display_urls = Object.fromEntries(await Promise.all(Object.entries(map.floor_plans ?? {}).map(async ([floor, reference]) => [floor, await readablePlanUrl(client, reference)])));
  return {
    ...map,
    plan_display_url: await readablePlanUrl(client, map.plan_url),
    floor_plan_display_urls,
  };
}
const transliteration: Record<string, string> = { а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'yo', ж: 'zh', з: 'z', и: 'i', й: 'y', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'h', ц: 'c', ч: 'ch', ш: 'sh', щ: 'sch', ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya' };
const slugify = (value: string) => value.toLowerCase().split('').map((char) => transliteration[char] ?? char).join('').replace(/[^a-z0-9\s-]/gi, '').replace(/\s+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '') || 'map';
const uniqueSlug = (name: string, maps: OrganizerMap[]) => { const base = slugify(name).replace(/[а-яё]/gi, '') || 'map'; let slug = base; let index = 2; while (maps.some((map) => map.slug === slug)) slug = `${base}-${index++}`; return slug; };

export async function getMyMaps(): Promise<OrganizerMap[]> { const client = getSupabaseClient(); if (client) { const user = await getCurrentOrganizer(); if (!user) throw new Error('Войдите в аккаунт организатора'); const { data, error } = await client.from('maps').select('*').eq('owner_id', user.id).order('updated_at', { ascending: false }); assertNoSupabaseError(error); return (data ?? []).map(normalizeServerMap); } return read(); }
export async function getMapById(id: string): Promise<OrganizerMap | null> {
  const client = getSupabaseClient();
  if (!client) return read().find((map) => map.id === id) ?? null;
  const user = await getCurrentOrganizer();
  if (!user) throw new Error('Войдите в аккаунт организатора');
  const { data: mapData, error: mapError } = await client.from('maps').select('*').eq('id', id).eq('owner_id', user.id).maybeSingle();
  assertNoSupabaseError(mapError);
  if (!mapData) return null;
  const [pointResult, pathResult, panoramaResult, hotspotResult] = await Promise.all([
    client.from('points').select('*').eq('map_id', id),
    client.from('paths').select('*').eq('map_id', id),
    client.from('panoramas').select('*').eq('map_id', id),
    client.from('panorama_hotspots').select('*').in('panorama_id', (await client.from('panoramas').select('id').eq('map_id', id)).data?.map((item: { id: string }) => item.id) ?? []),
  ]);
  assertNoSupabaseError(pointResult.error); assertNoSupabaseError(pathResult.error); assertNoSupabaseError(panoramaResult.error); assertNoSupabaseError(hotspotResult.error);
  const hydrated = await hydrateFloorPlans(client, normalizeServerMap({ ...mapData, floor_plans_supported: Object.prototype.hasOwnProperty.call(mapData, 'floor_plans'), points: pointResult.data ?? [], paths: pathResult.data ?? [], panoramas: panoramaResult.data ?? [], panorama_hotspots: hotspotResult.data ?? [] }));
  cacheMap(hydrated);
  return hydrated;
}
export async function getSavedMapBySlug(slug: string): Promise<OrganizerMap | null> {
  const client = getSupabaseClient();
  if (!client) return read().find((map) => map.slug === slug && map.is_published && map.access === 'public') ?? null;
  try {
    const { data, error } = await withTimeout(
      Promise.resolve(client.from('maps').select('*').eq('slug', slug).eq('is_published', true).eq('access', 'public').maybeSingle()),
      15000,
      'Supabase не ответил при загрузке публичной карты',
    );
    assertNoSupabaseError(error);
    if (!data) return null;
    const { data: points, error: pointsError } = await withTimeout(
      Promise.resolve(client.from('points').select('*').eq('map_id', data.id)),
      15000,
      'Supabase не ответил при загрузке помещений карты',
    );
    assertNoSupabaseError(pointsError);
    const { data: paths, error: pathsError } = await withTimeout(
      Promise.resolve(client.from('paths').select('*').eq('map_id', data.id)),
      15000,
      'Supabase не ответил при загрузке маршрутов карты',
    );
    assertNoSupabaseError(pathsError);
    const hydrated = await hydrateFloorPlans(client, normalizeServerMap({ ...data, points: points ?? [], paths: paths ?? [] }));
    cacheMap(hydrated);
    return hydrated;
  } catch (error) {
    const cached = findCachedPublishedMap(slug);
    if (cached) return cached;
    throw error;
  }
}
export async function createMap(name: string): Promise<OrganizerMap> { const maps = read(); const map: OrganizerMap = { id: `map-${crypto.randomUUID?.() ?? Date.now()}`, name: name.trim() || 'Новая карта', slug: uniqueSlug(name, maps), access: 'public', is_published: false, created_at: now(), updated_at: now(), points: [], paths: [] }; if (getSupabaseClient()) { const user = await getCurrentOrganizer(); if (!user) throw new Error('Войдите в аккаунт организатора'); const { data, error } = await getSupabaseClient()!.from('maps').insert({ owner_id: user.id, name: map.name, slug: map.slug, access: map.access, is_published: false }).select('*').single(); assertNoSupabaseError(error); return normalizeServerMap({ ...data, points: [], paths: [] }); } write([map, ...maps]); return map; }
export async function updateMap(id: string, patch: Partial<Pick<OrganizerMap, 'name' | 'slug' | 'access' | 'is_published' | 'plan_url'>>): Promise<OrganizerMap | null> { let result: OrganizerMap | null = null; const maps = read().map((map) => { if (map.id !== id) return map; result = { ...map, ...patch, updated_at: now() }; return result; }); write(maps); return result; }
export async function saveMapSnapshot(snapshot: OrganizerMap): Promise<{ map: OrganizerMap; persisted: 'server' | 'local'; storageFallback?: boolean }> {
  const client = getSupabaseClient();
  if (client) {
    const user = await getCurrentOrganizer();
    if (!user) throw new Error('Войдите в аккаунт организатора');
    if (typeof client.rpc !== 'function') throw new Error('Серверное атомарное сохранение не настроено (RPC save_map_snapshot отсутствует)');
    const pointIds = new Map(snapshot.points.map((point) => [point.id, uuidPattern.test(point.id) ? point.id : crypto.randomUUID()]));
    const panoramaIds = new Map((snapshot.panoramas ?? []).map((panorama) => [panorama.id, uuidPattern.test(panorama.id) ? panorama.id : crypto.randomUUID()]));
    const serverSnapshot: OrganizerMap = {
      ...snapshot,
      points: snapshot.points.map((point) => ({ ...point, id: pointIds.get(point.id)! })),
      paths: snapshot.paths.map((path) => ({
        ...path,
        id: uuidPattern.test(path.id) ? path.id : crypto.randomUUID(),
        from_id: pointIds.get(path.from_id) ?? path.from_id,
        to_id: pointIds.get(path.to_id) ?? path.to_id,
      })),
    panoramas: snapshot.panoramas?.map((panorama) => ({
        ...panorama,
        id: panoramaIds.get(panorama.id)!,
        place_id: pointIds.get(panorama.place_id) ?? panorama.place_id,
      })),
      panorama_hotspots: snapshot.panorama_hotspots?.map((hotspot) => ({
        ...hotspot,
        id: uuidPattern.test(hotspot.id) ? hotspot.id : crypto.randomUUID(),
        panorama_id: panoramaIds.get(hotspot.panorama_id) ?? hotspot.panorama_id,
        poi_id: hotspot.poi_id ? pointIds.get(hotspot.poi_id) ?? hotspot.poi_id : undefined,
      })),
    };
    const hotspotIds = new Map((snapshot.panorama_hotspots ?? []).map((hotspot) => [hotspot.id, uuidPattern.test(hotspot.id) ? hotspot.id : crypto.randomUUID()]));
    serverSnapshot.panorama_hotspots = snapshot.panorama_hotspots?.map((hotspot) => ({
      ...hotspot,
      id: hotspotIds.get(hotspot.id)!,
      panorama_id: panoramaIds.get(hotspot.panorama_id) ?? hotspot.panorama_id,
      poi_id: hotspot.poi_id ? pointIds.get(hotspot.poi_id) ?? hotspot.poi_id : undefined,
      target_panorama_id: hotspot.target_panorama_id ? panoramaIds.get(hotspot.target_panorama_id) ?? hotspot.target_panorama_id : undefined,
    }));
    const floorPlans: Record<string, string> = {};
    let storageFallback = false;
    for (const [floor, image] of Object.entries(snapshot.floor_plans ?? {})) {
      if (!isImageDataUrl(image)) {
        floorPlans[floor] = image;
        continue;
      }
      try {
        floorPlans[floor] = await uploadPlanImage(client, snapshot.id, floor, image);
      } catch (error) {
        if (!isMissingFloorPlanBucketError(error)) throw error;
        // Keep the existing save flow usable until the owner creates the
        // Storage bucket. The image remains durable in the JSONB/text fields;
        // a later save can move it to Storage without losing the draft.
        floorPlans[floor] = image;
        storageFallback = true;
      }
    }
    const hasUnpersistableExtraFloorPlans = Object.entries(floorPlans).some(([floor, value]) =>
      floor !== '1' && (isImageDataUrl(value) || isStorageReference(value))
    );
    if (hasUnpersistableExtraFloorPlans && snapshot.floor_plans_supported === false) {
      throw new Error('В Supabase ещё не установлена миграция поддержки планов нескольких этажей. Примените 03_floor_plans_upgrade.sql и повторите сохранение.');
    }
    const primaryPlan = snapshot.plan_url
      ? isImageDataUrl(snapshot.plan_url)
        ? floorPlans['1'] ?? snapshot.plan_url
        : snapshot.plan_url
      : undefined;
    if (snapshot.floor_plans_supported !== false) serverSnapshot.floor_plans = floorPlans;
    else delete serverSnapshot.floor_plans;
    serverSnapshot.plan_url = primaryPlan;
    delete serverSnapshot.plan_display_url;
    delete serverSnapshot.floor_plan_display_urls;
    const { data, error } = await withTimeout<{ data: unknown; error: { message?: string; code?: string } | null }>(
      Promise.resolve(client.rpc('save_map_snapshot', { p_map_id: snapshot.id, p_snapshot: serverSnapshot })),
      30000,
      'Supabase не ответил за 30 секунд. Проверьте соединение, Auth-сессию и RPC save_map_snapshot.',
    );
    assertNoSupabaseError(error);
    if (!data) throw new Error('Сервер не подтвердил сохранение карты');
    const saved = {
      ...serverSnapshot,
      ...(data as Partial<OrganizerMap>),
      ...(snapshot.floor_plans_supported === false ? { floor_plans: snapshot.floor_plans } : {}),
      updated_at: now(),
    };
    const hydrated = await hydrateFloorPlans(client, saved);
    cacheMap(hydrated);
    return { map: hydrated, persisted: 'server', storageFallback };
  }
  // Demo mode: persist the complete aggregate with one storage write. The
  // editor does not call this until the organizer explicitly saves.
  const maps = read();
  const index = maps.findIndex((map) => map.id === snapshot.id);
  if (index < 0) throw new Error('Карта не найдена');
  const saved = { ...snapshot, updated_at: now() };
  maps[index] = saved;
  write(maps);
  return { map: saved, persisted: 'local' };
}
export async function savePoint(mapId: string, point: EditorPoint): Promise<void> { const maps = read().map((map) => map.id === mapId ? { ...map, points: map.points.some((item) => item.id === point.id) ? map.points.map((item) => item.id === point.id ? point : item) : [...map.points, point], updated_at: now() } : map); write(maps); }
export async function savePath(mapId: string, path: EditorPath): Promise<void> { const maps = read().map((map) => map.id === mapId ? { ...map, paths: map.paths.some((item) => item.id === path.id) ? map.paths.map((item) => item.id === path.id ? path : item) : [...map.paths, path], updated_at: now() } : map); write(maps); }
export async function removePath(mapId: string, pathId: string): Promise<void> { write(read().map((map) => map.id === mapId ? { ...map, paths: map.paths.filter((path) => path.id !== pathId), updated_at: now() } : map)); }
export async function setMapAccess(mapId: string, access: MapAccess): Promise<void> { await updateMap(mapId, { access }); }


