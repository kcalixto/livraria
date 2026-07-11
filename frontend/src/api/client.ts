const BASE_URL = import.meta.env.VITE_API_URL as string;
const API_KEY = import.meta.env.VITE_API_KEY as string;

export class ApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    ...init,
    // gate global do back: toda chamada leva a chave de api do front
    headers: { 'x-api-key': API_KEY, ...(init.headers as Record<string, string>) },
  });
  if (!res.ok) {
    throw new ApiError(res.status, `${init.method ?? 'GET'} ${path} -> ${res.status}`);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export function apiGet<T>(path: string): Promise<T> {
  return request<T>(path);
}

export function apiPost<T>(path: string, body: unknown): Promise<T> {
  return request<T>(path, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function bearer(): Record<string, string> {
  const token = sessionStorage.getItem('livraria:token');
  return token ? { authorization: `Bearer ${token}` } : {};
}

export function apiAuthGet<T>(path: string): Promise<T> {
  return request<T>(path, { headers: bearer() });
}

function apiAuthWrite<T>(method: 'POST' | 'PUT' | 'PATCH', path: string, body: unknown): Promise<T> {
  return request<T>(path, {
    method,
    headers: { 'content-type': 'application/json', ...bearer() },
    body: JSON.stringify(body),
  });
}

export function apiAuthPost<T>(path: string, body: unknown): Promise<T> {
  return apiAuthWrite<T>('POST', path, body);
}

export function apiAuthPut<T>(path: string, body: unknown): Promise<T> {
  return apiAuthWrite<T>('PUT', path, body);
}

export function apiAuthPatch<T>(path: string, body: unknown): Promise<T> {
  return apiAuthWrite<T>('PATCH', path, body);
}

export function apiAuthDelete<T>(path: string): Promise<T> {
  return request<T>(path, { method: 'DELETE', headers: bearer() });
}
