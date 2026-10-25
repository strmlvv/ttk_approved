import type { ReactNode } from 'react';
import type { FloorPlanValue, ManualLayout, ManualLayoutElement, ManualLayoutElementType } from '../types/manualLayout';
export type { FloorPlanValue, ManualLayout, ManualLayoutElement, ManualLayoutElementType };

export type MapAccess = 'public' | 'password';
export type EditorPointKind = 'poi' | 'node';
export type EditorCategory = 'hall' | 'entrance' | 'stand' | 'service' | 'wifi' | 'toilet' | 'food' | 'other';
export type EditorPoint = { id: string; kind: EditorPointKind; category: EditorCategory; icon?: string; title: string; description: string; x: number; y: number; };
export type EditorPath = { id: string; from_id: string; to_id: string; };
export type EditorPanorama = { id: string; place_id: string; image_url: string; image_display_url?: string; title: string; hotspots?: EditorPanoramaHotspot[]; };
export type EditorPanoramaHotspot = { id: string; panorama_id: string; kind: 'poi' | 'transition' | 'info'; yaw: number; pitch: number; label: string; description?: string; poi_id?: string; target_panorama_id?: string; };
export type OrganizerMap = { id: string; name: string; slug: string; access: MapAccess; is_published: boolean; plan_url?: string; floor_plans?: Record<string, FloorPlanValue>; manual_layouts?: Record<string, ManualLayout>; plan_modes?: Record<string, 'image' | 'manual'>; point_floors?: Record<string, string>; floor_plans_supported?: boolean; plan_display_url?: string; floor_plan_display_urls?: Record<string, string>; created_at: string; updated_at: string; points: EditorPoint[]; paths: EditorPath[]; panoramas?: EditorPanorama[]; panorama_hotspots?: EditorPanoramaHotspot[]; };
export type EditorAction = (children: ReactNode) => ReactNode;

export const editorCategories: Array<{ value: EditorCategory; label: string }> = [
  { value: 'hall', label: 'Зал' }, { value: 'entrance', label: 'Вход' }, { value: 'stand', label: 'Стенд' }, { value: 'service', label: 'Стойка' },
  { value: 'wifi', label: 'Wi-Fi' }, { value: 'toilet', label: 'Туалет' }, { value: 'food', label: 'Еда' }, { value: 'other', label: 'Другое' },
];
export const categoryLabel = (value: EditorCategory) => editorCategories.find((category) => category.value === value)?.label ?? 'Другое';
