export type ManualLayoutElementType = 'room' | 'rectangle' | 'wall' | 'passage' | 'text';
export type ManualLayoutElement = {
  id: string;
  type: ManualLayoutElementType;
  x: number;
  y: number;
  width: number;
  height: number;
  color: string;
  label: string;
};
export type ManualLayout = {
  kind: 'manual';
  width: number;
  height: number;
  background: string;
  elements: ManualLayoutElement[];
  pointIds?: string[];
};
export type FloorPlanMetadata = { kind: 'editor-metadata'; point_floors: Record<string, string>; manual_layouts: Record<string, ManualLayout>; plan_modes: Record<string, 'image' | 'manual'> };
export type FloorPlanValue = string | ManualLayout | FloorPlanMetadata;
