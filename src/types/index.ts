export type UUID = string;
import type { Tables, TablesInsert, TablesUpdate } from '../api/database.types';
export type Organizer = { id: string; email: string; display_name?: string };
export type MapRecord = Tables<'maps'>;
export type PointRecord = Tables<'points'>;
export type PathRecord = Tables<'paths'>;
export type CreateMapInput = Pick<TablesInsert<'maps'>, 'name' | 'slug' | 'description' | 'access'> & Partial<Pick<TablesInsert<'maps'>, 'is_published' | 'plan_url'>>;
export type UpdateMapInput = Partial<Pick<TablesUpdate<'maps'>, 'name' | 'slug' | 'description' | 'access' | 'is_published' | 'plan_url'>>;
export type CreatePointInput = Pick<TablesInsert<'points'>, 'map_id' | 'kind' | 'category' | 'title' | 'description' | 'x' | 'y'> & Partial<Pick<TablesInsert<'points'>, 'icon'>>;
export type UpdatePointInput = Partial<Omit<CreatePointInput, 'map_id'>>;
export type CreatePathInput = Pick<TablesInsert<'paths'>, 'map_id' | 'from_point_id' | 'to_point_id'> & Partial<Pick<TablesInsert<'paths'>, 'weight'>>;
export type UpdatePathInput = Partial<Pick<TablesUpdate<'paths'>, 'from_point_id' | 'to_point_id' | 'weight'>>;
export type MapWithGraph = MapRecord & { points: PointRecord[]; paths: PathRecord[] };
export type RouteResult = { status: 'found'; pointIds: string[]; points: PointRecord[]; totalDistance: number } | { status: 'not_found' | 'invalid_point'; pointIds: []; points: []; totalDistance: 0; message: string };

