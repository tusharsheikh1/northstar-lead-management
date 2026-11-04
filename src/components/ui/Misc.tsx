import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ArrowDownRight, ArrowUpRight, ChevronLeft, ChevronRight } from 'lucide-react';
import { Area, AreaChart, ResponsiveContainer } from 'recharts';
import { Link } from 'react-router-dom';
import { Button } from './Button';

export function Card({ children, className = '', as: Tag = 'section', ...rest }: { children: ReactNode; className?: string; as?: 'section' | 'div' | 'article' } & React.HTMLAttributes<HTMLElement>) {
  return <Tag {...rest} className={`card ${className}`}>{children}</Tag>;
}

export function EmptyState({ icon, title, message, action }: { icon?: ReactNode; title: string; message?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-12 text-center">
      {icon && <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-primary-50 text-primary-500">{icon}</div>}
      <h3 className="text-sm font-semibold">{title}</h3>
      {message && <p className="mt-1 max-w-sm text-sm text-ink-soft">{message}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function Tabs<T extends string>({ tabs, value, onChange, label, variant = 'underline' }: { tabs: { value: T; label: string; count?: number }[]; value: T; onChange: (v: T) => void; label: string; variant?: 'underline' | 'pill' }) {
  const onKey = (e: React.KeyboardEvent, i: number) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    const next = tabs[(i + (e.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length];
    onChange(next.value);
    (e.currentTarget.parentElement?.querySelectorAll('[role=tab]')[tabs.indexOf(next)] as HTMLElement)?.focus();
  };
  return (
    <div role="tablist" aria-label={label} className={`flex max-w-full gap-1 overflow-x-auto ${variant === 'underline' ? 'border-b border-line' : 'rounded-xl border border-line bg-white p-1 shadow-card'}`}>
      {tabs.map((t, i) => {
        const active = t.value === value;
        const base = 'inline-flex shrink-0 items-center gap-2 whitespace-nowrap text-sm font-medium transition-colors';
        const cls = variant === 'underline'
          ? `${base} -mb-px border-b-2 px-3 py-2.5 ${active ? 'border-primary-500 text-primary-600' : 'border-transparent text-ink-soft hover:text-ink'}`
          : `${base} rounded-lg px-3.5 py-2 ${active ? 'bg-primary-50 text-primary-700 ring-1 ring-primary-500' : 'text-ink-soft hover:bg-slate-50 hover:text-ink'}`;
        return (
          <button key={t.value} role="tab" aria-selected={active} tabIndex={active ? 0 : -1} onKeyDown={(e) => onKey(e, i)} onClick={() => onChange(t.value)} className={cls}>
            {t.label}
            {t.count !== undefined && <span className={`rounded-md px-1.5 py-0.5 text-xs ${active ? 'bg-primary-100 text-primary-700' : 'bg-slate-100 text-ink-soft'}`}>{t.count}</span>}
          </button>
        );
      })}
    </div>
  );
}

export function Segmented<T extends string>({ options, value, onChange, label }: { options: { value: T; label: string; icon?: ReactNode }[]; value: T; onChange: (v: T) => void; label: string }) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex rounded-lg border border-slate-200 bg-white p-1 shadow-sm">
      {options.map((o) => (
        <button key={o.value} role="radio" aria-checked={o.value === value} onClick={() => onChange(o.value)}
          className={`inline-flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium ${o.value === value ? 'bg-primary-50 text-primary-600' : 'text-ink-soft hover:text-ink'}`}>
          {o.icon}{o.label}
        </button>
      ))}
    </div>
  );
}

export function Pagination({ page, pages, onPage }: { page: number; pages: number; onPage: (p: number) => void }) {
  if (pages <= 1) return null;
  const nums: (number | '…')[] = [];
  const add = (n: number | '…') => nums.push(n);
  for (let i = 1; i <= pages; i++) {
    if (i === 1 || i === pages || Math.abs(i - page) <= 1 || (page <= 3 && i <= 4) || (page >= pages - 2 && i >= pages - 3)) add(i);
    else if (nums[nums.length - 1] !== '…') add('…');
  }
  return (
    <nav aria-label="Pagination" className="flex items-center gap-1">
      <Button size="sm" onClick={() => onPage(page - 1)} disabled={page <= 1} icon={<ChevronLeft className="h-4 w-4" />} aria-label="Previous page"><span className="hidden sm:inline">Previous</span></Button>
      {nums.map((n, i) => n === '…'
        ? <span key={`e${i}`} className="px-1 text-ink-soft" aria-hidden>…</span>
        : <button key={n} onClick={() => onPage(n)} aria-label={`Page ${n}`} aria-current={n === page ? 'page' : undefined}
          className={`h-8 min-w-8 rounded-lg px-2 text-[13px] font-medium ${n === page ? 'bg-primary-500 text-white' : 'text-ink-soft hover:bg-slate-100'}`}>{n}</button>)}
      <Button size="sm" onClick={() => onPage(page + 1)} disabled={page >= pages} aria-label="Next page"><span className="hidden sm:inline">Next</span><ChevronRight className="h-4 w-4" /></Button>
    </nav>
  );
}

export function Popover({ trigger, children, align = 'right' }: { trigger: (p: { open: boolean; toggle: () => void }) => ReactNode; children: (close: () => void) => ReactNode; align?: 'left' | 'right' }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const down = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', down);
    document.addEventListener('keydown', key);
    return () => { document.removeEventListener('mousedown', down); document.removeEventListener('keydown', key); };
  }, [open]);
  return (
    <div ref={ref} className="relative">
      {trigger({ open, toggle: () => setOpen((o) => !o) })}
      {open && <div className={`absolute z-30 mt-2 w-[min(20rem,calc(100vw-2rem))] rounded-xl border border-line bg-white p-4 shadow-pop ${align === 'right' ? 'right-0' : 'left-0'}`}>{children(() => setOpen(false))}</div>}
    </div>
  );
}

export function Delta({ value, suffix = '%', goodWhenDown = false, digits = 1 }: { value: number | null; suffix?: string; goodWhenDown?: boolean; digits?: number }) {
  if (value === null || !isFinite(value)) return null;
  const up = value >= 0;
  const good = goodWhenDown ? !up : up;
  const Icon = up ? ArrowUpRight : ArrowDownRight;
  return (
    <span className={`inline-flex items-center gap-0.5 rounded-md px-1.5 py-0.5 text-xs font-semibold ${good ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}
      title="Change versus the previous period">
      <Icon className="h-3.5 w-3.5" aria-hidden />{up ? '+' : ''}{value.toFixed(digits)}{suffix}
    </span>
  );
}

export function Sparkline({ data, color = '#4169E1' }: { data: number[]; color?: string }) {
  const rows = data.map((v, i) => ({ i, v }));
  const id = `sp${color.replace('#', '')}`;
  return (
    <div className="h-10 w-full" aria-hidden>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={rows} margin={{ top: 4, right: 0, bottom: 0, left: 0 }}>
          <defs><linearGradient id={id} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={color} stopOpacity={0.25} /><stop offset="100%" stopColor={color} stopOpacity={0.02} /></linearGradient></defs>
          <Area type="monotone" dataKey="v" stroke={color} strokeWidth={2} fill={`url(#${id})`} isAnimationActive={false} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

export function StatCard({ icon, label, value, delta, sub, spark, to, tint = 'bg-primary-50 text-primary-500', title }: {
  icon: ReactNode; label: string; value: ReactNode; delta?: ReactNode; sub?: ReactNode; spark?: number[]; to?: string; tint?: string; title?: string;
}) {
  const body = (
    <>
      <div className="flex items-center gap-2.5">
        <span className={`flex h-8 w-8 items-center justify-center rounded-lg ${tint}`}>{icon}</span>
        <span className="text-sm text-ink-soft">{label}</span>
      </div>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <span className="text-xl font-bold tracking-tight sm:text-[28px]">{value}</span>
        {delta}
      </div>
      {sub && <div className="mt-1 text-[13px] text-ink-soft">{sub}</div>}
      {spark && <div className="mt-2"><Sparkline data={spark} /></div>}
    </>
  );
  const cls = 'card block min-w-0 p-3.5 sm:p-5 text-left';
  return to
    ? <Link to={to} title={title} className={`${cls} transition-shadow hover:shadow-pop`}>{body}</Link>
    : <div className={cls} title={title}>{body}</div>;
}

export function PageHeader({ section = 'Workspace', crumb, title, subtitle, actions }: { section?: string; crumb: string; title: string; subtitle?: string; actions?: ReactNode }) {
  return (
    <header className="mb-6">
      <nav aria-label="Breadcrumb" className="text-[13px] text-ink-soft">{section} <span className="mx-1">/</span> <span className="text-ink">{crumb}</span></nav>
      <div className="mt-1 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-3xl font-bold tracking-tight">{title}</h1>
          {subtitle && <p className="mt-1 text-[15px] text-ink-soft">{subtitle}</p>}
        </div>
        {actions && <div className="no-print flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
    </header>
  );
}
