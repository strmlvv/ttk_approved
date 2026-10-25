import { useEffect, useMemo, useState } from 'react';
import { Card, Input, Spinner } from '../components/ui';
import { getPublicMapDirectory, getPublicPlacesDirectory, type PublicPlaceRecord } from '../api/viewer';
import type { MapData, PoiCategory } from '../lib/api';
import { categoryLabels } from '../viewer/constants';
import { PublicLayout } from '../components/public/PublicLayout';
import { appPath } from '../lib/routing';

export function PublicHomePage() {
  const [maps, setMaps] = useState<MapData[]>([]);
  const [places, setPlaces] = useState<PublicPlaceRecord[]>([]);
  const [query, setQuery] = useState(() => new URLSearchParams(window.location.search).get('q') ?? '');
  const [category, setCategory] = useState<'all' | PoiCategory>('all');
  const [selectedPlace, setSelectedPlace] = useState<PublicPlaceRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    Promise.all([getPublicMapDirectory(), getPublicPlacesDirectory()]).then(([mapItems, placeItems]) => {
      if (!active) return;
      setMaps(mapItems);
      setPlaces(placeItems);
    }).catch((reason) => {
      if (active) setError(reason instanceof Error ? reason.message : 'Не удалось загрузить опубликованные объекты');
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, []);

  const availableCategories = useMemo(() => Array.from(new Set(places.map((place) => place.category))), [places]);
  const filteredPlaces = useMemo(() => {
    const value = query.trim().toLowerCase();
    return places.filter((place) => {
      const text = `${place.name} ${place.description} ${place.mapName}`.toLowerCase();
      return (!value || text.includes(value)) && (category === 'all' || place.category === category);
    });
  }, [places, query, category]);
  const filteredMaps = useMemo(() => {
    const value = query.trim().toLowerCase();
    return maps.filter((map) => !value || `${map.name} ${map.description}`.toLowerCase().includes(value));
  }, [maps, query]);

  return (
    <PublicLayout mapHref="#places">
      <div className="mx-auto max-w-[1200px] px-4 py-8 sm:px-7 sm:py-12">
        <section id="search" className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-slate-200 sm:p-10">
          <p className="text-xs font-bold uppercase tracking-[.2em] text-brand">Публичный каталог</p>
          <h1 className="mt-3 max-w-3xl text-3xl font-extrabold tracking-tight text-ink sm:text-5xl">Магазины и объекты пространства</h1>
          <p className="mt-4 max-w-2xl text-base leading-7 text-slate-600">Здесь отображаются точки, добавленные организаторами на опубликованные публичные карты.</p>
          <div className="mt-7 grid gap-3 sm:grid-cols-[1fr_220px]">
            <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Поиск магазина или помещения" aria-label="Поиск магазина или помещения" />
            <select value={category} onChange={(event) => setCategory(event.target.value as 'all' | PoiCategory)} className="min-h-12 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none focus:ring-2 focus:ring-brand">
              <option value="all">Все категории</option>
              {availableCategories.map((item) => <option key={item} value={item}>{categoryLabels[item]}</option>)}
            </select>
          </div>
        </section>

        <section id="places" className="mt-8">
          <div className="mb-4 flex items-end justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-[.16em] text-slate-400">Из опубликованных карт</p><h2 className="mt-1 text-2xl font-extrabold">Магазины и объекты</h2></div><span className="text-sm text-slate-500">{filteredPlaces.length} объектов</span></div>
          {loading ? <div className="grid place-items-center py-16"><Spinner className="h-8 w-8 text-brand" /></div>
            : error ? <Card className="p-6 text-sm text-brand">{error}</Card>
              : filteredPlaces.length === 0 ? <Card className="p-8 text-center text-sm text-slate-500">Подходящих опубликованных объектов пока нет.</Card>
                : <div className="grid gap-4 md:grid-cols-2">{filteredPlaces.map((place) => <Card key={`${place.mapSlug}:${place.id}`} className="p-5 transition hover:-translate-y-0.5 hover:shadow-md"><div className="flex items-start gap-3"><span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-brand text-2xl text-white">{place.icon ? '•' : categoryLabels[place.category]?.slice(0, 1) ?? '•'}</span><div className="min-w-0"><p className="text-xs font-bold uppercase tracking-[.14em] text-brand">{categoryLabels[place.category]}</p><h3 className="mt-1 text-xl font-bold">{place.name}</h3><p className="mt-2 text-sm leading-6 text-slate-500">{place.description || 'Описание не указано организатором.'}</p><p className="mt-2 text-xs text-slate-400">{place.mapName}{place.floor ? ` · ${place.floor}` : ' · этаж не указан'}</p></div></div><div className="mt-5 flex flex-wrap gap-2"><button type="button" onClick={() => setSelectedPlace(place)} className="min-h-11 rounded-xl bg-brand px-4 text-sm font-bold text-white hover:bg-red-700">Подробнее</button><a href={appPath(`/m/${encodeURIComponent(place.mapSlug)}?poi=${encodeURIComponent(place.id)}#map`)} className="inline-flex min-h-11 items-center rounded-xl bg-white px-4 text-sm font-bold text-ink ring-1 ring-slate-200 hover:bg-slate-50">На карте</a></div></Card>)}</div>}
        </section>

        <section id="maps" className="mt-8">
          <div className="mb-4 flex items-end justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-[.16em] text-slate-400">Доступные пространства</p><h2 className="mt-1 text-2xl font-extrabold">Опубликованные карты</h2></div><span className="text-sm text-slate-500">{filteredMaps.length} карт</span></div>
          <div className="grid gap-4 md:grid-cols-2">{filteredMaps.map((map) => <Card key={map.slug} className="p-5"><p className="text-xs font-bold uppercase tracking-[.14em] text-brand">Карта пространства</p><h3 className="mt-2 text-xl font-bold">{map.name}</h3><p className="mt-2 text-sm text-slate-500">{map.description || 'Интерактивный план с помещениями и навигацией.'}</p><a href={appPath(`/m/${encodeURIComponent(map.slug)}`)} className="mt-5 inline-flex min-h-11 items-center rounded-xl bg-brand px-4 text-sm font-bold text-white hover:bg-red-700">Открыть карту</a></Card>)}</div>
        </section>

        <section id="directions" className="mt-8 rounded-3xl bg-white p-6 ring-1 ring-slate-200 sm:p-8"><h2 className="text-xl font-extrabold">Как добраться внутри пространства</h2><p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">Откройте объект на карте, выберите этаж и используйте построение маршрута по сохранённым дорожкам.</p></section>
      </div>

      {selectedPlace && <div className="fixed inset-0 z-40 grid place-items-center bg-black/40 p-4" role="dialog" aria-modal="true" onMouseDown={() => setSelectedPlace(null)}><Card className="w-full max-w-lg p-6" onMouseDown={(event) => event.stopPropagation()}><div className="flex items-start justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-[.14em] text-brand">{categoryLabels[selectedPlace.category]}</p><h2 className="mt-1 text-2xl font-extrabold">{selectedPlace.name}</h2></div><button type="button" onClick={() => setSelectedPlace(null)} aria-label="Закрыть" className="text-2xl text-slate-400">×</button></div><p className="mt-4 text-sm leading-6 text-slate-600">{selectedPlace.description || 'Описание не указано организатором.'}</p><dl className="mt-5 grid grid-cols-2 gap-3 rounded-2xl bg-slate-50 p-4 text-sm"><div><dt className="text-slate-400">Карта</dt><dd className="mt-1 font-semibold">{selectedPlace.mapName}</dd></div><div><dt className="text-slate-400">Этаж</dt><dd className="mt-1 font-semibold">{selectedPlace.floor || 'Не указан'}</dd></div><div><dt className="text-slate-400">Координаты</dt><dd className="mt-1 font-semibold">{Math.round(selectedPlace.x)}%, {Math.round(selectedPlace.y)}%</dd></div></dl><a href={appPath(`/m/${encodeURIComponent(selectedPlace.mapSlug)}?poi=${encodeURIComponent(selectedPlace.id)}#map`)} className="mt-5 inline-flex min-h-11 items-center rounded-xl bg-brand px-4 text-sm font-bold text-white hover:bg-red-700">Открыть на карте</a></Card></div>}
    </PublicLayout>
  );
}
