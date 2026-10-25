import { assertNoSupabaseError, getSupabaseClient } from './client';
import { getCurrentOrganizer } from './auth';
export type PanoramaHotspotKind = 'poi' | 'transition' | 'info';
export type PanoramaHotspot = { id: string; panorama_id: string; kind: PanoramaHotspotKind; yaw: number; pitch: number; label: string; description?: string; poi_id?: string; target_panorama_id?: string; };
export type PanoramaRecord = { id: string; map_id: string; place_id: string; title: string; image_url: string; thumbnail_url?: string | null; x: number; y: number; initial_yaw: number; created_at: string; updated_at: string; hotspots: PanoramaHotspot[] };
export type CreatePanoramaInput = Pick<PanoramaRecord, 'map_id' | 'place_id' | 'title' | 'image_url' | 'x' | 'y'> & Partial<Pick<PanoramaRecord, 'thumbnail_url' | 'initial_yaw'>>;
const timestamp = '2026-10-24T10:00:00.000Z';
const mockPanoramas: PanoramaRecord[] = [
  { id: 'panorama-lobby', map_id: 'map-central', place_id: 'p-info', title: 'Главный холл', x: .12, y: .82, initial_yaw: 0, image_url: '', created_at: timestamp, updated_at: timestamp, hotspots: [{ id: 'hs-info', panorama_id: 'panorama-lobby', kind: 'poi', yaw: 18, pitch: -4, label: 'Инфоцентр', description: 'Поможем сориентироваться.', poi_id: 'p-info' }, { id: 'hs-lobby-food', panorama_id: 'panorama-lobby', kind: 'transition', yaw: 84, pitch: -6, label: 'К фуд-холлу', target_panorama_id: 'panorama-food' }] },
  { id: 'panorama-food', map_id: 'map-central', place_id: 'p-cafe', title: 'Фуд-холл', x: .72, y: .28, initial_yaw: -90, image_url: '', created_at: timestamp, updated_at: timestamp, hotspots: [{ id: 'hs-food-coffee', panorama_id: 'panorama-food', kind: 'poi', yaw: -20, pitch: -5, label: 'Кофейня', poi_id: 'p-coffee' }, { id: 'hs-food-lobby', panorama_id: 'panorama-food', kind: 'transition', yaw: 110, pitch: -6, label: 'Вернуться в холл', target_panorama_id: 'panorama-lobby' }] },
  { id: 'panorama-east', map_id: 'map-central', place_id: 'p-access', title: 'Восточная галерея', x: .90, y: .82, initial_yaw: 75, image_url: '', created_at: timestamp, updated_at: timestamp, hotspots: [{ id: 'hs-east-access', panorama_id: 'panorama-east', kind: 'poi', yaw: 15, pitch: -6, label: 'Доступный санузел', poi_id: 'p-access' }] },
];
const localPanoramas = structuredClone(mockPanoramas); const now = () => new Date().toISOString();
const cachedPanoramas = (mapId?: string): PanoramaRecord[] => {
  try {
    const raw = window.localStorage.getItem('ttk-organizer-maps-cache-v2') ?? window.localStorage.getItem('ttk-organizer-maps-v1');
    const maps = raw ? JSON.parse(raw) as Array<{ id: string; panoramas?: PanoramaRecord[] }> : [];
    return maps.filter((map) => !mapId || map.id === mapId).flatMap((map) => map.panoramas ?? []);
  } catch {
    return [];
  }
};
const normalize = (item: any): PanoramaRecord => ({ ...item, place_id: item.place_id ?? item.poi_id ?? item.point_id, hotspots: item.panorama_hotspots ?? item.hotspots ?? [] });
const panoramaWithHotspotsSelect = '*, panorama_hotspots!panorama_hotspots_panorama_id_fkey(*)';
const PANORAMA_BUCKET = 'map-floor-plans';
const STORAGE_PREFIX = `storage://${PANORAMA_BUCKET}/`;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export async function inspectPanoramaImage(file: Blob): Promise<{ validAspect: boolean; hasEquirectangularMetadata: boolean }> {
  const bitmap = await createImageBitmap(file);
  const ratio = bitmap.width / bitmap.height;
  bitmap.close();
  const bytes = new Uint8Array(await file.slice(0, 4 * 1024 * 1024).arrayBuffer());
  const text = new TextDecoder().decode(bytes);
  const hasEquirectangularMetadata = /(?:ProjectionType|projectiontype)[\s"=:>]+(?:["']?)(equirectangular)/i.test(text);
  return { validAspect: ratio >= 1.95 && ratio <= 2.05, hasEquirectangularMetadata };
}
const readableImageUrl = async (imageUrl: string, client: NonNullable<ReturnType<typeof getSupabaseClient>>) => {
  if (!imageUrl.startsWith(STORAGE_PREFIX)) return imageUrl;
  const { data, error } = await client.storage.from(PANORAMA_BUCKET).createSignedUrl(imageUrl.slice(STORAGE_PREFIX.length), 60 * 60);
  assertNoSupabaseError(error);
  if (!data?.signedUrl) throw new Error('Не удалось получить временную ссылку на панораму');
  return data.signedUrl;
};
export async function getPanoramaDisplayUrl(imageUrl: string): Promise<string> {
  const client = getSupabaseClient();
  return client ? readableImageUrl(imageUrl, client) : imageUrl;
}
const hydratePanorama = async (value: any, client: NonNullable<ReturnType<typeof getSupabaseClient>>): Promise<PanoramaRecord> => {
  const item = normalize(value);
  return { ...item, image_url: await readableImageUrl(item.image_url, client) };
};
export async function getPanoramas(mapId: string): Promise<PanoramaRecord[]> { const client = getSupabaseClient(); if (!client) return cachedPanoramas(mapId).length ? cachedPanoramas(mapId) : localPanoramas.filter((item) => item.map_id === mapId); const { data, error } = await client.from('panoramas').select(panoramaWithHotspotsSelect).eq('map_id', mapId).order('created_at'); assertNoSupabaseError(error); return Promise.all((data ?? []).map((item) => hydratePanorama(item, client))); }
export async function getPanoramaById(id: string): Promise<PanoramaRecord | null> { const client = getSupabaseClient(); if (!client) return cachedPanoramas().find((item) => item.id === id) ?? localPanoramas.find((item) => item.id === id) ?? null; const { data, error } = await client.from('panoramas').select(panoramaWithHotspotsSelect).eq('id', id).maybeSingle(); assertNoSupabaseError(error); return data ? hydratePanorama(data, client) : null; }
export async function getPanoramaByPlaceId(placeId: string): Promise<PanoramaRecord | null> {
  const client = getSupabaseClient();
  if (!client) {
    try {
      const raw = window.localStorage.getItem('ttk-organizer-maps-cache-v2') ?? window.localStorage.getItem('ttk-organizer-maps-v1');
      const maps = raw ? JSON.parse(raw) as Array<{ panoramas?: Array<{ id: string; place_id: string; title: string; image_url: string }> }> : [];
      const saved = maps.flatMap((map) => map.panoramas ?? []).find((item) => item.place_id === placeId);
      if (saved) return { ...saved, map_id: 'map-central', x: .5, y: .5, initial_yaw: 0, created_at: timestamp, updated_at: timestamp, hotspots: [] };
    } catch {
      // Fall through to the bundled demo panoramas.
    }
    return localPanoramas.find((item) => item.place_id === placeId) ?? null;
  }
  try {
    const { data, error } = await client.from('panoramas').select(panoramaWithHotspotsSelect).eq('place_id', placeId).maybeSingle();
    assertNoSupabaseError(error);
    return data ? hydratePanorama(data, client) : null;
  } catch (error) {
    return cachedPanoramas().find((item) => item.place_id === placeId) ?? null;
  }
}
export async function replacePanoramaForPlace(input: CreatePanoramaInput & { file?: Blob; confirmedEquirectangular?: boolean }): Promise<PanoramaRecord> {
  if (!input.place_id) throw new Error('Панорама должна быть привязана к помещению');
  if (input.x < 0 || input.x > 1 || input.y < 0 || input.y > 1) throw new Error('Координаты панорамы должны быть в диапазоне от 0 до 1');
  const client = getSupabaseClient();
  if (!client) throw new Error('Для сохранения панорамы требуется подключение к Supabase Storage.');

  let imageUrl = input.image_url;
  if (input.file) {
    await assertEquirectangularPanorama(input.file, input.confirmedEquirectangular === true);
    if (!UUID_PATTERN.test(input.map_id) || !UUID_PATTERN.test(input.place_id)) throw new Error('Сначала сохраните карту и помещение в Supabase, затем загрузите панораму.');
    const { data: sessionData, error: sessionError } = await client.auth.getSession();
    if (sessionError) throw new Error(`Не удалось проверить сессию перед загрузкой панорамы: ${sessionError.message}`);
    const user = sessionData.session?.user ?? await getCurrentOrganizer();
    if (!user) throw new Error('Сессия Supabase отсутствует или истекла. Войдите в кабинет организатора заново.');
    const { data: mapRow, error: mapError } = await client.from('maps').select('id, owner_id').eq('id', input.map_id).maybeSingle();
    assertNoSupabaseError(mapError);
    if (!mapRow || mapRow.owner_id !== user.id) throw new Error('Текущий пользователь не является владельцем этой карты.');

    const png = input.file.type === 'image/png' ? input.file : await convertToPng(input.file);
    if (png.size > 20 * 1024 * 1024) throw new Error('Панорама после подготовки превышает лимит приватного bucket (20 МБ). Уменьшите разрешение изображения или настройте допустимый размер bucket.');
    const objectPath = `${input.map_id}/panoramas/${input.place_id}.png`;
    const { error: uploadError } = await client.storage.from(PANORAMA_BUCKET).upload(objectPath, png, {
      contentType: 'image/png',
      cacheControl: '3600',
      upsert: true,
    });
    if (uploadError) throw new Error(`Storage upload не выполнен. bucket=${PANORAMA_BUCKET}; path=${objectPath}; ответ Supabase: ${uploadError.message}${uploadError.statusCode ? `; status=${uploadError.statusCode}` : ''}`);
    imageUrl = `${STORAGE_PREFIX}${objectPath}`;
  }

  if (!imageUrl || imageUrl.startsWith('blob:')) throw new Error('Сначала выберите файл панорамы для загрузки.');
  const { file: _file, confirmedEquirectangular: _confirmedEquirectangular, ...row } = input;
  const { data, error } = await client.from('panoramas').upsert({ ...row, image_url: imageUrl }, { onConflict: 'place_id' }).select(panoramaWithHotspotsSelect).single();
  assertNoSupabaseError(error);
  return normalize(data);
}

async function assertEquirectangularPanorama(file: Blob, confirmed: boolean): Promise<void> {
  const info = await inspectPanoramaImage(file);
  if (!info.validAspect) throw new Error('Файл не является полным equirectangular-кадром 2:1. Обычная фотография не будет растянута до 360°.');
  if (!info.hasEquirectangularMetadata && !confirmed) {
    throw new Error('В файле нет GPano/XMP-подтверждения. Подтвердите в редакторе, что это именно полный equirectangular экспорт 360°.');
  }
}

async function convertToPng(file: Blob): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  try {
    const maxWidth = 8192;
    const scale = Math.min(1, maxWidth / bitmap.width);
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Браузер не смог обработать изображение панорамы.');
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    return await new Promise((resolve, reject) => canvas.toBlob((result) => result ? resolve(result) : reject(new Error('Не удалось подготовить PNG панорамы.')), 'image/png'));
  } finally {
    bitmap.close();
  }
}
export async function createPanorama(input: CreatePanoramaInput): Promise<PanoramaRecord> { return replacePanoramaForPlace(input); }
export async function updatePanorama(id: string, patch: Partial<CreatePanoramaInput>): Promise<PanoramaRecord> { const client = getSupabaseClient(); if (!client) { const index = localPanoramas.findIndex((item) => item.id === id); if (index < 0) throw new Error('Панорама не найдена'); if (patch.place_id && localPanoramas.some((item, itemIndex) => itemIndex !== index && item.place_id === patch.place_id)) throw new Error('Для этого помещения уже есть панорама'); localPanoramas[index] = { ...localPanoramas[index], ...patch, updated_at: now() }; return localPanoramas[index]; } const { data, error } = await client.from('panoramas').update(patch).eq('id', id).select(panoramaWithHotspotsSelect).single(); assertNoSupabaseError(error); return normalize(data); }
export async function deletePanorama(id: string): Promise<void> { const client = getSupabaseClient(); if (!client) { const index = localPanoramas.findIndex((item) => item.id === id); if (index >= 0) localPanoramas.splice(index, 1); return; } const { error } = await client.from('panoramas').delete().eq('id', id); assertNoSupabaseError(error); }
export async function upsertPanoramaHotspot(hotspot: Omit<PanoramaHotspot, 'id'> & { id?: string }): Promise<PanoramaHotspot> { const client = getSupabaseClient(); if (!client) { const panorama = localPanoramas.find((item) => item.id === hotspot.panorama_id); if (!panorama) throw new Error('Панорама не найдена'); const next = { ...hotspot, id: hotspot.id ?? `hotspot-${Date.now()}` }; panorama.hotspots = hotspot.id ? panorama.hotspots.map((item) => item.id === hotspot.id ? next : item) : [...panorama.hotspots, next]; return next; } const { data, error } = await client.from('panorama_hotspots').upsert(hotspot).select('*').single(); assertNoSupabaseError(error); if (!data) throw new Error('Supabase не вернул сохранённую hotspot-запись'); return data as unknown as PanoramaHotspot; }
export async function optimizePanoramaImage(file: File, maxWidth = 4096, quality = .82): Promise<Blob> { if (!file.type.startsWith('image/')) throw new Error('Можно загрузить только изображение панорамы'); const bitmap = await createImageBitmap(file); const scale = Math.min(1, maxWidth / bitmap.width); const canvas = document.createElement('canvas'); canvas.width = Math.round(bitmap.width * scale); canvas.height = Math.round(bitmap.height * scale); canvas.getContext('2d')?.drawImage(bitmap, 0, 0, canvas.width, canvas.height); return await new Promise((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('Не удалось сжать изображение')), 'image/jpeg', quality)); }
