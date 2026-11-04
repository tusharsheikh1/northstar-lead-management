import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Database } from '../types';
import { api, ApiError } from '../api/client';

type State = { status: 'loading' } | { status: 'anon'; error?: string } | { status: 'authed'; initial: Database };

interface Session {
  state: State;
  login: (email: string, password: string) => Promise<void>;
  register: (input: { name: string; email: string; password: string; workspaceName: string; sampleData: boolean }) => Promise<void>;
  logout: () => Promise<void>;
}

const Ctx = createContext<Session | null>(null);
export const useSession = () => {
  const c = useContext(Ctx);
  if (!c) throw new Error('useSession outside SessionProvider');
  return c;
};

export function SessionProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<State>({ status: 'loading' });

  useEffect(() => {
    api.get<{ data: Database }>('/auth/me')
      .then((r) => setState({ status: 'authed', initial: r.data }))
      .catch((e) => setState({ status: 'anon', error: e instanceof ApiError && e.status === 0 ? e.message : undefined }));
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const r = await api.post<{ data: Database }>('/auth/login', { email, password });
    setState({ status: 'authed', initial: r.data });
  }, []);
  const register = useCallback(async (input: Parameters<Session['register']>[0]) => {
    const r = await api.post<{ data: Database }>('/auth/register', input);
    setState({ status: 'authed', initial: r.data });
  }, []);
  const logout = useCallback(async () => {
    await api.post('/auth/logout').catch(() => {});
    setState({ status: 'anon' });
  }, []);

  const value = useMemo(() => ({ state, login, register, logout }), [state, login, register, logout]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
