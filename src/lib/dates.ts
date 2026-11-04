import { addDays, addMonths, differenceInCalendarDays, endOfMonth, endOfQuarter, startOfDay, startOfMonth, startOfQuarter, subDays, subMonths } from 'date-fns';

export type RangeKey = '7d' | '30d' | '90d' | '12m' | 'all';
export const RANGE_OPTIONS: { value: RangeKey; label: string }[] = [
  { value: '7d', label: 'Last 7 days' },
  { value: '30d', label: 'Last 30 days' },
  { value: '90d', label: 'Last 90 days' },
  { value: '12m', label: 'Last 12 months' },
  { value: 'all', label: 'All time' },
];

export interface Period { start: Date | null; end: Date }

/** Current period for a range key, ending now. `all` has no start. */
export function periodFor(key: RangeKey, now = new Date()): Period {
  const end = now;
  switch (key) {
    case '7d': return { start: startOfDay(subDays(now, 6)), end };
    case '30d': return { start: startOfDay(subDays(now, 29)), end };
    case '90d': return { start: startOfDay(subDays(now, 89)), end };
    case '12m': return { start: startOfDay(subMonths(now, 12)), end };
    default: return { start: null, end };
  }
}

/** The equally long period immediately before `p` (null for all-time). */
export function previousPeriod(p: Period): Period | null {
  if (!p.start) return null;
  const ms = p.end.getTime() - p.start.getTime();
  return { start: new Date(p.start.getTime() - ms - 1), end: new Date(p.start.getTime() - 1) };
}

export const inPeriod = (iso: string | undefined, p: Period) => {
  if (!iso) return false;
  const t = new Date(iso).getTime();
  return (p.start ? t >= p.start.getTime() : true) && t <= p.end.getTime();
};

export const rangeLabel = (key: RangeKey) => RANGE_OPTIONS.find((r) => r.value === key)?.label ?? '';

export {
  addDays, addMonths, differenceInCalendarDays, endOfMonth, endOfQuarter, startOfDay, startOfMonth, startOfQuarter, subDays, subMonths,
};

/** yyyy-MM-dd for <input type="date">, in local time. */
export const toDateInput = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
export const toTimeInput = (d: Date) => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
export const fromInputs = (date: string, time = '09:00') => new Date(`${date}T${time}:00`).toISOString();
