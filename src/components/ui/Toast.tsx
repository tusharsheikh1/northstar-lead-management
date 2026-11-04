import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { AlertCircle, CheckCircle2, Info, X } from 'lucide-react';

type Kind = 'success' | 'error' | 'info';
interface ToastItem { id: number; kind: Kind; message: string }
interface ToastApi { success: (m: string) => void; error: (m: string) => void; info: (m: string) => void }

const Ctx = createContext<ToastApi | null>(null);
export const useToast = () => {
  const c = useContext(Ctx);
  if (!c) throw new Error('useToast outside ToastProvider');
  return c;
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const dismiss = useCallback((id: number) => setItems((xs) => xs.filter((x) => x.id !== id)), []);
  const push = useCallback((kind: Kind, message: string) => {
    const id = Date.now() + Math.random();
    setItems((xs) => [...xs.slice(-3), { id, kind, message }]);
    setTimeout(() => dismiss(id), kind === 'error' ? 6000 : 3800);
  }, [dismiss]);
  const api = useMemo<ToastApi>(() => ({
    success: (m) => push('success', m), error: (m) => push('error', m), info: (m) => push('info', m),
  }), [push]);
  const Icon = { success: CheckCircle2, error: AlertCircle, info: Info };
  const tone = { success: 'text-emerald-600', error: 'text-red-600', info: 'text-primary-500' };
  return (
    <Ctx.Provider value={api}>
      {children}
      <div className="no-print pointer-events-none fixed bottom-4 right-4 z-[100] flex w-[calc(100%-2rem)] max-w-sm flex-col gap-2" role="region" aria-label="Notifications">
        {items.map((t) => {
          const I = Icon[t.kind];
          return (
            <div key={t.id} role={t.kind === 'error' ? 'alert' : 'status'} className="pointer-events-auto flex items-start gap-3 rounded-xl border border-line bg-white p-3 shadow-pop">
              <I className={`mt-0.5 h-5 w-5 shrink-0 ${tone[t.kind]}`} aria-hidden />
              <p className="flex-1 text-sm text-ink">{t.message}</p>
              <button onClick={() => dismiss(t.id)} aria-label="Dismiss notification" className="rounded p-0.5 text-ink-faint hover:text-ink"><X className="h-4 w-4" /></button>
            </div>
          );
        })}
      </div>
    </Ctx.Provider>
  );
}
