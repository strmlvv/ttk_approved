import { useEffect, useState } from 'react';
import { Button, Card, Input, Modal, Spinner } from '../components/ui';
import { createMap, getMapById, getMyMaps, saveMapSnapshot } from '../editor/repository';
import type { OrganizerMap } from '../editor/types';
import { ORGANIZER_SESSION_KEY } from '../auth/frontendAuth';
import { signOutOrganizer } from '../api/auth';
import { isSupabaseEnabledFromEnv } from '../api/client';
import { getSupabaseConfigurationError } from '../api/client';
import { appPath } from '../lib/routing';

export function MyMapsPage() {
  const [maps, setMaps] = useState<OrganizerMap[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [actionError, setActionError] = useState('');
  const [publishingMapId, setPublishingMapId] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');

  useEffect(() => {
    let active = true;
    void getMyMaps()
      .then((items) => { if (active) setMaps(items); })
      .catch((error) => { if (active) setLoadError(error instanceof Error ? error.message : 'Не удалось загрузить карты'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  if (getSupabaseConfigurationError()) return <div className="grid min-h-screen place-items-center p-5"><Card className="max-w-md p-6 text-center"><h1 className="text-lg font-bold">Ошибка настроек Supabase</h1><p className="mt-2 text-sm text-neutral-600">{getSupabaseConfigurationError()}</p></Card></div>;

  const create = async () => {
    setActionError('');
    try {
      const map = await createMap(name);
      setMaps((current) => [map, ...current]);
      setName('');
      setOpen(false);
      window.location.assign(appPath(`/app/maps/${map.id}`));
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Не удалось создать карту');
    }
  };

  const togglePublished = async (map: OrganizerMap, is_published: boolean) => {
    setActionError('');
    setPublishingMapId(map.id);
    try {
      // The list query intentionally loads only map rows. Fetch the complete
      // aggregate before calling the existing atomic snapshot RPC so changing
      // publication cannot accidentally replace points, paths or panoramas
      // with an incomplete snapshot.
      const current = await getMapById(map.id);
      if (!current) throw new Error('Карта не найдена или недоступна текущему организатору');
      const { map: saved } = await saveMapSnapshot({ ...current, is_published });
      setMaps((items) => items.map((item) => item.id === map.id
        ? { ...item, is_published: saved.is_published, updated_at: saved.updated_at }
        : item));
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Не удалось обновить публикацию');
    } finally {
      setPublishingMapId(null);
    }
  };

  const logout = async () => {
    try { await signOutOrganizer(); } finally {
      window.localStorage.removeItem(ORGANIZER_SESSION_KEY);
      window.location.assign(appPath('/organizer/login'));
    }
  };

  return <div className="min-h-screen bg-[#f5f5f3] text-ink">
    <header className="safe-top border-b border-black/5 bg-white"><div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-4 sm:px-6"><div><p className="text-xs font-bold uppercase tracking-[.2em] text-brand">Карта пространства</p><h1 className="text-2xl font-extrabold">Кабинет организатора</h1></div><div className="flex items-center gap-2"><Button variant="secondary" onClick={() => void logout()}>Выйти</Button><Button onClick={() => { setActionError(''); setOpen(true); }}>+ Создать новую карту</Button></div></div></header>
    <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6"><div className="mb-6 flex items-end justify-between"><p className="text-sm text-neutral-500">Создавайте комнаты, редактируйте планы и публикуйте навигацию для посетителей. Изменения карты применяются кнопкой ручного сохранения в редакторе.</p><span className="text-sm text-neutral-500">{maps.length} карт</span></div>
      {actionError && <Card className="mb-4 p-3 text-sm text-brand">{actionError}</Card>}{loading ? <div className="grid place-items-center py-20"><Spinner className="h-8 w-8 text-brand" /></div> : loadError ? <Card className="p-5 text-sm text-brand">Не удалось загрузить кабинет: {loadError}</Card> : maps.length === 0 ? <Card className="p-10 text-center"><h2 className="text-xl font-bold">Пока нет карт</h2><p className="mt-2 text-sm text-neutral-500">Создайте первую карту пространства.</p><Button className="mt-5" onClick={() => setOpen(true)}>Создать карту</Button></Card> : <div className="grid gap-4 md:grid-cols-2">{maps.map((map) => <Card key={map.id} className="p-5"><div className="flex items-start justify-between gap-3"><div><h2 className="text-lg font-bold">{map.name}</h2><p className="mt-1 text-sm text-neutral-500">Посетитель: /m/{map.slug}</p><p className="mt-1 text-xs text-neutral-500">Доступ: {map.access === 'public' ? 'публичный' : 'по паролю'}</p></div><label className="flex items-center gap-2 text-xs font-medium"><input type="checkbox" checked={map.is_published} disabled={publishingMapId === map.id} onChange={(event) => void togglePublished(map, event.target.checked)} className="h-4 w-4 accent-[#E30613]"/> {publishingMapId === map.id ? 'Сохранение…' : 'Опубликована'}</label><span className={`rounded-full px-3 py-1 text-xs font-bold ${map.is_published ? 'bg-green-50 text-green-700' : 'bg-neutral-100 text-neutral-500'}`}>{map.is_published ? 'Опубликована' : 'Черновик'}</span></div><div className="mt-5 flex flex-wrap gap-2"><Button onClick={() => window.location.assign(appPath(`/app/maps/${map.id}`))}>Редактировать карту</Button><Button variant="secondary" disabled={!map.is_published} onClick={() => window.open(appPath(`/m/${map.slug}`), '_blank')}>Открыть для посетителей</Button></div></Card>)}</div>}
    </main>
    <Modal open={open} title="Новая карта / комната" onClose={() => setOpen(false)}><p className="mb-4 text-sm text-neutral-500">Укажите название. Уникальный латинский slug будет создан автоматически.</p><Input autoFocus value={name} onChange={(event) => setName(event.target.value)} placeholder="Например, Отель Москва" />{actionError && <p className="mt-3 text-sm text-brand">{actionError}</p>}<div className="mt-4 flex justify-end gap-2"><Button variant="secondary" onClick={() => setOpen(false)}>Отмена</Button><Button disabled={!name.trim()} onClick={() => void create()}>Создать</Button></div></Modal>
    {!isSupabaseEnabledFromEnv() && <p className="sr-only">Кабинет работает в локальном демо-режиме.</p>}
  </div>;
}

