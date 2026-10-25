import { useEffect, useState } from 'react';
import { Button, Card, Spinner } from '../components/ui';
import { getMapById } from '../editor/repository';
import { Editor } from '../editor/Editor';
import type { OrganizerMap } from '../editor/types';
import { getSupabaseConfigurationError } from '../api/client';
import { appPath } from '../lib/routing';

export function EditorPage({ id }: { id: string }) {
  const [map, setMap] = useState<OrganizerMap | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    void getMapById(id)
      .then((value) => { if (active) setMap(value); })
      .catch((reason) => { if (active) setError(reason instanceof Error ? reason.message : 'Не удалось загрузить карту'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [id]);
  if (getSupabaseConfigurationError()) return <div className="grid min-h-screen place-items-center p-5"><Card className="max-w-md p-6 text-center"><h1 className="text-lg font-bold">Ошибка настроек Supabase</h1><p className="mt-2 text-sm text-neutral-600">{getSupabaseConfigurationError()}</p></Card></div>;
  if (loading) return <div className="grid min-h-screen place-items-center"><Spinner className="h-8 w-8 text-brand" /></div>;
  if (error || !map) return <div className="grid min-h-screen place-items-center p-5"><Card className="max-w-md p-8 text-center"><h1 className="text-xl font-bold">{error ? 'Ошибка загрузки карты' : 'Карта не найдена'}</h1><p className="mt-2 text-sm text-neutral-500">{error || 'Проверьте идентификатор карты.'}</p><Button className="mt-4" onClick={() => window.location.assign(appPath('/app'))}>В кабинет</Button></Card></div>;
  return <Editor key={map.id} initialMap={map} />;
}
