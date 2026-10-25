type PublicFooterProps = {
  mapSlug?: string;
  mapHref?: string;
};

export function PublicFooter({ mapSlug = 'central', mapHref }: PublicFooterProps) {
  return (
    <footer className="safe-bottom border-t border-slate-200 bg-white">
      <div className="mx-auto grid max-w-[1600px] gap-6 px-4 py-8 sm:grid-cols-[1fr_auto] sm:px-7">
        <div>
          <p className="font-bold text-ink">Карта пространства</p>
          <p className="mt-2 max-w-xl text-sm leading-6 text-slate-500">
            Интерактивные карты помещений для удобной навигации посетителей.
          </p>
          <p className="mt-4 text-xs text-slate-400">© {new Date().getFullYear()} Карта пространства</p>
        </div>
        <nav aria-label="Ссылки в подвале" className="flex flex-col items-start gap-2 text-sm text-slate-600 sm:items-end">
          <a href="/" className="font-semibold hover:text-ink">Главная</a>
          <a href={mapHref ?? `/m/${encodeURIComponent(mapSlug)}`} className="font-semibold hover:text-ink">Карта</a>
          <a href="/organizer/login" className="mt-2 text-xs text-slate-400 transition hover:text-slate-600">Для организаторов</a>
        </nav>
      </div>
    </footer>
  );
}
