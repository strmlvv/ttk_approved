import { useEffect, useMemo, useRef, useState } from 'react';
import type { PointerEvent, WheelEvent } from 'react';
import type { MapData, Poi, PoiCategory } from '../api/viewer';
import { findRoute } from '../api/viewer';
import { Button, Card, Input, Select } from '../components/ui';
import { categoryIcons, categoryLabels } from './constants';
import { getPanoramaById, getPanoramaByPlaceId, type PanoramaRecord } from '../api/panoramas';
import { PanoramaViewer } from '../panorama';
import floor0Plan from '../assets/floor-plans/floor-0.png';
import floor1Plan from '../assets/floor-plans/floor-1.png';
import floor2Plan from '../assets/floor-plans/floor-2.png';
import floor3Plan from '../assets/floor-plans/floor-3.png';

type Props = { map: MapData; embed?: boolean };
type Floor = 0 | 1 | 2 | 3;
const bundledFloorPlans: Record<Floor, string> = { 0: floor0Plan, 1: floor1Plan, 2: floor2Plan, 3: floor3Plan };
const categories: Array<'all' | PoiCategory> = ['all', 'conference', 'meeting', 'food', 'toilet', 'exhibition', 'cloakroom', 'rest', 'shop', 'reception', 'stairs', 'entrance'];
const customIconGlyphs: Record<string, string> = {
  'mall-shop': '🛍️', 'mall-foodcourt': '🍴', 'mall-cinema': '🎬', 'mall-kids': '🧸', 'mall-beauty': '💄',
  'mall-pharmacy': '💊', 'mall-atm': '💳', 'mall-parking': '🅿️', 'mall-entrance': '🚪', 'mall-info': 'ℹ️',
  'mall-toilet': '🚻', 'mall-accessible': '♿', 'mall-elevator': '🛗', 'mall-escalator': '⬆️',
  'mall-stairs': '🪜', 'mall-wifi': '📶', 'mall-security': '🛡️', 'mall-charger': '⚡', 'route-node': '✦',
};
const roomPath: Record<string, string> = {
  'p-conference': 'M8 8 H39 V31 H31 V37 H8 Z', 'p-meeting-1': 'M40 8 H60 V31 H40 Z', 'p-meeting-2': 'M61 12 H75 V33 H61 Z',
  'p-cafe': 'M76 13 H94 V38 H76 Z', 'p-toilet': 'M8 39 H17 V51 H8 Z', 'p-access': 'M18 39 H27 V51 H18 Z',
  'p-exhibition': 'M8 53 H28 V72 H8 Z', 'p-cloakroom': 'M70 54 H91 V64 H70 Z', 'p-rest': 'M70 66 H91 V82 H70 Z',
  'p-shop': 'M13 76 H32 V94 H13 Z', 'p-reception': 'M61 84 H88 V94 H61 Z', 'p-stairs': 'M73 40 H91 V52 H73 Z',
};
const roomColors: Partial<Record<PoiCategory, string>> = { conference: '#f1eef8', meeting: '#e9f3fa', food: '#fff0df', toilet: '#eaf3fa', exhibition: '#edf5eb', cloakroom: '#f0ebf8', rest: '#f4eff9', shop: '#f9eef4', reception: '#eaf2fb', stairs: '#edf0f3' };
const asPoi = (point: Poi) => point;
const MIN_VIEW_SIZE = 38;
const MAX_VIEW_SIZE = 100;
type ViewBox = { x: number; y: number; width: number; height: number };
type PointerPosition = { x: number; y: number };

function RoomGlyph({ category }: { category: PoiCategory }) {
  const glyph = categoryIcons[category] ?? '•';
  return <span className="inline-grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-[#267bd8] text-xs font-bold text-white">{glyph}</span>;
}

