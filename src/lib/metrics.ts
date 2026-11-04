import type { BoardStage, Database, Deal, Lead, LeadStatus, Settings } from '../types';
import { OPEN_STAGES } from '../types';
import { differenceInCalendarDays, endOfMonth, endOfQuarter, inPeriod, startOfDay, startOfMonth, startOfQuarter, type Period } from './dates';

export const isOpenDeal = (d: Deal) => d.stage !== 'Won' && d.stage !== 'Lost';
export const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

/** Lead status progression used by the conversion funnel. */
export const STATUS_RANK: Record<LeadStatus, number> = {
  New: 0, Contacted: 1, Qualified: 2, Proposal: 3, Negotiation: 4, Won: 5, Lost: -1,
};

export const weightedValue = (deals: Deal[], p: Settings['probabilities']) =>
  sum(deals.filter(isOpenDeal).map((d) => (d.value * (p[d.stage as BoardStage] ?? 0)) / 100));

export const wonDealsIn = (deals: Deal[], p: Period) => deals.filter((d) => d.stage === 'Won' && inPeriod(d.closedAt, p));
export const lostDealsIn = (deals: Deal[], p: Period) => deals.filter((d) => d.stage === 'Lost' && inPeriod(d.closedAt, p));

export const cycleDays = (d: Deal) =>
  d.closedAt ? Math.max(0, differenceInCalendarDays(new Date(d.closedAt), new Date(d.createdAt))) : 0;

export function stageSummary(deals: Deal[]) {
  return OPEN_STAGES.map((stage) => {
    const ds = deals.filter((d) => d.stage === stage);
    return { stage, count: ds.length, value: sum(ds.map((d) => d.value)) };
  });
}

export function sourceBreakdown(leads: Lead[]) {
  const map = new Map<string, number>();
  leads.forEach((l) => map.set(l.source, (map.get(l.source) ?? 0) + 1));
  return [...map.entries()].map(([source, count]) => ({ source, count })).sort((a, b) => b.count - a.count);
}

/** Calendar helpers shared by pipeline cards. */
export const thisMonthRange = (now = new Date()) => ({ start: startOfMonth(now), end: endOfMonth(now) });
export const thisQuarterRange = (now = new Date()) => ({ start: startOfQuarter(now), end: endOfQuarter(now) });
export const isOverdueDate = (iso: string, now = new Date()) => new Date(iso) < startOfDay(now);

/** Split a period into `n` buckets (default 8) for sparklines. */
export function buckets(p: Period, fallbackStart: Date, n = 8) {
  const start = (p.start ?? fallbackStart).getTime();
  const end = p.end.getTime();
  const step = Math.max((end - start) / n, 1);
  return Array.from({ length: n }, (_, i) => ({ start: start + i * step, end: start + (i + 1) * step }));
}

export const earliestDate = (db: Database) => {
  const all = [...db.leads.map((l) => l.createdAt), ...db.deals.map((d) => d.createdAt)].sort();
  return new Date(all[0] ?? Date.now());
};

export const pctChange = (cur: number, prev: number) => (prev === 0 ? null : ((cur - prev) / prev) * 100);
