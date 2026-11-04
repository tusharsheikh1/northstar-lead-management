import type { Database } from '../types';

export class ApiError extends Error {
  constructor(public status: number, message: string, public fields?: Record<string, string>) { super(message); }
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`/api${path}`, {
      method, credentials: 'same-origin',
      headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError(0, 'Cannot reach the server. Check your connection and that the API is running.');
  }
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, json.error ?? `Request failed (${res.status}).`, json.fields);
  return json as T;
}

/** Mutations respond with the new result plus the fresh workspace snapshot. */
export interface Mutation<R = unknown> { result: R; data: Database }

export const api = {
  get: <T>(p: string) => request<T>('GET', p),
  post: <T = Mutation>(p: string, b?: unknown) => request<T>('POST', p, b ?? {}),
  patch: <T = Mutation>(p: string, b?: unknown) => request<T>('PATCH', p, b ?? {}),
  del: <T = Mutation>(p: string, b?: unknown) => request<T>('DELETE', p, b),
};
