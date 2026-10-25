import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from './database.types';
export type SupabaseClientLike = SupabaseClient<Database>;
let supabaseClient: SupabaseClientLike | null = null;
let supabaseConfigurationError: string | null = null;
export const isSupabaseEnabledFromEnv = () => import.meta.env.VITE_SUPABASE_ENABLED === 'true';
export const SUPABASE_FALLBACK_KEY = 'ttk-supabase-local-fallback';
export const isSupabaseFallbackMode = () => typeof window !== 'undefined' && window.localStorage.getItem(SUPABASE_FALLBACK_KEY) === 'true';
export function configureSupabaseClient(client: SupabaseClientLike) { supabaseClient = client; supabaseConfigurationError = null; }
export function configureSupabaseFromEnv() { const enabled = isSupabaseEnabledFromEnv(); const url = import.meta.env.VITE_SUPABASE_URL as string | undefined; const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined; if (!enabled) { supabaseClient = null; supabaseConfigurationError = null; return; } let validUrl = false; try { const parsed = new URL(url ?? ''); validUrl = parsed.protocol === 'https:' || (parsed.protocol === 'http:' && ['localhost','127.0.0.1'].includes(parsed.hostname)); } catch { validUrl = false; } if (!validUrl || !key) { supabaseClient = null; supabaseConfigurationError = 'Supabase включён, но URL или publishable/anon key не заданы корректно'; return; } let tokenRole = ''; try { const payload = key.split('.')[1]; if (payload) tokenRole = JSON.parse(atob(payload.replace(/-/g,'+').replace(/_/g,'/'))).role ?? ''; } catch { /* New publishable keys are opaque rather than JWTs. */ } if (tokenRole === 'service_role' || /^sb_secret_/i.test(key) || /service[_-]?role/i.test(key)) { supabaseClient = null; supabaseConfigurationError = 'Service role / secret key запрещён во фронтенде. Используйте publishable/anon key.'; return; } supabaseClient = createClient<Database>(url!, key, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } }); supabaseConfigurationError = null; }
export function getSupabaseClient() { return isSupabaseFallbackMode() ? null : supabaseClient; }
export const isSupabaseConfigured = () => supabaseClient !== null;
export const getSupabaseConfigurationError = () => supabaseConfigurationError;
export class ApiError extends Error { constructor(message: string, public readonly code = 'API_ERROR') { super(message); this.name = 'ApiError'; } }
export function assertNoSupabaseError(error: { message?: string; code?: string } | null | undefined): void { if (error) throw new ApiError(error.message || 'Ошибка запроса к базе данных', error.code || 'SUPABASE_ERROR'); }
