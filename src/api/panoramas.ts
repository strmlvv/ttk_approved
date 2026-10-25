import { assertNoSupabaseError, getSupabaseClient } from './client';
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
export async function getPanoramas(mapId: string): Promise<PanoramaRecord[]> { const client = getSupabaseClient(); if (!client) return cachedPanoramas(mapId).length ? cachedPanoramas(mapId) : localPanoramas.filter((item) => item.map_id === mapId); try { const { data, error } = await client.from('panoramas').select(panoramaWithHotspotsSelect).eq('map_id', mapId).order('created_at'); assertNoSupabaseError(error); return (data ?? []).map(normalize); } catch (error) { const cached = cachedPanoramas(mapId); if (cached.length) return cached; throw error; } }
export async function getPanoramaById(id: string): Promise<PanoramaRecord | null> { const client = getSupabaseClient(); if (!client) return cachedPanoramas().find((item) => item.id === id) ?? localPanoramas.find((item) => item.id === id) ?? null; try { const { data, error } = await client.from('panoramas').select(panoramaWithHotspotsSelect).eq('id', id).maybeSingle(); assertNoSupabaseError(error); return data ? normalize(data) : null; } catch (error) { return cachedPanoramas().find((item) => item.id === id) ?? null; } }
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
    return data ? normalize(data) : null;
  } catch (error) {
    return cachedPanoramas().find((item) => item.place_id === placeId) ?? null;
  }
}
export async function replacePanoramaForPlace(input: CreatePanoramaInput): Promise<PanoramaRecord> { if (!input.place_id) throw new Error('Панорама должна быть привязана к помещению'); if (input.x < 0 || input.x > 1 || input.y < 0 || input.y > 1) throw new Error('Координаты панорамы должны быть в диапазоне от 0 до 1'); const client = getSupabaseClient(); if (!client) { const index = localPanoramas.findIndex((item) => item.place_id === input.place_id); if (index >= 0) { localPanoramas[index] = { ...localPanoramas[index], ...input, updated_at: now() }; return localPanoramas[index]; } const panorama: PanoramaRecord = { id: `panorama-${Date.now()}`, initial_yaw: 0, thumbnail_url: null, ...input, created_at: now(), updated_at: now(), hotspots: [] }; localPanoramas.push(panorama); return panorama; } const { data, error } = await client.from('panoramas').upsert(input, { onConflict: 'place_id' }).select(panoramaWithHotspotsSelect).single(); assertNoSupabaseError(error); return normalize(data); }
export async function createPanorama(input: CreatePanoramaInput): Promise<PanoramaRecord> { return replacePanoramaForPlace(input); }
export async function updatePanorama(id: string, patch: Partial<CreatePanoramaInput>): Promise<PanoramaRecord> { const client = getSupabaseClient(); if (!client) { const index = localPanoramas.findIndex((item) => item.id === id); if (index < 0) throw new Error('Панорама не найдена'); if (patch.place_id && localPanoramas.some((item, itemIndex) => itemIndex !== index && item.place_id === patch.place_id)) throw new Error('Для этого помещения уже есть панорама'); localPanoramas[index] = { ...localPanoramas[index], ...patch, updated_at: now() }; return localPanoramas[index]; } const { data, error } = await client.from('panoramas').update(patch).eq('id', id).select(panoramaWithHotspotsSelect).single(); assertNoSupabaseError(error); return normalize(data); }
export async function deletePanorama(id: string): Promise<void> { const client = getSupabaseClient(); if (!client) { const index = localPanoramas.findIndex((item) => item.id === id); if (index >= 0) localPanoramas.splice(index, 1); return; } const { error } = await client.from('panoramas').delete().eq('id', id); assertNoSupabaseError(error); }
export async function upsertPanoramaHotspot(hotspot: Omit<PanoramaHotspot, 'id'> & { id?: string }): Promise<PanoramaHotspot> { const client = getSupabaseClient(); if (!client) { const panorama = localPanoramas.find((item) => item.id === hotspot.panorama_id); if (!panorama) throw new Error('Панорама не найдена'); const next = { ...hotspot, id: hotspot.id ?? `hotspot-${Date.now()}` }; panorama.hotspots = hotspot.id ? panorama.hotspots.map((item) => item.id === hotspot.id ? next : item) : [...panorama.hotspots, next]; return next; } const { data, error } = await client.from('panorama_hotspots').upsert(hotspot).select('*').single(); assertNoSupabaseError(error); if (!data) throw new Error('Supabase не вернул сохранённую hotspot-запись'); return data as unknown as PanoramaHotspot; }
export async function optimizePanoramaImage(file: File, maxWidth = 4096, quality = .82): Promise<Blob> { if (!file.type.startsWith('image/')) throw new Error('Можно загрузить только изображение панорамы'); const bitmap = await createImageBitmap(file); const scale = Math.min(1, maxWidth / bitmap.width); const canvas = document.createElement('canvas'); canvas.width = Math.round(bitmap.width * scale); canvas.height = Math.round(bitmap.height * scale); canvas.getContext('2d')?.drawImage(bitmap, 0, 0, canvas.width, canvas.height); return await new Promise((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('Не удалось сжать изображение')), 'image/jpeg', quality)); }
