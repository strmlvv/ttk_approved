import { useState, type FormEvent } from 'react';
import { Input } from '../ui';
import { appPath } from '../../lib/routing';

type PublicHeaderProps = {
  mapSlug?: string;
  mapHref?: string;
};

export function PublicHeader({ mapSlug = 'central', mapHref }: PublicHeaderProps) {
  const [search, setSearch] = useState('');
  const submitSearch = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const params = new URLSearchParams();
    if (search.trim()) params.set('q', search.trim());
    window.location.assign(`${appPath('/')}${params.size ? `?${params.toString()}#places` : '#search'}`);
  };
  return (
    <header className="safe-top border-b border-slate-200/80 bg-white/95 backdrop-blur">
      <div className="mx-auto flex min-h-16 max-w-[1600px] items-center justify-between gap-4 px-4 sm:px-7">
        <a href={appPath('/')} className="flex min-w-0 items-center gap-3 text-ink" aria-label="Карта пространства — главная">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-brand text-sm font-black text-white shadow-sm">КП</span>
          <span className="min-w-0">
            <span className="block truncate text-xs font-bold uppercase tracking-[.16em] text-brand">Карта пространства</span>
            <span className="block truncate text-sm font-semibold text-slate-700">Интерактивная навигация</span>
          </span>
        </a>

        <div className="flex items-center gap-2">
          <nav aria-label="Публичная навигация" className="hidden items-center gap-1 text-sm font-semibold text-slate-600 sm:flex">
            <a href={appPath(mapHref ?? `/m/${encodeURIComponent(mapSlug)}`)} className="rounded-xl px-2 py-2 transition hover:bg-slate-100 hover:text-ink md:px-3">Карта</a>
            <a href={`${appPath('/')}#places`} className="rounded-xl px-2 py-2 transition hover:bg-slate-100 hover:text-ink md:px-3">Магазины</a>
            <a href={`${appPath('/')}#directions`} className="hidden rounded-xl px-2 py-2 transition hover:bg-slate-100 hover:text-ink lg:inline-flex lg:px-3">Как добраться</a>
          </nav>
          <form onSubmit={submitSearch} className="hidden items-center gap-2 md:flex">
            <Input value={search} onChange={(event) => setSearch(event.target.value)} className="min-h-10 w-36 rounded-xl px-3 lg:w-48" placeholder="Найти магазин" aria-label="Поиск магазина или помещения" />
            <button type="submit" className="min-h-10 rounded-xl bg-brand px-3 text-sm font-semibold text-white hover:bg-red-700" aria-label="Искать">⌕</button>
          </form>
          <details className="relative sm:hidden">
            <summary className="grid h-10 w-10 cursor-pointer list-none place-items-center rounded-xl bg-slate-100 text-lg text-slate-700" aria-label="Открыть меню">☰</summary>
            <div className="absolute right-0 top-12 z-30 grid min-w-52 gap-1 rounded-2xl bg-white p-2 shadow-xl ring-1 ring-slate-200">
              <a href={appPath(mapHref ?? `/m/${encodeURIComponent(mapSlug)}`)} className="rounded-xl px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100">Карта</a>
              <a href={`${appPath('/')}#places`} className="rounded-xl px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100">Магазины</a>
              <a href={`${appPath('/')}#directions`} className="rounded-xl px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100">Как добраться</a>
              <a href={`${appPath('/')}#search`} className="rounded-xl px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100">Поиск</a>
            </div>
          </details>
        </div>
      </div>
    </header>
  );
}
