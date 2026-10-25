import { useEffect, useMemo, useRef, useState } from 'react';
import { Button, Card, Input, Modal, Select } from '../components/ui';
import { categoryLabel, editorCategories, type EditorPath, type EditorPoint, type OrganizerMap } from './types';
import { saveMapSnapshot } from './repository';
import { editorIcons, iconByValue } from './iconCatalog';
import { replacePanoramaForPlace } from '../api/panoramas';
import { appPath } from '../lib/routing';
import floor0Plan from '../assets/floor-plans/floor-0.png';
import floor1Plan from '../assets/floor-plans/floor-1.png';
import floor2Plan from '../assets/floor-plans/floor-2.png';
import floor3Plan from '../assets/floor-plans/floor-3.png';

const pointIcon: Record<EditorPoint['kind'], string> = { poi: '●', node: '×' };
const clamp = (value: number) => Math.max(0, Math.min(1, value));
const parkFloorPlans: Record<string, string> = { '0': floor0Plan, '1': floor1Plan, '2': floor2Plan, '3': floor3Plan };

function PlanCanvas({ map, floor, selectedPointId, onPointSelect, onCreatePoint, onMovePoint, onDeletePoint }: { map: OrganizerMap; floor: string; selectedPointId: string | null; onPointSelect: (point: EditorPoint) => void; onCreatePoint: (x: number, y: number) => void; onMovePoint: (point: EditorPoint, x: number, y: number) => void; onDeletePoint: (point: EditorPoint) => void }) {
  const ref = useRef<HTMLDivElement>(null); const [dragging, setDragging] = useState<string | null>(null);
  const storedFloorPlan = map.floor_plans?.[floor];
  const planImage = storedFloorPlan?.startsWith('data:image/')
    ? storedFloorPlan
    : map.floor_plan_display_urls?.[floor] ?? storedFloorPlan ?? (floor === '1' ? map.plan_display_url ?? map.plan_url : undefined);
  const getPosition = (event: { clientX: number; clientY: number }) => { const rect = ref.current?.getBoundingClientRect(); return rect ? { x: clamp((event.clientX - rect.left) / rect.width), y: clamp((event.clientY - rect.top) / rect.height) } : { x: 0.5, y: 0.5 }; };
  const handlePlanClick = (event: React.MouseEvent<HTMLDivElement>) => { if ((event.target as HTMLElement).closest('[data-point]')) return; const rect = ref.current?.getBoundingClientRect(); if (!rect) return; onCreatePoint(clamp((event.clientX - rect.left) / rect.width), clamp((event.clientY - rect.top) / rect.height)); };
  return <div ref={ref} className="relative aspect-[16/10] min-h-[420px] overflow-hidden rounded-3xl border border-dashed border-neutral-300 bg-neutral-100 bg-[linear-gradient(90deg,rgba(26,26,26,.05)_1px,transparent_1px),linear-gradient(rgba(26,26,26,.05)_1px,transparent_1px)] bg-[size:32px_32px]" onClick={handlePlanClick}>
    {planImage ? <img src={planImage} alt={`План ${floor} этажа`} className="absolute inset-0 h-full w-full object-contain" draggable={false} /> : <div className="absolute inset-0 grid place-items-center p-8 text-center text-sm text-neutral-400"><div><div className="mb-2 text-4xl">⌗</div><p>Загрузите план {floor} этажа,<br />затем кликайте по нему для добавления точек</p></div></div>}
    <svg className="pointer-events-none absolute inset-0 h-full w-full" viewBox="0 0 1 1" preserveAspectRatio="none">{map.paths.map((path) => { const from = map.points.find((point) => point.id === path.from_id); const to = map.points.find((point) => point.id === path.to_id); return from && to ? <line key={path.id} x1={from.x} y1={from.y} x2={to.x} y2={to.y} stroke="#E30613" strokeWidth="0.006" strokeLinecap="round" /> : null; })}</svg>
    {map.points.map((point) => <button key={point.id} data-point="true" type="button" className={`absolute z-10 grid h-11 w-11 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border-4 border-white text-lg font-bold text-white shadow-lg transition hover:scale-110 ${selectedPointId === point.id ? 'bg-brand ring-4 ring-red-200' : point.kind === 'node' ? 'bg-ink' : 'bg-brand'}`} style={{ left: `${point.x * 100}%`, top: `${point.y * 100}%` }} onClick={(event) => { event.stopPropagation(); onPointSelect(point); }} onPointerDown={() => setDragging(point.id)} onPointerMove={(event) => { if (dragging === point.id && event.buttons === 1) { const pos = getPosition(event); onMovePoint(point, pos.x, pos.y); } }} onPointerUp={() => setDragging(null)} aria-label={point.title || 'Без названия'}>{point.icon ? iconByValue(point.icon).glyph : pointIcon[point.kind]}</button>)}
    {map.points.filter((point) => point.id === selectedPointId).map((point) => <button key={`delete-${point.id}`} type="button" data-point="true" aria-label={`Удалить точку ${point.title || ''}`} title="Удалить точку" className="absolute z-20 grid h-7 w-7 -translate-y-full place-items-center rounded-full bg-red-600 text-sm font-bold text-white shadow-lg ring-2 ring-white hover:bg-red-700" style={{ left: `${point.x * 100}%`, top: `${point.y * 100}%`, marginLeft: 14 }} onClick={(event) => { event.stopPropagation(); onDeletePoint(point); }}>×</button>)}
  </div>;
}

