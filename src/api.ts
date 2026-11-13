export interface CurrentUser {
  id: number; name: string; email: string; role: 'ADMIN' | 'EMPLOYEE' | 'COURIER';
  restaurantId: number | null; courierId: number | null; isDemo: boolean;
}
export class HttpError extends Error {
  constructor(public status: number, public code: string, message: string) { super(message); }
}
const env = (import.meta as ImportMeta & { env: Record<string, string> }).env;
export const demoMode = env.VITE_DEMO_MODE === 'true';
const base = env.VITE_API_BASE || '/api/v1';
export async function api<T>(path: string, method = 'GET', body?: unknown): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${base}${path}`, {
      method, credentials: 'same-origin', headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'TezkorPartner' },
      body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(15_000),
    });
  } catch { throw new HttpError(0, 'NETWORK_ERROR', 'Backend bilan aloqa yo‘q. Server va PostgreSQL ishga tushganini tekshiring.'); }
  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload || !('data' in payload)) throw new HttpError(response.status, payload?.error?.code ?? 'SERVER_UNAVAILABLE', payload?.error?.message ?? 'API javob bermadi. Backend ishga tushganini tekshiring.');
  return payload.data as T;
}
