import { useEffect, useState, type ReactNode } from 'react';
import { Card, Spinner } from '../components/ui';
import { getCurrentOrganizer } from '../api/auth';
import { getSupabaseClient, getSupabaseConfigurationError } from '../api/client';
import { isOrganizerAuthenticated } from './frontendAuth';
export function OrganizerGate({ children, onUnauthorized }: { children: ReactNode; onUnauthorized: () => void }) {
  const [status, setStatus] = useState<'checking'|'ready'|'denied'>('checking');
  useEffect(() => { let active = true; void Promise.resolve().then(getCurrentOrganizer).then((user) => { if (!active) return; const ok = getSupabaseClient() ? Boolean(user) : isOrganizerAuthenticated(); setStatus(ok ? 'ready' : 'denied'); if (!ok) onUnauthorized(); }).catch(() => { if (active) { setStatus('denied'); onUnauthorized(); } }); return () => { active = false; }; }, []);
  if (status === 'checking') return <div className="grid min-h-screen place-items-center"><Spinner className="h-8 w-8 text-brand" /></div>;
  if (getSupabaseConfigurationError()) return <div className="grid min-h-screen place-items-center p-5"><Card className="max-w-md p-6 text-center"><h1 className="text-lg font-bold">Ошибка настроек Supabase</h1><p className="mt-2 text-sm text-neutral-600">{getSupabaseConfigurationError()}</p></Card></div>;
  if (status === 'denied') return <div className="grid min-h-screen place-items-center p-5"><Card className="p-6 text-center"><h1 className="text-lg font-bold">Выполняется переход ко входу</h1></Card></div>;
  return <>{children}</>;
}
