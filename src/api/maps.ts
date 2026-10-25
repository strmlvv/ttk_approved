import { getSupabaseClient, assertNoSupabaseError } from './client';
import { mockMaps, mockOrganizer } from '../mocks/mockData';
import { getCurrentOrganizer } from './auth';
import type { CreateMapInput, MapRecord, UpdateMapInput } from '../types';

const localMaps = [...mockMaps];
const now = () => new Date().toISOString();
const readCachedMaps = (): MapRecord[] => {
  try {
    const raw = window.localStorage.getItem('ttk-organizer-maps-cache-v2') ?? window.localStorage.getItem('ttk-organizer-maps-v1');
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
};
const slug = (name: string) => name.toLowerCase().replace(/[^a-z0-9\s-]/g, '').trim().replace(/\s+/g, '-') || `map-${Date.now()}`;
export async function getMaps(): Promise<MapRecord[]> { const client = getSupabaseClient(); if (!client) return localMaps.filter((map) => map.owner_id === mockOrganizer.id); const user = await getCurrentOrganizer(); if (!user) throw new Error('Требуется авторизация организатора'); const { data, error } = await client.from('maps').select('*').eq('owner_id', user.id).order('created_at', { ascending: false }); assertNoSupabaseError(error); return data as MapRecord[]; }
export async function getMapBySlug(mapSlug: string): Promise<MapRecord | null> { const client = getSupabaseClient(); if (!client) return localMaps.find((map) => map.slug === mapSlug && map.is_published && map.access === 'public') ?? null; const { data, error } = await client.from('maps').select('*').eq('slug', mapSlug).eq('is_published', true).eq('access', 'public').maybeSingle(); assertNoSupabaseError(error); return (data as MapRecord | null) ?? null; }
export async function getPublishedMaps(): Promise<MapRecord[]> {
  const client = getSupabaseClient();
  if (!client) return localMaps.filter((map) => map.is_published && map.access === 'public');
  try {
    const { data, error } = await Promise.race([
      client.from('maps').select('*').eq('is_published', true).eq('access', 'public').order('updated_at', { ascending: false }),
      new Promise<never>((_, reject) => window.setTimeout(() => reject(new Error('Supabase не ответил при загрузке каталога карт')), 15000)),
    ]);
    assertNoSupabaseError(error);
    return (data ?? []) as MapRecord[];
  } catch (error) {
    const cached = readCachedMaps().filter((map) => map.is_published && map.access === 'public');
    if (cached.length) return cached;
    throw error;
  }
}
export async function createMap(input: CreateMapInput): Promise<MapRecord> { const client = getSupabaseClient(); const data = { ...input, slug: input.slug || slug(input.name), owner_id: mockOrganizer.id, is_published: input.is_published ?? false }; if (!client) { const map = { ...data, id: `map-${Date.now()}`, description: data.description || '', created_at: now(), updated_at: now() } as MapRecord; localMaps.unshift(map); return map; } const user = await getCurrentOrganizer(); if (!user) throw new Error('Требуется авторизация организатора'); const { data: created, error } = await client.from('maps').insert({ ...input, slug: data.slug, is_published: data.is_published, owner_id: user.id }).select('*').single(); assertNoSupabaseError(error); if (!created) throw new Error('Сервер не вернул созданную карту'); return created as MapRecord; }
export async function updateMap(id: string, patch: UpdateMapInput): Promise<MapRecord> { const client = getSupabaseClient(); if (!client) { const index = localMaps.findIndex((map) => map.id === id && map.owner_id === mockOrganizer.id); if (index < 0) throw new Error('Карта не найдена или нет прав'); localMaps[index] = { ...localMaps[index], ...patch, updated_at: now() }; return localMaps[index]; } const { data, error } = await client.from('maps').update(patch).eq('id', id).select('*').single(); assertNoSupabaseError(error); if (!data) throw new Error('Карта не найдена или нет прав'); return data as MapRecord; }
export async function deleteMap(id: string): Promise<void> { const client = getSupabaseClient(); if (!client) { const index = localMaps.findIndex((map) => map.id === id && map.owner_id === mockOrganizer.id); if (index < 0) throw new Error('Карта не найдена или нет прав'); localMaps.splice(index, 1); return; } const { error, count } = await client.from('maps').delete({ count: 'exact' }).eq('id', id); assertNoSupabaseError(error); if (count === 0) throw new Error('Карта не найдена или нет прав'); }
