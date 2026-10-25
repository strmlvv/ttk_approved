import type { MapData, Poi, PoiCategory } from '../lib/api';
import { getMapBySlug, getPublishedMaps } from './maps';
import { getPoints } from './points';
import { findRoute as findGraphRoute } from '../navigation';
import { getPublishedMapBySlug as getDemoMap } from '../lib/api';
import { getSupabaseClient } from './client';
import { getSavedMapBySlug } from '../editor/repository';
import { getPanoramas } from './panoramas';
import floor0Plan from '../assets/floor-plans/floor-0.png';
import floor1Plan from '../assets/floor-plans/floor-1.png';
import floor2Plan from '../assets/floor-plans/floor-2.png';
import floor3Plan from '../assets/floor-plans/floor-3.png';
import type { ManualLayout } from '../types/manualLayout';

const parkOfflineFallback: MapData = {
  slug: 'torgovyy-centr-park',
  name: 'Торговый центр Парк',
  description: 'Интерактивная карта торгового центра',
  floorPlans: { '0': floor0Plan, '1': floor1Plan, '2': floor2Plan, '3': floor3Plan },
  planMode: 'saved',
  pois: [],
};

const normalizeFloorPlans = (value: unknown): Record<string, string> | undefined => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const entries = Object.entries(value).filter((entry): entry is [string, string] => typeof entry[1] === 'string' && entry[1].length > 0);
  return entries.length > 0 ? Object.fromEntries(entries) : undefined;
};
const normalizeManualLayouts = (value: unknown): Record<string, ManualLayout> | undefined => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const entries = Object.entries(value).filter((entry): entry is [string, ManualLayout] => Boolean(entry[1] && typeof entry[1] === 'object' && (entry[1] as ManualLayout).kind === 'manual'));
  return entries.length ? Object.fromEntries(entries) : undefined;
};
export async function getPublishedMapBySlug(slug: string): Promise<MapData | null> {
  let saved;
  try {
    saved = await getSavedMapBySlug(slug);
  } catch (error) {
    if (slug === parkOfflineFallback.slug) return parkOfflineFallback;
    throw error;
  }
  if (saved) {
    if (!getSupabaseClient() && (slug === 'central' || slug === 'demo') && !saved.plan_url && !saved.floor_plans) return getDemoMap(slug);
    if (!saved.is_published) return null;
    const pointCategories: Record<string, PoiCategory> = { hall: 'service', entrance: 'entrance', stand: 'shop', service: 'service', wifi: 'wifi', toilet: 'toilet', food: 'food', other: 'service' };
    const panoramas = getSupabaseClient() ? await getPanoramas(saved.id) : (saved.panoramas ?? []);
    const floorPlans = normalizeFloorPlans(saved.floor_plan_display_urls ?? saved.floor_plans);
    const manualLayouts = normalizeManualLayouts(saved.manual_layouts ?? saved.floor_plans);
    const imageUrl = saved.plan_display_url ?? saved.plan_url;
    return { slug: saved.slug, name: saved.name, description: 'Интерактивная навигация по пространству', imageUrl, floorPlans, manualLayouts, planModes: saved.plan_modes, pointFloors: saved.point_floors, planMode: imageUrl || floorPlans || manualLayouts ? 'saved' : 'empty', pois: saved.points.filter((point) => point.kind === 'poi').map((point) => ({ id: point.id, name: point.title, category: pointCategories[point.category] ?? 'service', description: point.description, x: point.x * 100, y: point.y * 100, floor: saved.point_floors?.[point.id] ? `${saved.point_floors[point.id]} этаж` : undefined, icon: point.icon, panoramaId: panoramas.find((item) => item.place_id === point.id)?.id })) };
  }
  if (!getSupabaseClient() && (slug === 'central' || slug === 'demo')) return getDemoMap(slug);
  return null;
}

export async function getPublicMapDirectory(): Promise<MapData[]> {
  const maps = await getPublishedMaps();
  return Promise.all(maps.map(async (map) => {
    const points = await getPoints(map.id);
    const pointCategories: Record<string, PoiCategory> = { hall: 'service', entrance: 'entrance', stand: 'shop', service: 'service', wifi: 'wifi', toilet: 'toilet', food: 'food', other: 'service' };
    const floorPlanMetadata = (map.floor_plans as Record<string, any> | undefined)?.__editor_metadata;
    const manualLayouts = normalizeManualLayouts(floorPlanMetadata?.manual_layouts ?? map.floor_plans);
    return {
      slug: map.slug,
      name: map.name,
      description: map.description,
      imageUrl: map.plan_url ?? undefined,
      planMode: map.plan_url || manualLayouts ? 'saved' : 'empty',
      manualLayouts,
      planModes: floorPlanMetadata?.plan_modes,
      pointFloors: floorPlanMetadata?.point_floors,
      pois: points.filter((point) => point.kind === 'poi').map((point) => ({
        id: point.id,
        name: point.title,
        category: pointCategories[point.category] ?? 'service',
        description: point.description,
        x: point.x * 100,
        y: point.y * 100,
        floor: floorPlanMetadata?.point_floors?.[point.id] ? `${floorPlanMetadata.point_floors[point.id]} этаж` : undefined,
        icon: point.icon ?? undefined,
      })),
    };
  }));
}

export type PublicPlaceRecord = Poi & {
  mapSlug: string;
  mapName: string;
};

export async function getPublicPlacesDirectory(): Promise<PublicPlaceRecord[]> {
  const maps = await getPublicMapDirectory();
  return maps.flatMap((map) => map.pois.map((poi) => ({
    ...poi,
    mapSlug: map.slug,
    mapName: map.name,
  })));
}

export async function findRoute(fromId: string, toId: string, map: MapData): Promise<{ distance: number; points: Array<{ x: number; y: number }> } | null> {
  const mapRecord = await getMapBySlug(map.slug);
  const result = await findGraphRoute(fromId, toId, mapRecord?.id ?? 'map-central');
  if (result.status === 'found') return { distance: Math.round(result.totalDistance * 170), points: result.points.map((point) => ({ x: point.x * 100, y: point.y * 100 })) };
  if (getSupabaseClient() || !['central', 'demo'].includes(map.slug)) return null;
  // Demo floor plans can use visitor-facing POI ids which differ from the
  // backend graph ids. Keep the demo usable by routing via the central lobby.
  const from = map.pois.find((point) => point.id === fromId);
  const to = map.pois.find((point) => point.id === toId);
  if (!from || !to || from.id === to.id) return null;
  const corridorY = from.y > 75 || to.y > 75 ? 69 : 42;
  const points = [{ x: from.x, y: from.y }, { x: from.x, y: corridorY }, { x: to.x, y: corridorY }, { x: to.x, y: to.y }];
  const distance = Math.round(points.slice(1).reduce((total, point, index) => total + Math.hypot(point.x - points[index].x, point.y - points[index].y), 0) * 2.1);
  return { distance, points };
}
export type { MapData, Poi, PoiCategory } from '../lib/api';


