import { useCallback, useEffect, useRef, useState, type SetStateAction } from 'react';
import { api, demoMode, HttpError, type CurrentUser } from './api';
import { initialState } from './data';
import type { AppState } from './types';

const storageKey = 'tezkor-partner:v1';
const empty: AppState = { restaurant: '', phone: '', open: false, orders: [], menu: [], couriers: [], hours: [], promotions: [] };
function readDemo(): AppState {
  try {
    const value = JSON.parse(localStorage.getItem(storageKey) || 'null');
    if (value && ['orders', 'menu', 'couriers', 'hours', 'promotions'].every(key => Array.isArray(value[key])) && typeof value.restaurant === 'string') return value;
  } catch { /* Demo storage is optional. */ }
  return structuredClone(initialState);
}
export function usePlatform() {
  const [state, updateState] = useState<AppState>(() => demoMode ? readDemo() : empty);
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [loading, setLoading] = useState(!demoMode);
  const [ready, setReady] = useState(demoMode);
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);
  const [restaurants, setRestaurants] = useState<{ id: number; name: string }[]>([]);
  const restaurantId = useRef<number | undefined>(undefined);
  const busy = useRef(false);
  const refreshBusy = useRef(false);
  const generation = useRef(0);
  const refresh = useCallback(async () => {
    const currentGeneration = generation.current;
    const result = await api<AppState>(`/state${restaurantId.current ? `?restaurantId=${restaurantId.current}` : ''}`);
    if (currentGeneration === generation.current) { updateState(result); setReady(true); }
  }, []);
  const connect = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const who = await api<CurrentUser>('/me'); setUser(who);
      if (who.role === 'ADMIN') {
        const list = await api<{ id: number; name: string }[]>('/restaurants'); setRestaurants(list);
        if (list.length === 0) { updateState(empty); setReady(true); return; }
      }
      await refresh();
    } catch (cause) {
      if (cause instanceof HttpError && cause.status === 401) { setUser(null); setReady(false); }
      else setError((cause as Error).message);
    } finally { setLoading(false); }
  }, [refresh]);
  useEffect(() => { if (!demoMode) void connect(); }, [connect]);
  useEffect(() => {
    if (!demoMode) return;
    try { localStorage.setItem(storageKey, JSON.stringify(state)); }
    catch { setError('Brauzer xotirasi mavjud emas. Demo o‘zgarishlar faqat joriy sessiyada saqlanadi.'); }
  }, [state]);
  useEffect(() => {
    if (demoMode || !user || !ready) return;
    const timer = setInterval(() => {
      if (busy.current || refreshBusy.current || document.hidden) return;
      refreshBusy.current = true;
      void refresh().then(() => setError('')).catch(cause => {
        if (cause instanceof HttpError && cause.status === 401) { generation.current++; setUser(null); setReady(false); updateState(empty); }
        setError((cause as Error).message);
      }).finally(() => { refreshBusy.current = false; });
    }, 10_000);
    return () => clearInterval(timer);
  }, [user, ready, refresh]);
  async function login(email: string, password: string) {
    setPending(true); setError('');
    try { await api('/auth/login', 'POST', { email, password }); await connect(); }
    catch (cause) { setError((cause as Error).message); }
    finally { setPending(false); }
  }
  async function logout() {
    setPending(true);
    try {
      await api('/auth/logout', 'POST'); generation.current++; setUser(null); updateState(empty); setReady(false); restaurantId.current = undefined;
    } catch (cause) { setError((cause as Error).message); }
    finally { setPending(false); }
  }
  async function mutate(path: string, method: string, body?: unknown) {
    if (busy.current) return false;
    busy.current = true; generation.current++; setPending(true); setError('');
    let saved = false;
    try {
      const separator = path.includes('?') ? '&' : '?';
      await api(state.restaurantId ? `${path}${separator}restaurantId=${state.restaurantId}` : path, method, body); saved = true;
      if (user?.role === 'ADMIN') setRestaurants(await api('/restaurants'));
      await refresh(); return true;
    } catch (cause) {
      if (cause instanceof HttpError && cause.status === 401) { setUser(null); setReady(false); updateState(empty); }
      const message = saved ? `Amal saqlandi, lekin ro‘yxat yangilanmadi. ${(cause as Error).message}` : (cause as Error).message;
      setError(message);
      if (cause instanceof HttpError && cause.status === 409) await refresh().catch(() => {});
      return false;
    } finally { busy.current = false; setPending(false); }
  }
  async function selectRestaurant(id: number) {
    if (busy.current) return false;
    generation.current++; restaurantId.current = id; updateState(empty); setReady(false); setLoading(true);
    try { await refresh(); setError(''); return true; } catch (cause) { setError((cause as Error).message); return false; } finally { setLoading(false); }
  }
  function setState(value: SetStateAction<AppState>) {
    // Local mutations are reserved for the explicitly enabled standalone demo.
    if (demoMode) updateState(value);
  }
  return { state, setState, demo: demoMode, user, loading, ready, pending, error, refresh: connect, login, logout, mutate, restaurants, selectRestaurant };
}
export type Platform = ReturnType<typeof usePlatform>;