function FloorPlan({ pois, floor, imageUrl, floorPlans, planMode, selected, onSelect, route }: { pois: Poi[]; floor: Floor; imageUrl?: string; floorPlans?: Record<string, string>; planMode?: 'demo' | 'saved' | 'empty'; selected: Poi | null; onSelect: (poi: Poi) => void; route: { distance: number; points: Array<{x:number;y:number}> } | null }) {
  const floorPoints = pois.filter((poi) => poi.floor ? Number.parseInt(poi.floor, 10) === floor : floor === 1);
  const isBundledFloorPlan = !floorPlans?.[String(floor)] && !(floor === 1 && imageUrl);
  const floorImageUrl = floorPlans?.[String(floor)] ?? (floor === 1 ? imageUrl : undefined) ?? bundledFloorPlans[floor];
  const routePoints = route?.points.map((point) => `${point.x},${point.y}`).join(' ') ?? '';
  const viewportRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const [viewBox, setViewBox] = useState<ViewBox>({ x: 0, y: 0, width: 100, height: 100 });
  const pointersRef = useRef(new Map<number, PointerPosition>());
  const gestureRef = useRef<{ kind: 'pan' | 'pinch'; startX: number; startY: number; startViewBox: ViewBox; startDistance?: number; anchor?: PointerPosition } | null>(null);
  const suppressClickRef = useRef(false);
  const downTargetRef = useRef<Element | null>(null);
  const movedRef = useRef(false);
  useEffect(() => {
    setViewBox({ x: 0, y: 0, width: 100, height: 100 });
    pointersRef.current.clear();
    gestureRef.current = null;
  }, [floor]);

  const screenToPlan = (clientX: number, clientY: number): PointerPosition => {
    const svg = svgRef.current;
    const matrix = svg?.getScreenCTM();
    if (svg && matrix) {
      const point = svg.createSVGPoint();
      point.x = clientX;
      point.y = clientY;
      const local = point.matrixTransform(matrix.inverse());
      return { x: local.x, y: local.y };
    }
    const bounds = viewportRef.current?.getBoundingClientRect();
    if (!bounds) return { x: 50, y: 50 };
    return { x: viewBox.x + ((clientX - bounds.left) / bounds.width) * viewBox.width, y: viewBox.y + ((clientY - bounds.top) / bounds.height) * viewBox.height };
  };
  const clampViewBox = (next: ViewBox): ViewBox => {
    const width = Math.max(MIN_VIEW_SIZE, Math.min(MAX_VIEW_SIZE, next.width));
    const height = Math.max(MIN_VIEW_SIZE, Math.min(MAX_VIEW_SIZE, next.height));
    return {
      x: Math.max(-width * .45, Math.min(100 - width * .55, next.x)),
      y: Math.max(-height * .45, Math.min(100 - height * .55, next.y)),
      width,
      height,
    };
  };
  const zoomAt = (factor: number, anchor: PointerPosition) => {
    setViewBox((current) => {
      const width = Math.max(MIN_VIEW_SIZE, Math.min(MAX_VIEW_SIZE, current.width * factor));
      const height = Math.max(MIN_VIEW_SIZE, Math.min(MAX_VIEW_SIZE, current.height * factor));
      const ratio = width / current.width;
      return clampViewBox({ x: anchor.x - (anchor.x - current.x) * ratio, y: anchor.y - (anchor.y - current.y) * ratio, width, height });
    });
  };
  const zoomFromCenter = (factor: number) => {
    const rect = viewportRef.current?.getBoundingClientRect();
    zoomAt(factor, rect ? screenToPlan(rect.left + rect.width / 2, rect.top + rect.height / 2) : { x: 50, y: 50 });
  };
  const resetView = () => setViewBox({ x: 0, y: 0, width: 100, height: 100 });
  const distance = (a: PointerPosition, b: PointerPosition) => Math.hypot(a.x - b.x, a.y - b.y);
  const midpoint = (a: PointerPosition, b: PointerPosition): PointerPosition => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });

  const handlePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if ((event.target as HTMLElement).closest('[data-map-control="true"]')) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    suppressClickRef.current = false;
    movedRef.current = false;
    downTargetRef.current = event.target as Element;
    const pointer = { x: event.clientX, y: event.clientY };
    pointersRef.current.set(event.pointerId, pointer);
    const active = [...pointersRef.current.values()];
    if (active.length >= 2) {
      const a = screenToPlan(active[0].x, active[0].y);
      const b = screenToPlan(active[1].x, active[1].y);
      gestureRef.current = { kind: 'pinch', startX: distance(active[0], active[1]), startY: 0, startViewBox: viewBox, startDistance: distance(active[0], active[1]), anchor: midpoint(a, b) };
    } else {
      gestureRef.current = { kind: 'pan', startX: event.clientX, startY: event.clientY, startViewBox: viewBox };
    }
  };
  const handlePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (!pointersRef.current.has(event.pointerId)) return;
    pointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    const active = [...pointersRef.current.values()];
    const gesture = gestureRef.current;
    if (active.length >= 2 && gesture?.kind === 'pinch') {
      const nextDistance = distance(active[0], active[1]);
      if (gesture.startDistance && gesture.anchor) {
        const width = Math.max(MIN_VIEW_SIZE, Math.min(MAX_VIEW_SIZE, gesture.startViewBox.width * gesture.startDistance / Math.max(1, nextDistance)));
        const height = Math.max(MIN_VIEW_SIZE, Math.min(MAX_VIEW_SIZE, gesture.startViewBox.height * gesture.startDistance / Math.max(1, nextDistance)));
        const ratio = width / gesture.startViewBox.width;
        setViewBox(clampViewBox({ x: gesture.anchor.x - (gesture.anchor.x - gesture.startViewBox.x) * ratio, y: gesture.anchor.y - (gesture.anchor.y - gesture.startViewBox.y) * ratio, width, height }));
        suppressClickRef.current = true;
      }
      return;
    }
    if (gesture?.kind === 'pan') {
      const dx = event.clientX - gesture.startX;
      const dy = event.clientY - gesture.startY;
      if (Math.abs(dx) + Math.abs(dy) > 5) suppressClickRef.current = true;
      if (Math.abs(dx) + Math.abs(dy) > 5) movedRef.current = true;
      const rect = viewportRef.current?.getBoundingClientRect();
      if (!rect) return;
      setViewBox(clampViewBox({ ...gesture.startViewBox, x: gesture.startViewBox.x - (dx / rect.width) * gesture.startViewBox.width, y: gesture.startViewBox.y - (dy / rect.height) * gesture.startViewBox.height }));
    }
  };
  const handlePointerUp = (event: PointerEvent<HTMLDivElement>) => {
    const endedGesture = gestureRef.current;
    if (pointersRef.current.size === 1 && endedGesture?.kind === 'pan' && !movedRef.current) {
      const target = downTargetRef.current;
      const id = target?.closest<SVGGElement>('[data-room-id]')?.dataset.roomId ?? target?.closest<SVGGElement>('[data-marker-id]')?.dataset.markerId;
      const point = id ? floorPoints.find((item) => item.id === id) : undefined;
      if (point) {
        onSelect(point);
        suppressClickRef.current = true;
      }
    }
    pointersRef.current.delete(event.pointerId);
    const active = [...pointersRef.current.values()];
    if (active.length === 1) gestureRef.current = { kind: 'pan', startX: active[0].x, startY: active[0].y, startViewBox: viewBox };
    else gestureRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  };
  const handleWheel = (event: WheelEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    zoomAt(event.deltaY < 0 ? .88 : 1.14, screenToPlan(event.clientX, event.clientY));
  };
  const viewBoxValue = `${viewBox.x} ${viewBox.y} ${viewBox.width} ${viewBox.height}`;
  const zoomPercent = Math.round((100 / viewBox.width) * 100);
  return <div ref={viewportRef} className="relative min-h-[560px] overflow-hidden rounded-2xl bg-[#f8fafc] ring-1 ring-slate-200 select-none touch-none sm:min-h-[720px]" onPointerDown={handlePointerDown} onPointerMove={handlePointerMove} onPointerUp={handlePointerUp} onPointerCancel={handlePointerUp} onWheel={handleWheel}>
    <svg ref={svgRef} viewBox={viewBoxValue} preserveAspectRatio="xMidYMid meet" className="absolute inset-0 h-full w-full select-none touch-none" aria-label={`План помещения, ${floor} этаж`} role="img">
      <defs><pattern id="floor-grid" width="1" height="1" patternUnits="userSpaceOnUse"><path d="M 1 0 L 0 0 0 1" fill="none" stroke="#dfe4ea" strokeWidth=".12" /></pattern><filter id="room-shadow" x="-10%" y="-10%" width="120%" height="120%"><feDropShadow dx="0" dy=".2" stdDeviation=".35" floodColor="#64748b" floodOpacity=".12" /></filter></defs>
      <rect width="100" height="100" fill="#f5f7f9" /><rect width="100" height="100" fill="url(#floor-grid)" />
      {floor === 1 && planMode === 'demo' && !isBundledFloorPlan ? <>
        <path d="M7 7 H61 V11 H76 V12 H95 V39 H92 V54 H92 V83 H89 V95 H60 V91 H33 V95 H12 V75 H7 V52 H8 V38 H7 Z" fill="#e4e9e8" stroke="#374151" strokeWidth="1.2" strokeLinejoin="round" />
        <path d="M29 37 H74 V54 H69 V83 H60 V91 H34 V75 H28 V53 H30 Z" fill="#fbfbf8" stroke="#4b5563" strokeWidth=".65" />
        <path d="M30 37 H39 V31 H75 V34 H76 V39 H73 V54 H69 V66 H70 V83 H60 V91 H34 V75 H28 V53 H30 Z" fill="#fdfdfb" />
        {floorPoints.map((poi) => { const d = roomPath[poi.id]; if (!d) return null; const isSelected = selected?.id === poi.id; return <g key={poi.id} data-room-id={poi.id} role="button" tabIndex={0} aria-label={`Выбрать помещение: ${poi.name}`} onClick={() => { if (suppressClickRef.current) { suppressClickRef.current = false; return; } onSelect(asPoi(poi)); }} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onSelect(asPoi(poi)); } }} className="cursor-pointer outline-none"><path d={d} fill={isSelected ? '#dcecff' : roomColors[poi.category] ?? '#f0f3f4'} stroke={isSelected ? '#267bd8' : '#475569'} strokeWidth={isSelected ? '.9' : '.48'} filter="url(#room-shadow)" className="transition-colors hover:fill-blue-100"/><text x={poi.x} y={poi.y + 5} textAnchor="middle" fontSize="1.45" fontWeight="600" fill="#263244">{poi.name.length > 17 ? `${poi.name.slice(0, 16)}…` : poi.name}</text></g>; })}
        <g fill="none" stroke="#fff" strokeWidth="1.2"><path d="M39 8 V31 M60 8 V31 M61 12 V33 M75 13 V38 M8 39 H27 M8 51 H28 M8 53 H28 M70 54 H91 M70 64 H91 M70 66 H91 M13 76 H32 M61 84 H88"/><path d="M7 20 H8 M7 44 H8 M94 24 H95 M60 95 V94 M22 95 V94" strokeWidth=".65"/></g>
        <g fill="#c7d3ca" stroke="#9bab9e" strokeWidth=".2"><circle cx="37" cy="49" r="1.15"/><circle cx="42" cy="72" r="1.2"/><circle cx="59" cy="60" r="1.1"/><circle cx="86" cy="17" r=".9"/><circle cx="86" cy="79" r="1.1"/><circle cx="33" cy="90" r=".9"/></g>
        {route && <polyline points={routePoints} fill="none" stroke="#1683e8" strokeWidth=".65" strokeDasharray="1.2 1.05" strokeLinecap="round" strokeLinejoin="round" />}
        {floorPoints.map((poi) => <g key={`marker-${poi.id}`} data-marker-id={poi.id} role="button" tabIndex={0} aria-label={poi.name} onClick={() => { if (suppressClickRef.current) { suppressClickRef.current = false; return; } onSelect(poi); }} onKeyDown={(event) => { if (event.key === 'Enter') onSelect(poi); }} className="cursor-pointer"><circle cx={poi.x} cy={poi.y} r={selected?.id === poi.id ? 2 : 1.55} fill={selected?.id === poi.id ? '#e30613' : '#267bd8'} stroke="white" strokeWidth=".5"/><text x={poi.x} y={poi.y + .55} textAnchor="middle" fontSize="1.25" fontWeight="700" fill="white">{customIconGlyphs[poi.icon ?? ''] || categoryIcons[poi.category]}</text></g>)}
        <g><path d="M43 95 v3 m5 -3 v3 m-5 -1 h5" stroke="#374151" strokeWidth=".45"/><text x="45.5" y="99" textAnchor="middle" fontSize="1.2" fill="#334155">Вход</text></g>
      </> : floorImageUrl ? <>
        <image href={floorImageUrl} x="0" y="0" width="100" height="100" preserveAspectRatio="xMidYMid meet" />
        {route && <polyline points={routePoints} fill="none" stroke="#1683e8" strokeWidth=".65" strokeDasharray="1.2 1.05" strokeLinecap="round" strokeLinejoin="round" />}
        {floorPoints.map((poi) => <g key={`saved-marker-${poi.id}`} data-marker-id={poi.id} role="button" tabIndex={0} aria-label={poi.name} onClick={() => { if (suppressClickRef.current) { suppressClickRef.current = false; return; } onSelect(poi); }} onKeyDown={(event) => { if (event.key === 'Enter') onSelect(poi); }} className="cursor-pointer"><circle cx={poi.x} cy={poi.y} r={selected?.id === poi.id ? 2 : 1.55} fill={selected?.id === poi.id ? '#e30613' : '#267bd8'} stroke="white" strokeWidth=".5"/><text x={poi.x} y={poi.y + .55} textAnchor="middle" fontSize="1.25" fontWeight="700" fill="white">{customIconGlyphs[poi.icon ?? ''] || categoryIcons[poi.category]}</text></g>)}
      </> : <g><rect x="22" y="18" width="56" height="64" rx="2" fill="#fff" stroke="#94a3b8" strokeWidth=".7"/><text x="50" y="45" textAnchor="middle" fontSize="3" fill="#334155">{floor} этаж</text><text x="50" y="52" textAnchor="middle" fontSize="1.7" fill="#64748b">План этажа ещё не загружен</text></g>}
    </svg>
    <div data-map-control="true" className="absolute bottom-4 right-4 z-20 flex flex-col overflow-hidden rounded-2xl bg-white shadow-lg ring-1 ring-slate-200" onPointerDown={(event) => event.stopPropagation()}>
      <button type="button" aria-label="Приблизить карту" className="grid h-12 w-12 place-items-center text-2xl font-semibold hover:bg-slate-50 disabled:opacity-40" disabled={viewBox.width <= MIN_VIEW_SIZE} onClick={() => zoomFromCenter(.8)}>+</button>
      <button type="button" aria-label="Отдалить карту" className="grid h-12 w-12 place-items-center border-t border-slate-100 text-2xl font-semibold hover:bg-slate-50 disabled:opacity-40" disabled={viewBox.width >= MAX_VIEW_SIZE} onClick={() => zoomFromCenter(1.25)}>−</button>
      <div className="grid h-9 place-items-center border-t border-slate-100 text-[11px] font-semibold text-slate-600" aria-live="polite">{zoomPercent}%</div>
      <button type="button" aria-label="Показать всю карту" className="grid min-h-10 place-items-center border-t border-slate-100 px-2 text-[10px] font-semibold hover:bg-slate-50" onClick={resetView}>Вся карта</button>
    </div>
    {floor === 1 && route && <div className="absolute left-3 top-3 rounded-xl bg-white/95 px-3 py-2 text-xs font-semibold text-blue-700 shadow">● Маршрут: {route.distance} м</div>}
    <div className="absolute bottom-3 left-3 flex h-12 w-12 flex-col items-center justify-center rounded-full border border-slate-200 bg-white/95 text-[9px] font-bold text-slate-700 shadow"><span>N</span><span className="text-lg leading-4">▲</span></div>
  </div>;
}

