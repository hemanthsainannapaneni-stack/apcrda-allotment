const ACCESS_KEY = 'apcrda.access';
const REFRESH_KEY = 'apcrda.refresh';

export class ApiError extends Error {
  status: number;
  details?: any;
  constructor(status: number, message: string, details?: any) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

export const tokens = {
  get access() {
    return localStorage.getItem(ACCESS_KEY);
  },
  get refresh() {
    return localStorage.getItem(REFRESH_KEY);
  },
  set(access: string, refresh: string) {
    localStorage.setItem(ACCESS_KEY, access);
    localStorage.setItem(REFRESH_KEY, refresh);
  },
  clear() {
    localStorage.removeItem(ACCESS_KEY);
    localStorage.removeItem(REFRESH_KEY);
  },
};

/** Fired when the refresh token is gone too — the shell redirects to /login. */
export const onSessionLost = new Set<() => void>();

let refreshing: Promise<boolean> | null = null;

async function tryRefresh(): Promise<boolean> {
  if (!tokens.refresh) return false;
  // Collapse parallel 401s into one refresh round-trip.
  refreshing ??= (async () => {
    try {
      const res = await fetch('/api/auth/refresh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken: tokens.refresh }),
      });
      if (!res.ok) return false;
      const data = await res.json();
      tokens.set(data.accessToken, data.refreshToken);
      return true;
    } catch {
      return false;
    } finally {
      setTimeout(() => {
        refreshing = null;
      }, 0);
    }
  })();
  return refreshing;
}

type Options = RequestInit & { raw?: boolean; retry?: boolean };

/**
 * Where the API lives. Empty (the default) means "same origin" — the Vite dev
 * proxy in development, and the /api redirect in a deployed build. Set
 * VITE_API_URL to point a static frontend at an API hosted somewhere else.
 */
const API_BASE = (import.meta.env.VITE_API_URL ?? '').replace(/\/+$/, '');

export function apiUrl(path: string) {
  const rel = path.startsWith('/api') ? path : `/api${path}`;
  return `${API_BASE}${rel}`;
}

export async function api<T = any>(path: string, options: Options = {}): Promise<T> {
  const headers = new Headers(options.headers);
  if (!(options.body instanceof FormData) && options.body) {
    headers.set('Content-Type', 'application/json');
  }
  if (tokens.access) headers.set('Authorization', `Bearer ${tokens.access}`);

  const res = await fetch(apiUrl(path), { ...options, headers });

  if (res.status === 401 && options.retry !== false) {
    const ok = await tryRefresh();
    if (ok) return api<T>(path, { ...options, retry: false });
    tokens.clear();
    onSessionLost.forEach((fn) => fn());
    throw new ApiError(401, 'Your session has expired. Please sign in again.');
  }

  if (options.raw) {
    if (!res.ok) throw new ApiError(res.status, await res.text());
    return res as unknown as T;
  }

  const text = await res.text();
  const data = text ? safeJson(text) : null;

  if (data === NOT_JSON) {
    // The API is not answering — usually the frontend is deployed without a
    // backend, so the host's own 404/502 page comes back instead of JSON.
    // Never render that page into the UI; say what is actually wrong.
    throw new ApiError(
      res.status,
      res.status === 404
        ? 'The server could not be reached — no API is responding at this address. ' +
          'If this is a deployed site, check that the backend is running and that /api requests reach it.'
        : `The server returned an unexpected response (${res.status}). Please try again, or contact the administrator if it continues.`
    );
  }

  if (!res.ok) {
    throw new ApiError(res.status, data?.error ?? `Request failed (${res.status})`, data?.details);
  }
  return data as T;
}

/** Sentinel: the body was not JSON at all, so there is no error message to show. */
const NOT_JSON = Symbol('not-json') as unknown as any;

function safeJson(text: string) {
  try {
    return JSON.parse(text);
  } catch {
    return NOT_JSON;
  }
}

export const get = <T = any,>(path: string) => api<T>(path);
export const post = <T = any,>(path: string, body?: any) =>
  api<T>(path, { method: 'POST', body: body === undefined ? undefined : JSON.stringify(body) });
export const patch = <T = any,>(path: string, body: any) =>
  api<T>(path, { method: 'PATCH', body: JSON.stringify(body) });
export const put = <T = any,>(path: string, body: any) =>
  api<T>(path, { method: 'PUT', body: JSON.stringify(body) });
export const del = <T = any,>(path: string) => api<T>(path, { method: 'DELETE' });

export async function upload<T = any>(path: string, form: FormData) {
  return api<T>(path, { method: 'POST', body: form });
}

/** Streams a report export straight to the browser's downloads. */
export async function download(path: string, filename: string) {
  const res = await api<Response>(path, { raw: true });
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/** Turns a filter object into a query string, dropping empty/ALL values. */
export function qs(params: Record<string, any>) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '' || value === 'ALL') continue;
    search.set(key, String(value));
  }
  const s = search.toString();
  return s ? `?${s}` : '';
}
