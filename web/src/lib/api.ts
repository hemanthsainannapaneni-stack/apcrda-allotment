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

export async function api<T = any>(path: string, options: Options = {}): Promise<T> {
  const headers = new Headers(options.headers);
  if (!(options.body instanceof FormData) && options.body) {
    headers.set('Content-Type', 'application/json');
  }
  if (tokens.access) headers.set('Authorization', `Bearer ${tokens.access}`);

  const res = await fetch(path.startsWith('/api') ? path : `/api${path}`, { ...options, headers });

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

  if (!res.ok) {
    throw new ApiError(res.status, data?.error ?? `Request failed (${res.status})`, data?.details);
  }
  return data as T;
}

function safeJson(text: string) {
  try {
    return JSON.parse(text);
  } catch {
    return { error: text };
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
