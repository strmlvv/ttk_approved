export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];
type Table<Row, Insert, Update> = { Row: Row; Insert: Insert; Update: Update; Relationships: [] };
export interface Database {
  public: {
    Tables: {
      maps: Table<{ id: string; owner_id: string; name: string; slug: string; description: string; access: 'public' | 'password'; is_published: boolean; plan_url: string | null; floor_plans: Json; created_at: string; updated_at: string }, { id?: string; owner_id?: string; name: string; slug: string; description?: string; access?: 'public' | 'password'; is_published?: boolean; plan_url?: string | null; floor_plans?: Json; created_at?: string; updated_at?: string }, Partial<{ owner_id: string; name: string; slug: string; description: string; access: 'public' | 'password'; is_published: boolean; plan_url: string | null; floor_plans: Json }>>;
      points: Table<{ id: string; map_id: string; kind: 'poi' | 'node'; category: 'hall' | 'entrance' | 'stand' | 'service' | 'wifi' | 'toilet' | 'food' | 'other'; icon: string | null; title: string; description: string; x: number; y: number; created_at: string; updated_at: string }, { id?: string; map_id: string; kind: 'poi' | 'node'; category: 'hall' | 'entrance' | 'stand' | 'service' | 'wifi' | 'toilet' | 'food' | 'other'; icon?: string | null; title: string; description: string; x: number; y: number; created_at?: string; updated_at?: string }, Partial<{ map_id: string; kind: 'poi' | 'node'; category: 'hall' | 'entrance' | 'stand' | 'service' | 'wifi' | 'toilet' | 'food' | 'other'; icon: string | null; title: string; description: string; x: number; y: number }>>;
      paths: Table<{ id: string; map_id: string; from_point_id: string; to_point_id: string; weight: number | null; created_at: string; updated_at: string }, { id?: string; map_id: string; from_point_id: string; to_point_id: string; weight?: number | null; created_at?: string; updated_at?: string }, Partial<{ map_id: string; from_point_id: string; to_point_id: string; weight: number | null }>>;
      panoramas: Table<{ id: string; map_id: string; place_id: string; title: string; image_url: string; thumbnail_url: string | null; x: number; y: number; initial_yaw: number; created_at: string; updated_at: string }, { id?: string; map_id: string; place_id: string; title: string; image_url: string; thumbnail_url?: string | null; x: number; y: number; initial_yaw?: number; created_at?: string; updated_at?: string }, Partial<{ map_id: string; place_id: string; title: string; image_url: string; thumbnail_url: string | null; x: number; y: number; initial_yaw: number }>>;
      panorama_hotspots: Table<{ id: string; panorama_id: string; kind: 'poi' | 'transition' | 'info'; yaw: number; pitch: number; label: string; description: string | null; poi_id: string | null; target_panorama_id: string | null; created_at: string; updated_at: string }, { id?: string; panorama_id: string; kind: 'poi' | 'transition' | 'info'; yaw: number; pitch: number; label: string; description?: string | null; poi_id?: string | null; target_panorama_id?: string | null; created_at?: string; updated_at?: string }, Partial<{ panorama_id: string; kind: 'poi' | 'transition' | 'info'; yaw: number; pitch: number; label: string; description: string | null; poi_id: string | null; target_panorama_id: string | null }>>;
    };
    Views: {};
    Functions: { save_map_snapshot: { Args: { p_map_id: string; p_snapshot: Json }; Returns: Json } };
    Enums: {};
    CompositeTypes: {};
  };
}
export type Tables<T extends keyof Database['public']['Tables']> = Database['public']['Tables'][T]['Row'];
export type TablesInsert<T extends keyof Database['public']['Tables']> = Database['public']['Tables'][T]['Insert'];
export type TablesUpdate<T extends keyof Database['public']['Tables']> = Database['public']['Tables'][T]['Update'];
