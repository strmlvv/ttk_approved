import { useRef, useState, type PointerEvent } from 'react';
import type { EditorPoint, ManualLayout, ManualLayoutElement, ManualLayoutElementType } from './types';

export type ManualTool = 'select' | ManualLayoutElementType | 'poi';
type ViewBox = { x: number; y: number; width: number; height: number };
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
const makeId = () => crypto.randomUUID?.() ?? `layout-${Date.now()}-${Math.random().toString(16).slice(2)}`;

export function ManualPlanCanvas({
  layout, points, pointFloors, floor, selectedElementId, selectedPointId, tool,
  onToolChange, onLayoutChange, onSelectElement, onSelectPoint, onCreatePoint, onPointMove, onPointFloor,
}: {
  layout: ManualLayout;
  points: EditorPoint[];
  pointFloors: Record<string, string>;
  floor: string;
  selectedElementId: string | null;
  selectedPointId: string | null;
  tool: ManualTool;
  onToolChange: (tool: ManualTool) => void;
  onLayoutChange: (layout: ManualLayout) => void;
  onSelectElement: (element: ManualLayoutElement | null) => void;
  onSelectPoint: (point: EditorPoint) => void;
  onCreatePoint: (x: number, y: number) => void;
  onPointMove: (point: EditorPoint, x: number, y: number) => void;
  onPointFloor: (point: EditorPoint, floor: string) => void;
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const gestureRef = useRef<{ mode: 'draw' | 'move' | 'resize' | 'pan' | 'point'; id?: string; pointer: { x: number; y: number }; initial?: ManualLayoutElement; view?: ViewBox; point?: EditorPoint } | null>(null);
  const [viewBox, setViewBox] = useState<ViewBox>({ x: 0, y: 0, width: layout.width, height: layout.height });
  const point = (event: { clientX: number; clientY: number }) => {
    const svg = svgRef.current;
    const matrix = svg?.getScreenCTM();
    if (!svg || !matrix) return { x: 0, y: 0 };
    const local = svg.createSVGPoint();
    local.x = event.clientX;
    local.y = event.clientY;
    const transformed = local.matrixTransform(matrix.inverse());
    return { x: transformed.x, y: transformed.y };
  };
  const updateElement = (id: string, patch: Partial<ManualLayoutElement>) => onLayoutChange({
    ...layout,
    elements: layout.elements.map((item) => item.id === id ? { ...item, ...patch } : item),
  });
  const start = (event: PointerEvent<SVGElement>, mode: NonNullable<typeof gestureRef.current>['mode'], extras: Partial<NonNullable<typeof gestureRef.current>> = {}) => {
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    gestureRef.current = { mode, pointer: point(event), ...extras };
  };
  const onPointerMove = (event: PointerEvent<SVGSVGElement>) => {
    const gesture = gestureRef.current;
    if (!gesture) return;
    const current = point(event);
    const dx = current.x - gesture.pointer.x;
    const dy = current.y - gesture.pointer.y;
    if (gesture.mode === 'draw' && gesture.id) {
      const x = Math.min(gesture.pointer.x, current.x);
      const y = Math.min(gesture.pointer.y, current.y);
      updateElement(gesture.id, { x, y, width: Math.abs(dx), height: Math.abs(dy) });
    } else if ((gesture.mode === 'move' || gesture.mode === 'resize') && gesture.id && gesture.initial) {
      updateElement(gesture.id, gesture.mode === 'move'
        ? { x: gesture.initial.x + dx, y: gesture.initial.y + dy }
        : { width: Math.max(24, gesture.initial.width + dx), height: Math.max(24, gesture.initial.height + dy) });
    } else if (gesture.mode === 'point' && gesture.point) {
      onPointMove(gesture.point, clamp((gesture.point.x * layout.width + dx) / layout.width, 0, 1), clamp((gesture.point.y * layout.height + dy) / layout.height, 0, 1));
    } else if (gesture.mode === 'pan' && gesture.view) {
      const rect = svgRef.current?.getBoundingClientRect();
      if (!rect) return;
      setViewBox({ ...gesture.view, x: gesture.view.x - dx * gesture.view.width / rect.width, y: gesture.view.y - dy * gesture.view.height / rect.height });
    }
  };
  const end = () => { gestureRef.current = null; };
  const onBlankDown = (event: PointerEvent<SVGRectElement>) => {
    const pos = point(event);
    if (tool === 'poi') {
      onCreatePoint(clamp(pos.x / layout.width, 0, 1), clamp(pos.y / layout.height, 0, 1));
      return;
    }
    if (tool === 'select') {
      start(event, 'pan', { view: viewBox });
      return;
    }
    if (tool === 'text' || tool === 'room' || tool === 'rectangle' || tool === 'wall' || tool === 'passage') {
      const element: ManualLayoutElement = {
        id: makeId(), type: tool, x: pos.x, y: pos.y,
        width: tool === 'text' ? 160 : 4, height: tool === 'text' ? 42 : 4,
        color: tool === 'wall' ? '#334155' : tool === 'passage' ? '#86efac' : tool === 'text' ? '#1a1a1a' : '#dbeafe',
        label: tool === 'text' ? 'Подпись' : tool === 'room' ? 'Новое помещение' : tool === 'passage' ? 'Проход' : '',
      };
      onLayoutChange({ ...layout, elements: [...layout.elements, element] });
      onSelectElement(element);
      start(event, 'draw', { id: element.id });
    }
  };
  const onWheel = (event: React.WheelEvent<SVGSVGElement>) => {
    event.preventDefault();
    const at = point(event);
    const factor = event.deltaY > 0 ? 1.12 : .89;
    setViewBox((current) => {
      const width = clamp(current.width * factor, layout.width * .25, layout.width * 2.5);
      const height = clamp(current.height * factor, layout.height * .25, layout.height * 2.5);
      const ratio = width / current.width;
      return { x: at.x - (at.x - current.x) * ratio, y: at.y - (at.y - current.y) * ratio, width, height };
    });
  };
  const floorPoints = points.filter((item) => (pointFloors[item.id] ?? '1') === floor);

  return <div className="overflow-hidden rounded-3xl border border-slate-200 bg-slate-100 shadow-inner">
    <svg ref={svgRef} viewBox={`${viewBox.x} ${viewBox.y} ${viewBox.width} ${viewBox.height}`} className="block h-[min(68vh,720px)] min-h-[440px] w-full touch-none select-none" onPointerMove={onPointerMove} onPointerUp={end} onPointerCancel={end} onWheel={onWheel} role="application" aria-label={`Ручной план этажа ${floor}`}>
      <rect x={-layout.width * 4} y={-layout.height * 4} width={layout.width * 9} height={layout.height * 9} fill="#e5e7eb" />
      <rect x="0" y="0" width={layout.width} height={layout.height} rx="10" fill={layout.background} stroke="#cbd5e1" strokeWidth={2} onPointerDown={onBlankDown} />
      <defs><pattern id="manual-grid" width="24" height="24" patternUnits="userSpaceOnUse"><path d="M 24 0 L 0 0 0 24" fill="none" stroke="#64748b" strokeOpacity=".12" strokeWidth="1"/></pattern></defs>
      <rect x="0" y="0" width={layout.width} height={layout.height} fill="url(#manual-grid)" pointerEvents="none" />
      {layout.elements.map((item) => {
        const selected = item.id === selectedElementId;
        const common = {
          x: item.x, y: item.y, width: Math.max(item.width, item.type === 'wall' ? 4 : 1), height: Math.max(item.height, item.type === 'wall' ? 4 : 1),
          fill: item.type === 'wall' ? item.color : item.type === 'passage' ? `${item.color}99` : `${item.color}cc`,
          stroke: selected ? '#e30613' : item.type === 'wall' ? item.color : '#475569',
          strokeWidth: selected ? 4 : item.type === 'wall' ? 8 : 2,
          rx: item.type === 'room' ? 12 : 2,
          onPointerDown: (event: PointerEvent<SVGElement>) => {
            onSelectElement(item);
            start(event, 'move', { id: item.id, initial: item });
          },
        };
        return <g key={item.id} className="cursor-move">
          {item.type === 'text'
            ? <text x={item.x} y={item.y + Math.max(item.height * .72, 18)} fill={item.color} fontSize={Math.max(12, Math.min(32, item.height * .65))} fontWeight="700" onPointerDown={common.onPointerDown}>{item.label || 'Подпись'}</text>
            : <rect {...common} />}
          {item.label && item.type !== 'text' && item.type !== 'wall' && <text x={item.x + item.width / 2} y={item.y + item.height / 2} textAnchor="middle" dominantBaseline="middle" fill="#172033" fontSize={Math.min(24, Math.max(12, item.height * .22))} pointerEvents="none">{item.label}</text>}
          {selected && <rect x={item.x + item.width - 8} y={item.y + item.height - 8} width="16" height="16" rx="3" fill="#e30613" stroke="white" strokeWidth="2" className="cursor-nwse-resize" onPointerDown={(event) => start(event, 'resize', { id: item.id, initial: item })} />}
        </g>;
      })}
      {floorPoints.map((item) => <g key={item.id} className="cursor-move" onPointerDown={(event) => { onSelectPoint(item); start(event, 'point', { point: item }); }} onDoubleClick={() => onPointFloor(item, floor)}>
        <circle cx={item.x * layout.width} cy={item.y * layout.height} r={selectedPointId === item.id ? 18 : 14} fill={selectedPointId === item.id ? '#e30613' : '#267bd8'} stroke="white" strokeWidth="4" />
        <text x={item.x * layout.width} y={item.y * layout.height + 5} textAnchor="middle" fill="white" fontSize="14" fontWeight="bold" pointerEvents="none">●</text>
        <text x={item.x * layout.width + 20} y={item.y * layout.height + 5} fill="#172033" fontSize="14" fontWeight="700" pointerEvents="none">{item.title}</text>
      </g>)}
    </svg>
    <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 bg-white p-2">
      <div className="flex flex-wrap gap-1">
        {([['select', '↖ Выбор'], ['room', 'Комната'], ['rectangle', 'Прямоугольник'], ['wall', 'Стена'], ['passage', 'Проход'], ['text', 'Текст'], ['poi', 'Точка']] as const).map(([value, label]) =>
          <button key={value} type="button" onClick={() => onToolChange(value)} className={`min-h-9 rounded-xl px-3 text-xs font-semibold ${tool === value ? 'bg-brand text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}`}>{label}</button>
        )}
      </div>
      <div className="flex gap-1">
        <button type="button" className="min-h-9 rounded-xl bg-slate-100 px-3 text-xs font-semibold" onClick={() => setViewBox({ x: 0, y: 0, width: layout.width, height: layout.height })}>Вся область</button>
      </div>
    </div>
  </div>;
}