function Legend({ onCategory }: { onCategory: (category: PoiCategory) => void }) {
  const legendCategories: PoiCategory[] = ['conference', 'meeting', 'food', 'toilet', 'exhibition', 'cloakroom', 'rest', 'shop', 'reception', 'stairs', 'entrance'];
  return <section><h2 className="mb-3 text-base font-bold">Обозначения</h2><div className="space-y-1">{legendCategories.map((category) => <button key={category} onClick={() => onCategory(category)} className="flex min-h-10 w-full items-center gap-3 rounded-xl px-1 text-left text-sm text-slate-700 hover:bg-slate-50"><RoomGlyph category={category} /><span>{categoryLabels[category]}</span></button>)}</div></section>;
}

export function Viewer({ map, embed = false, initialQuery = '', initialPoiId }: Props & { initialQuery?: string; initialPoiId?: string }) {
  const initialPoi = map.pois.find((poi) => poi.id === initialPoiId) ?? null;
  const initialFloor = initialPoi?.floor ? Number.parseInt(initialPoi.floor, 10) : 1;
  const [query, setQuery] = useState(initialQuery); const [category, setCategory] = useState<'all' | PoiCategory>('all'); const [selected, setSelected] = useState<Poi | null>(initialPoi); const [floor, setFloor] = useState<Floor>(initialFloor === 0 || initialFloor === 1 || initialFloor === 2 || initialFloor === 3 ? initialFloor : 1); const [from, setFrom] = useState('p-main'); const [to, setTo] = useState('p-conference'); const [route, setRoute] = useState<{ distance: number; points: Array<{x:number;y:number}> } | null>(null); const [routeError, setRouteError] = useState(''); const [panorama, setPanorama] = useState<PanoramaRecord | null>(null); const [panoramaMissing, setPanoramaMissing] = useState(false); const [shareState, setShareState] = useState<'idle' | 'copied' | 'failed'>('idle');
  const pois = useMemo(() => map.pois.filter((poi) => (category === 'all' || poi.category === category) && poi.name.toLowerCase().includes(query.toLowerCase())), [map.pois, query, category]);
  const selectedPoi = selected ?? map.pois.find((poi) => poi.id === to) ?? map.pois[0];
  const selectedPanoramaAvailable = Boolean(selectedPoi?.panoramaId);
  const selectPoi = (poi: Poi) => {
    const poiFloor = poi.floor ? Number.parseInt(poi.floor, 10) : 1;
    if (poiFloor === 0 || poiFloor === 1 || poiFloor === 2 || poiFloor === 3) setFloor(poiFloor);
    setSelected(poi);
  };
  const buildRoute = async () => { setRouteError(''); const next = await findRoute(from, to, map); if (!next) { setRoute(null); setRouteError('Путь не найден: проверьте выбранные точки.'); } else setRoute(next); };
  const shareMap = async () => { const url = window.location.href; try { if (navigator.share) await navigator.share({ title: map.name, text: `Открыть карту: ${map.name}`, url }); else if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(url); else { const input = document.createElement('textarea'); input.value = url; input.style.position = 'fixed'; input.style.opacity = '0'; document.body.appendChild(input); input.focus(); input.select(); if (!document.execCommand('copy')) throw new Error('Clipboard unavailable'); input.remove(); } setShareState('copied'); window.setTimeout(() => setShareState('idle'), 2200); } catch { setShareState('failed'); window.setTimeout(() => setShareState('idle'), 2200); } };
  const showPanorama = async (poi: Poi) => {
    setPanoramaMissing(false);
    try {
      const item = poi.panoramaId ? await getPanoramaById(poi.panoramaId) : null;
      const fallback = item ?? await getPanoramaByPlaceId(poi.id);
      if (fallback?.image_url) setPanorama(fallback);
      else setPanoramaMissing(true);
    } catch {
      setPanoramaMissing(true);
    }
  };
  return <div className="bg-[#f5f7fa] text-[#1a1a1a]"><div className="mx-auto flex max-w-[1600px] items-center justify-between gap-3 px-4 pb-2 pt-5 sm:px-7"><div><p className="text-[10px] font-bold uppercase tracking-[.2em] text-brand">Публичная карта</p><h1 className="text-2xl font-extrabold sm:text-3xl">{map.name === 'ТТК «Центральный»' ? 'Главный корпус' : map.name}</h1></div>{!embed && <Button variant="secondary" className="px-3 text-xs sm:text-sm" onClick={shareMap}>{shareState === 'copied' ? 'Ссылка скопирована' : shareState === 'failed' ? 'Не удалось поделиться' : 'Поделиться'}</Button>}</div>
    <main className="mx-auto grid max-w-[1600px] gap-4 px-3 pb-6 pt-2 sm:px-5 lg:grid-cols-[86px_minmax(0,1fr)_310px]">
      <nav aria-label="Выбор этажа" className="flex gap-2 overflow-x-auto lg:flex-col lg:pt-3">{([0,1,2,3] as Floor[]).map((item) => <button key={item} onClick={() => { setFloor(item); setRoute(null); }} className={`min-h-12 min-w-24 rounded-xl border px-3 text-sm font-semibold transition lg:min-w-0 ${floor === item ? 'border-blue-600 bg-blue-600 text-white shadow' : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'}`}>{item} этаж</button>)}</nav>
      <section className="min-w-0"><Card className="overflow-hidden rounded-2xl p-2"><FloorPlan pois={pois} floor={floor} imageUrl={map.imageUrl} floorPlans={map.floorPlans} planMode={map.planMode} selected={selected} onSelect={selectPoi} route={route} /></Card><div className="mt-3 grid gap-2 sm:grid-cols-[1fr_180px]"><Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Найти помещение..." aria-label="Поиск по помещениям"/><Select value={category} onChange={(event) => setCategory(event.target.value as 'all' | PoiCategory)} aria-label="Категория"><option value="all">Все категории</option>{categories.filter((item): item is PoiCategory => item !== 'all').map((item) => <option key={item} value={item}>{categoryLabels[item]}</option>)}</Select></div>{pois.length > 0 && <div className="mt-3 grid gap-2 sm:grid-cols-2">{pois.slice(0, 8).map((poi) => <button key={poi.id} type="button" onClick={() => selectPoi(poi)} className={`rounded-xl bg-white p-3 text-left ring-1 ring-slate-200 transition hover:ring-blue-300 ${selected?.id === poi.id ? 'ring-2 ring-brand' : ''}`}><span className="block text-sm font-bold text-slate-800">{poi.name}</span><span className="mt-1 block text-xs text-slate-500">{categoryLabels[poi.category]}{poi.floor ? ` · ${poi.floor}` : ''}</span></button>)}</div>}</section>
      <aside className="space-y-3"><Card className="p-4"><Legend onCategory={(value) => setCategory(category === value ? 'all' : value)} /></Card><Card className="p-4"><h2 className="mb-3 text-base font-bold">Маршрут</h2><div className="mb-3 flex items-center gap-2 text-xs text-slate-600"><span className="text-blue-600">● ··· ●</span><span>{map.pois.find((poi) => poi.id === from)?.name ?? 'Откуда'} → {map.pois.find((poi) => poi.id === to)?.name ?? 'Куда'}</span></div><div className="space-y-2"><Select value={from} onChange={(event) => setFrom(event.target.value)} aria-label="Начало маршрута">{map.pois.map((poi) => <option key={poi.id} value={poi.id}>{poi.name}</option>)}</Select><Select value={to} onChange={(event) => setTo(event.target.value)} aria-label="Конец маршрута">{map.pois.map((poi) => <option key={poi.id} value={poi.id}>{poi.name}</option>)}</Select><Button className="w-full bg-[#267bd8] hover:bg-blue-700" onClick={() => void buildRoute()}>Построить маршрут</Button>{routeError && <p className="text-xs text-brand">{routeError}</p>}</div></Card><Card className="overflow-hidden"><div className="p-4 pb-2"><p className="text-xs text-slate-500">Выбранное помещение · {floor} этаж</p><h2 className="mt-1 font-bold">{selectedPoi?.name ?? 'Выберите комнату на плане'}</h2><p className="mt-1 text-xs leading-5 text-slate-600">{selectedPoi?.description ?? 'Нажмите на помещение, чтобы увидеть подробности.'}</p></div><button disabled={!selectedPanoramaAvailable} className="relative mx-4 mt-2 block h-32 w-[calc(100%-2rem)] overflow-hidden rounded-xl bg-gradient-to-br from-slate-200 via-slate-100 to-slate-300 text-left disabled:cursor-not-allowed disabled:opacity-60" onClick={() => selectedPoi && void showPanorama(selectedPoi)} aria-label="Открыть панораму выбранного помещения"><span className="absolute inset-0 bg-[linear-gradient(135deg,transparent_44%,rgba(255,255,255,.6)_45%,transparent_46%),linear-gradient(25deg,transparent_60%,rgba(255,255,255,.55)_61%,transparent_62%)]"/><span className="absolute bottom-2 left-3 rounded-full bg-white/90 px-3 py-1 text-xs font-semibold text-slate-700">{selectedPanoramaAvailable ? `360° · ${selectedPoi?.name ?? 'Панорама помещения'}` : 'Панорама не добавлена'}</span></button><button disabled={!selectedPanoramaAvailable} className="flex min-h-12 w-full items-center gap-2 px-4 text-left text-xs font-semibold text-blue-700 disabled:cursor-not-allowed disabled:text-slate-400" onClick={() => selectedPoi && void showPanorama(selectedPoi)}><span className="grid h-7 w-7 place-items-center rounded-full bg-blue-600 text-sm text-white">⌖</span>{selectedPanoramaAvailable ? 'Посмотреть панораму' : 'Панорама не добавлена'} <span className="ml-auto">›</span></button>{panoramaMissing && <p role="status" className="mx-4 mb-4 rounded-xl bg-slate-100 p-3 text-xs text-slate-600">Для этого помещения панорама пока не добавлена.</p>}</Card></aside>
    </main>
    {panorama && <div className="fixed inset-0 z-50 overflow-y-auto bg-[#f5f5f3] p-3 sm:p-8"><div className="mx-auto max-w-5xl"><div className="mb-3 flex items-center justify-between"><div><p className="text-xs font-bold uppercase tracking-[.2em] text-brand">Осмотреть пространство</p><p className="text-sm text-neutral-500">Интерактивная панорама с переходами между точками</p></div><Button variant="secondary" onClick={() => setPanorama(null)}>Закрыть</Button></div><PanoramaViewer panorama={panorama} onChangePanorama={setPanorama}/></div></div>}
  </div>;
}

