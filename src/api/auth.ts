import { getSupabaseClient, getSupabaseConfigurationError, isSupabaseEnabledFromEnv, isSupabaseFallbackMode, SUPABASE_FALLBACK_KEY, assertNoSupabaseError } from './client';
import { mockOrganizer } from '../mocks/mockData';
import type { Organizer } from '../types';
const withTimeout = <T,>(promise: Promise<T>, ms: number) => Promise.race([promise, new Promise<T>((_, reject) => window.setTimeout(() => reject(new Error('Supabase не ответил вовремя')), ms))]);
const isDemoCredentials = (email: string, password: string) => (email === 'organizer' || email === mockOrganizer.email) && password === 'ttk-demo-2026';
export async function getCurrentOrganizer(): Promise<Organizer | null> { if (isSupabaseEnabledFromEnv() && getSupabaseConfigurationError()) throw new Error(getSupabaseConfigurationError()!); const client = getSupabaseClient(); if (!client) return mockOrganizer; const { data: sessionData } = await withTimeout(client.auth.getSession(), 10000); const sessionUser = sessionData.session?.user; if (sessionUser) return { id: sessionUser.id, email: sessionUser.email ?? '' }; return null; }
export async function signInOrganizer(email: string, password: string): Promise<Organizer> {
  if (isSupabaseEnabledFromEnv() && getSupabaseConfigurationError()) throw new Error(getSupabaseConfigurationError()!);
  const client = getSupabaseClient();
  if (!client) { if (isDemoCredentials(email, password)) return mockOrganizer; throw new Error('Неверный логин или пароль'); }
  try {
    const { data, error } = await withTimeout(client.auth.signInWithPassword({ email, password }), 12000);
    assertNoSupabaseError(error);
    if (!data.user) throw new Error('Не удалось войти');
    window.localStorage.removeItem(SUPABASE_FALLBACK_KEY);
    return { id: data.user.id, email: data.user.email ?? '' };
  } catch (error) {
    if (isDemoCredentials(email, password) && error instanceof Error && /Supabase не ответил|fetch|network|timeout/i.test(error.message)) {
      window.localStorage.setItem(SUPABASE_FALLBACK_KEY, 'true');
      window.localStorage.setItem('ttk-organizer-session', 'active');
      return mockOrganizer;
    }
    throw error;
  }
}
export async function signOutOrganizer(): Promise<void> { if (isSupabaseFallbackMode()) { window.localStorage.removeItem(SUPABASE_FALLBACK_KEY); return; } const client = getSupabaseClient(); if (!client) return; const { error } = await withTimeout(client.auth.signOut(), 10000); assertNoSupabaseError(error); }
export async function requireOrganizer(): Promise<Organizer> { const organizer = await getCurrentOrganizer(); if (!organizer) throw new Error('Требуется авторизация организатора'); return organizer; }
export async function checkSupabaseConnection(): Promise<{ ok: boolean; error?: string }> { const client = getSupabaseClient(); if (!client) return { ok: false, error: 'Supabase client не настроен. Включите VITE_SUPABASE_ENABLED и задайте URL и publishable/anon key.' }; const { error } = await client.from('maps').select('id').limit(1); if (error) return { ok: false, error: error.message }; return { ok: true }; }