export function Editor({ initialMap }: { initialMap: OrganizerMap }) {
  const shouldAttachParkPlans = initialMap.slug === 'torgovyy-centr-park' && Object.keys(initialMap.floor_plans ?? {}).length === 0;
  const mapWithParkPlans = shouldAttachParkPlans
    ? { ...initialMap, plan_url: undefined, floor_plans: parkFloorPlans }
    : initialMap;
  const [savedMap, setSavedMap] = useState(initialMap);
  const [map, setMap] = useState(mapWithParkPlans);
  const [planFloor, setPlanFloor] = useState('1');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [pathStart, setPathStart] = useState<string | null>(null);
  const [saveState, setSaveState] = useState('');
  const [saving, setSaving] = useState(false);
  const [leavePromptOpen, setLeavePromptOpen] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [panoramaSaving, setPanoramaSaving] = useState(false);
  const savingRef = useRef(false);
  const hasChanges = useMemo(() => JSON.stringify(map) !== JSON.stringify(savedMap), [map, savedMap]);
  const selected = map.points.find((point) => point.id === selectedId) ?? null; const pendingPathTarget = pathStart ? map.points.find((point) => point.id === pathStart) : null;
  useEffect(() => {
    const warnBeforeLeave = (event: BeforeUnloadEvent) => {
      if (!hasChanges) return;
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', warnBeforeLeave);
    return () => window.removeEventListener('beforeunload', warnBeforeLeave);
  }, [hasChanges]);
  const leaveEditor = () => {
    if (hasChanges) { setLeavePromptOpen(true); return; }
    window.location.assign(appPath('/app'));
  };
  const saveChanges = async (): Promise<boolean> => {
    if (savingRef.current || !hasChanges) return !hasChanges;
    savingRef.current = true;
    setSaving(true);
    setSaveState('Сохраняем изменения…');
    try {
      const result = await saveMapSnapshot(map);
      setMap(result.map);
      setSavedMap(result.map);
      setSaveError('');
      setSaveState(result.persisted === 'local'
        ? 'Сохранено локально (демо-режим)'
        : result.storageFallback
          ? 'Карта сохранена. План записан в базу; Storage bucket не найден.'
          : 'Изменения сохранены');
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Повторите попытку.';
      console.error('Не удалось сохранить изменения карты', error);
      setSaveError(message);
      setSaveState('Не удалось сохранить изменения');
      return false;
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };
  const discardChanges = () => {
    if (hasChanges && !window.confirm('Отменить все несохранённые изменения и восстановить последнюю сохранённую версию?')) return;
    setMap(savedMap);
    setSelectedId(null);
    setPathStart(null);
    setSaveState('Изменения отменены');
  };
  const updateLocalPoint = (next: EditorPoint) => { setMap((current) => ({ ...current, points: current.points.map((point) => point.id === next.id ? next : point) })); setSaveState('Есть несохранённые изменения'); };
  const createPoint = (x: number, y: number) => { const point: EditorPoint = { id: crypto.randomUUID?.() ?? `point-${Date.now()}`, kind: 'poi', category: 'other', icon: 'other', title: 'Новая точка', description: '', x, y }; setMap((current) => ({ ...current, points: [...current.points, point] })); setSelectedId(point.id); setSaveState('Есть несохранённые изменения'); };
  const deletePoint = (point: EditorPoint) => {
    if (!window.confirm(`Удалить точку «${point.title}»?`)) return;
    setMap((current) => ({ ...current, points: current.points.filter((item) => item.id !== point.id), paths: current.paths.filter((path) => path.from_id !== point.id && path.to_id !== point.id), panoramas: (current.panoramas ?? []).filter((panorama) => panorama.place_id !== point.id) }));
    setSelectedId(null);
    setSaveState('Есть несохранённые изменения');
  };
  const deleteSelectedPoint = () => { if (selected) deletePoint(selected); };
  const createPath = (targetId: string) => { if (!pathStart || pathStart === targetId) return; const path: EditorPath = { id: crypto.randomUUID?.() ?? `path-${Date.now()}`, from_id: pathStart, to_id: targetId }; setMap((current) => ({ ...current, paths: [...current.paths, path] })); setPathStart(null); setSaveState('Есть несохранённые изменения'); };
  const uploadPlan = (file?: File) => {
    if (!file || !['image/png', 'image/svg+xml'].includes(file.type)) return;
    if (file.size > 20 * 1024 * 1024) {
      setSaveError('Размер плана не должен превышать 20 МБ.');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const image = String(reader.result);
      setMap((current) => ({
        ...current,
        plan_url: planFloor === '1' ? image : current.plan_url,
        floor_plans: { ...(current.floor_plans ?? {}), [planFloor]: image },
      }));
      setSaveError('');
      setSaveState('Есть несохранённые изменения');
    };
    reader.onerror = () => setSaveError('Не удалось прочитать файл плана.');
    reader.readAsDataURL(file);
  };
  const uploadPlacePanorama = (file?: File) => {
    if (!file || !selected) return;
    if (!file.type.startsWith('image/')) { setSaveError('Загрузите файл изображения панорамы.'); return; }
    const reader = new FileReader();
    reader.onload = () => {
      const existing = map.panoramas?.find((panorama) => panorama.place_id === selected.id);
      const nextPanorama = { id: existing?.id ?? `panorama-${crypto.randomUUID?.() ?? Date.now()}`, place_id: selected.id, title: selected.title, image_url: String(reader.result) };
      setMap((current) => ({ ...current, panoramas: [...(current.panoramas ?? []).filter((panorama) => panorama.place_id !== selected.id), nextPanorama] }));
      setSaveError('');
      setSaveState('Есть несохранённые изменения');
    };
    reader.onerror = () => setSaveError('Не удалось прочитать файл панорамы.');
    reader.readAsDataURL(file);
  };
  const removePlacePanorama = () => {
    if (!selected) return;
    setMap((current) => ({ ...current, panoramas: (current.panoramas ?? []).filter((panorama) => panorama.place_id !== selected.id) }));
    setSaveState('Есть несохранённые изменения');
  };
  const saveSelectedPanorama = async () => {
    if (!selected) return;
    const draft = map.panoramas?.find((panorama) => panorama.place_id === selected.id);
    if (!draft) return;
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(map.id) || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(selected.id)) {
      setSaveState('Сначала сохраните помещение, затем сохраните панораму');
      return;
    }
    setPanoramaSaving(true);
    try {
      const saved = await replacePanoramaForPlace({
        map_id: map.id,
        place_id: selected.id,
        title: draft.title || selected.title,
        image_url: draft.image_url,
        x: selected.x,
        y: selected.y,
      });
      const next = { ...draft, id: saved.id, image_url: saved.image_url, title: saved.title };
      setMap((current) => ({ ...current, panoramas: [...(current.panoramas ?? []).filter((item) => item.place_id !== selected.id), next] }));
      setSavedMap((current) => ({ ...current, panoramas: [...(current.panoramas ?? []).filter((item) => item.place_id !== selected.id), next] }));
      setSaveError('');
      setSaveState('Панорама сохранена');
    } catch (error) {
      console.error('Не удалось сохранить панораму', error);
      setSaveState('Не удалось сохранить панораму');
    } finally {
      setPanoramaSaving(false);
    }
  };
  const setMapField = (patch: Partial<OrganizerMap>) => { setMap((current) => ({ ...current, ...patch })); setSaveState('Есть несохранённые изменения'); };
  return <div className="min-h-screen bg-[#f5f5f3] text-ink"><header className="safe-top border-b border-black/5 bg-white"><div className="mx-auto flex max-w-[1500px] flex-wrap items-center justify-between gap-3 px-4 py-4 sm:px-6"><div><p className="text-xs font-bold uppercase tracking-[.2em] text-brand">Редактор карты</p><Input value={map.name} onChange={(event) => setMapField({ name: event.target.value })} className="mt-1 max-w-sm border-0 px-0 text-xl font-extrabold shadow-none ring-0 focus:ring-0" /></div><div className="flex flex-wrap items-center gap-2"><span className={`text-xs ${hasChanges ? 'font-semibold text-amber-700' : 'text-neutral-500'}`} role="status">{saveState || (hasChanges ? 'Есть несохранённые изменения' : 'Все изменения сохранены')}</span><Button variant="secondary" disabled={saving || !hasChanges} onClick={discardChanges}>Отменить изменения</Button><Button disabled={saving || !hasChanges} onClick={() => void saveChanges()}>{saving ? 'Сохранение…' : 'Сохранить изменения'}</Button><Button variant="ghost" onClick={leaveEditor}>К кабинету</Button></div></div></header><main className="mx-auto grid max-w-[1500px] gap-4 px-4 py-5 sm:px-6 lg:grid-cols-[1fr_340px]"><section><div className="mb-4 flex flex-wrap items-center justify-between gap-3"><div className="flex flex-wrap items-center gap-2"><label className="inline-flex min-h-12 cursor-pointer items-center gap-2 rounded-2xl bg-white px-4 text-sm font-semibold ring-1 ring-black/10"><span>Загрузить план {planFloor} этажа</span><input type="file" accept="image/png,image/svg+xml" className="sr-only" onChange={(event) => uploadPlan(event.target.files?.[0])} /></label><Select aria-label="Этаж для плана" value={planFloor} onChange={(event) => setPlanFloor(event.target.value)}><option value="1">1 этаж</option><option value="2">2 этаж</option><option value="3">3 этаж</option></Select><Button variant={pathStart ? 'primary' : 'secondary'} onClick={() => setPathStart(pathStart ? null : (selected?.id ?? map.points[0]?.id ?? null))}>{pathStart ? `Выберите точку Б${pendingPathTarget ? ` после ${pendingPathTarget.title}` : ''}` : 'Создать дорожку'}</Button></div><div className="flex items-center gap-2 text-xs text-neutral-500"><span className="h-2 w-2 rounded-full bg-brand" /> POI <span className="ml-2 h-2 w-2 rounded-full bg-ink" /> Узел</div></div><PlanCanvas map={map} floor={planFloor} selectedPointId={selectedId} onPointSelect={(point) => { setSelectedId(point.id); if (pathStart) createPath(point.id); }} onCreatePoint={createPoint} onMovePoint={(point, x, y) => updateLocalPoint({ ...point, x, y })} onDeletePoint={deletePoint} /><p className="mt-3 text-xs text-neutral-500">Клик по плану — новая точка. Координаты сохраняются в долях 0–1 и не зависят от размера экрана.</p></section><aside className="space-y-4"><Card className="p-4"><div className="mb-4 flex items-center justify-between"><div><h2 className="font-bold">Свойства точки</h2><p className="text-xs text-neutral-500">{selected ? 'Изменения сохранены только в черновике' : 'Выберите точку на плане'}</p></div>{selected && <span className="rounded-full bg-red-50 px-2 py-1 text-xs font-bold text-brand">{selected.kind === 'poi' ? 'POI' : 'Узел'}</span>}</div>{selected ? <div className="space-y-3"><label className="block text-xs font-semibold text-neutral-600">Название<Input value={selected.title} onChange={(event) => updateLocalPoint({ ...selected, title: event.target.value })} className="mt-1" /></label><label className="block text-xs font-semibold text-neutral-600">Описание<textarea value={selected.description} onChange={(event) => updateLocalPoint({ ...selected, description: event.target.value })} className="mt-1 min-h-28 w-full rounded-2xl bg-white p-3 text-sm outline-none ring-1 ring-black/10 focus:ring-2 focus:ring-brand" /></label><label className="block text-xs font-semibold text-neutral-600">Тип<Select value={selected.kind} onChange={(event) => updateLocalPoint({ ...selected, kind: event.target.value as EditorPoint['kind'] })} className="mt-1"><option value="poi">POI — интересное место</option><option value="node">Node — узел маршрута</option></Select></label><label className="block text-xs font-semibold text-neutral-600">Иконка<div className="mt-1 grid max-h-48 grid-cols-4 gap-2 overflow-y-auto rounded-2xl bg-neutral-100 p-2">{editorIcons.map((icon) => <button key={icon.value} type="button" title={icon.label} className={`grid min-h-12 place-items-center rounded-xl text-base ${selected.icon === icon.value ? `ring-2 ring-brand ${icon.tone}` : `bg-white ${icon.tone}`}`} onClick={() => updateLocalPoint({ ...selected, icon: icon.value })}><span>{icon.glyph}</span></button>)}</div><p className="mt-1 text-[11px] font-normal text-neutral-500">{iconByValue(selected.icon).label}</p></label><label className="block text-xs font-semibold text-neutral-600">Категория<Select value={selected.category} onChange={(event) => updateLocalPoint({ ...selected, category: event.target.value as EditorPoint['category'] })} className="mt-1">{editorCategories.map((category) => <option key={category.value} value={category.value}>{category.label}</option>)}</Select></label><div className="grid grid-cols-2 gap-2 rounded-2xl bg-neutral-100 p-3 text-xs"><div><span className="text-neutral-500">X</span><p className="font-bold">{selected.x.toFixed(3)}</p></div><div><span className="text-neutral-500">Y</span><p className="font-bold">{selected.y.toFixed(3)}</p></div></div><Card className="bg-neutral-50 p-3 shadow-none"><p className="mb-2 text-xs font-semibold text-neutral-700">Панорама помещения</p>{map.panoramas?.some((panorama) => panorama.place_id === selected.id) ? <div className="space-y-2"><img src={map.panoramas.find((panorama) => panorama.place_id === selected.id)?.image_url} alt="Черновик панорамы" className="h-24 w-full rounded-xl object-cover"/><p className="text-xs text-amber-700">Панорама изменена в черновике</p><Button variant="secondary" className="w-full" onClick={removePlacePanorama}>Убрать панораму</Button></div> : <p className="mb-2 text-xs text-neutral-500">Пока не добавлена</p>}<label className="inline-flex min-h-11 w-full cursor-pointer items-center justify-center rounded-xl bg-white px-3 text-xs font-semibold ring-1 ring-black/10">{map.panoramas?.some((panorama) => panorama.place_id === selected.id) ? "Заменить панораму" : "Добавить панораму"}<input type="file" accept="image/*" className="sr-only" onChange={(event) => uploadPlacePanorama(event.target.files?.[0])}/></label><Button variant="primary" className="w-full" disabled={panoramaSaving || !map.panoramas?.some((panorama) => panorama.place_id === selected?.id)} onClick={() => void saveSelectedPanorama()}>{panoramaSaving ? "Сохранение…" : "Сохранить панораму"}</Button></Card><Button variant="danger" className="w-full" onClick={deleteSelectedPoint}>Удалить помещение</Button></div> : <div className="rounded-2xl bg-neutral-100 p-4 text-sm text-neutral-500">Создайте точку кликом по плану, чтобы открыть её свойства.</div>}</Card><Card className="p-4"><h2 className="mb-3 font-bold">Публикация</h2><div className="space-y-3"><label className="flex items-center justify-between gap-3 rounded-2xl bg-neutral-100 p-3 text-sm font-semibold">Опубликована<input type="checkbox" checked={map.is_published} onChange={(event) => setMapField({ is_published: event.target.checked })} className="h-5 w-5 accent-[#E30613]" /></label><label className="block text-xs font-semibold text-neutral-600">Доступ<Select value={map.access} onChange={(event) => setMapField({ access: event.target.value as OrganizerMap['access'] })} className="mt-1"><option value="public">Публичная</option><option value="password">По паролю</option></Select></label><div className="rounded-2xl border border-black/5 p-3 text-xs text-neutral-500">Ссылка посетителя:<br /><span className="font-semibold text-ink">/m/{map.slug}</span></div></div></Card><Card className="p-4"><h2 className="mb-3 font-bold">Дорожки</h2>{map.paths.length ? <div className="space-y-2">{map.paths.map((path) => <div key={path.id} className="flex items-center justify-between gap-2 rounded-2xl bg-neutral-100 p-3 text-xs"><span>{map.points.find((point) => point.id === path.from_id)?.title} <span className="px-1 text-brand">→</span> {map.points.find((point) => point.id === path.to_id)?.title}</span><button className="rounded-lg px-2 py-1 font-bold text-brand hover:bg-red-50" aria-label="Удалить дорожку" onClick={() => { setMap((current) => ({ ...current, paths: current.paths.filter((item) => item.id !== path.id) })); setSaveState('Есть несохранённые изменения'); }}>Удалить</button></div>)}</div> : <p className="text-sm text-neutral-500">Выберите точку и нажмите «Создать дорожку», затем выберите вторую точку.</p>}</Card></aside></main><Modal open={leavePromptOpen} title="Есть несохранённые изменения" onClose={() => setLeavePromptOpen(false)}><p className="mb-5 text-sm leading-6 text-neutral-600">Сохранить изменения перед выходом из редактора?</p><div className="flex flex-wrap justify-end gap-2"><Button variant="ghost" onClick={() => setLeavePromptOpen(false)}>Остаться</Button><Button variant="secondary" disabled={saving} onClick={() => { discardChanges(); setLeavePromptOpen(false); window.location.assign(appPath('/app')); }}>Отменить и выйти</Button><Button disabled={saving} onClick={() => { void saveChanges().then((ok) => { if (ok) { setLeavePromptOpen(false); window.location.assign(appPath('/app')); } }); }}>{saving ? 'Сохранение…' : 'Сохранить и выйти'}</Button></div></Modal></div>;
}

export const pointTypeLabel = (point: EditorPoint) => `${point.kind === 'poi' ? 'POI' : 'Узел'} · ${categoryLabel(point.category)}`;

