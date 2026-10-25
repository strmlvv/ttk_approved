import { useEffect, useState } from 'react';
import { getPublishedMapBySlug, type MapData } from '../api/viewer';
import { Button, Card, Spinner } from '../components/ui';
import { Viewer } from '../viewer/Viewer';
import { getSupabaseConfigurationError } from '../api/client';
import { PublicLayout } from '../components/public/PublicLayout';

export function ViewerPage({ slug, embed = false }: { slug: string; embed?: boolean }) {
  const [map, setMap] = useState<MapData | null>(null);
  const [status, setStatus] = useState<'loading'|'not_found'|'ready'>('loading');
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    getPublishedMapBySlug(slug).then((data) => {
      if (!active) return;
      setMap(data);
      setStatus(data ? 'ready' : 'not_found');
    }).catch((reason) => {
      if (active) {
        setError(reason instanceof Error ? reason.message : 'Не удалось загрузить карту');
        setStatus('not_found');
      }
    });
    return () => { active = false; };
  }, [slug]);

  const content = status === 'loading'
    ? <div className="grid min-h-[60vh] place-items-center"><Spinner className="h-8 w-8 text-brand" /></div>
    : error || getSupabaseConfigurationError()
      ? <div className="grid min-h-[60vh] place-items-center p-5"><Card className="max-w-sm p-6 text-center"><h1 className="text-xl font-bold">Карта пока недоступна</h1><p className="mt-2 text-sm text-neutral-500">{error || getSupabaseConfigurationError()}</p></Card></div>
      : status === 'not_found'
        ? <div className="grid min-h-[60vh] place-items-center p-5"><Card className="max-w-sm p-6 text-center"><div className="mb-3 text-4xl">⌁</div><h1 className="text-xl font-bold">Карта не найдена</h1><p className="mt-2 text-sm text-neutral-500">Проверьте ссылку или обратитесь к администратору пространства.</p><Button className="mt-5" onClick={() => window.history.back()}>Назад</Button></Card></div>
        : <Viewer map={map!} embed={embed} initialQuery={new URLSearchParams(window.location.search).get('q') ?? ''} initialPoiId={new URLSearchParams(window.location.search).get('poi') ?? undefined} />;

  return embed ? content : <PublicLayout mapSlug={slug}>{content}</PublicLayout>;
}
