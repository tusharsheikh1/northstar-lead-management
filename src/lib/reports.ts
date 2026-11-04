import { addDays, endOfDay, endOfMonth, format, startOfMonth } from 'date-fns';
import type { Database } from '../types';
import { LEAD_STATUSES } from '../types';
import { earliestDate, isOpenDeal, lostDealsIn, pctChange, STATUS_RANK, sum, cycleDays, wonDealsIn } from './metrics';
import { inPeriod, periodFor, previousPeriod, rangeLabel, startOfDay, type Period, type RangeKey } from './dates';
import { toCsv } from './csv';

export interface Kpis { revenue: number; dealsWon: number; conversion: number | null; avgDeal: number | null; winRate: number | null; avgCycle: number | null; leads: number; wonLeads: number }

export function kpisFor(db: Database, p: Period, ownerId: string): Kpis {
  const leads = db.leads.filter((l) => inPeriod(l.createdAt, p) && (!ownerId || l.ownerId === ownerId));
  const deals = db.deals.filter((d) => !ownerId || d.ownerId === ownerId);
  const won = wonDealsIn(deals, p);
  const lost = lostDealsIn(deals, p);
  const wonLeads = leads.filter((l) => l.status === 'Won').length;
  return {
    revenue: sum(won.map((d) => d.value)), dealsWon: won.length, leads: leads.length, wonLeads,
    conversion: leads.length ? (wonLeads / leads.length) * 100 : null,
    avgDeal: won.length ? sum(won.map((d) => d.value)) / won.length : null,
    winRate: won.length + lost.length ? (won.length / (won.length + lost.length)) * 100 : null,
    avgCycle: won.length ? sum(won.map(cycleDays)) / won.length : null,
  };
}

export interface Bucket { label: string; start: number; end: number; days: number }

export function makeBuckets(p: Period, fallbackStart: Date): Bucket[] {
  const start = startOfDay(p.start ?? fallbackStart);
  const end = p.end;
  const span = (end.getTime() - start.getTime()) / 86_400_000;
  const out: Bucket[] = [];
  if (span <= 14) {
    for (let d = start; d <= end; d = addDays(d, 1)) out.push({ label: format(d, 'MMM d'), start: d.getTime(), end: endOfDay(d).getTime(), days: 1 });
  } else if (span <= 45) {
    for (let d = start; d <= end; d = addDays(d, 7)) {
      const e = Math.min(endOfDay(addDays(d, 6)).getTime(), end.getTime());
      out.push({ label: format(d, 'MMM d'), start: d.getTime(), end: e, days: Math.max(1, Math.round((e - d.getTime()) / 86_400_000)) });
    }
  } else {
    for (let d = startOfMonth(start); d <= end; d = startOfMonth(addDays(endOfMonth(d), 1))) {
      const s = Math.max(d.getTime(), start.getTime());
      const e = Math.min(endOfMonth(d).getTime(), end.getTime());
      out.push({ label: format(d, 'MMM'), start: s, end: e, days: Math.max(1, Math.round((e - s) / 86_400_000)) });
    }
  }
  return out;
}

export function computeReport(db: Database, range: RangeKey, ownerId: string) {
  const period = periodFor(range);
  const prev = previousPeriod(period);
  const cur = kpisFor(db, period, ownerId);
  const before = prev ? kpisFor(db, prev, ownerId) : null;
  const leads = db.leads.filter((l) => inPeriod(l.createdAt, period) && (!ownerId || l.ownerId === ownerId));
  const deals = db.deals.filter((d) => !ownerId || d.ownerId === ownerId);
  const buckets = makeBuckets(period, earliestDate(db));
  const target = db.settings.workspace.monthlyTarget;
  const trend = buckets.map((b) => {
    const bp = { start: new Date(b.start), end: new Date(b.end) };
    return {
      label: b.label,
      revenue: sum(wonDealsIn(deals, bp).map((d) => d.value)),
      target: Math.round((target * b.days) / 30),
      leads: leads.filter((l) => inPeriod(l.createdAt, bp)).length,
      won: wonDealsIn(deals, bp).length,
      avgDeal: wonDealsIn(deals, bp).length ? sum(wonDealsIn(deals, bp).map((d) => d.value)) / wonDealsIn(deals, bp).length : 0,
    };
  });
  const funnel = [
    { stage: 'Leads', count: leads.length },
    { stage: 'Qualified', count: leads.filter((l) => STATUS_RANK[l.status] >= STATUS_RANK.Qualified).length },
    { stage: 'Proposals', count: leads.filter((l) => STATUS_RANK[l.status] >= STATUS_RANK.Proposal).length },
    { stage: 'Negotiations', count: leads.filter((l) => STATUS_RANK[l.status] >= STATUS_RANK.Negotiation).length },
    { stage: 'Won', count: leads.filter((l) => l.status === 'Won').length },
  ];
  const sourceNames = [...new Set(leads.map((l) => l.source))];
  const sources = sourceNames.map((source) => {
    const ls = leads.filter((l) => l.source === source);
    const w = ls.filter((l) => l.status === 'Won');
    return { source, leads: ls.length, won: w.length, conversion: ls.length ? (w.length / ls.length) * 100 : 0, wonValue: sum(w.map((l) => l.value)) };
  }).sort((a, b) => b.leads - a.leads);
  const reps = (ownerId ? db.owners.filter((o) => o.id === ownerId) : db.owners).map((o) => {
    const ds = db.deals.filter((d) => d.ownerId === o.id);
    const won = wonDealsIn(ds, period); const lost = lostDealsIn(ds, period);
    return {
      owner: o, leads: db.leads.filter((l) => l.ownerId === o.id && inPeriod(l.createdAt, period)).length,
      won: won.length, revenue: sum(won.map((d) => d.value)),
      winRate: won.length + lost.length ? (won.length / (won.length + lost.length)) * 100 : null,
      open: sum(ds.filter(isOpenDeal).map((d) => d.value)),
    };
  }).sort((a, b) => b.revenue - a.revenue);
  const statusMix = LEAD_STATUSES.map((s) => ({ status: s, count: leads.filter((l) => l.status === s).length })).filter((x) => x.count > 0);
  const hasData = leads.length > 0 || cur.dealsWon > 0;
  return {
    period, cur, before, trend, funnel, sources, reps, statusMix, hasData,
    delta: (k: keyof Kpis) => (before && cur[k] !== null && before[k] !== null ? pctChange(cur[k] as number, before[k] as number) : null),
  };
}

export type Report = ReturnType<typeof computeReport>;

export function reportCsv(db: Database, range: RangeKey, ownerId: string) {
  const r = computeReport(db, range, ownerId);
  const owner = ownerId ? db.owners.find((o) => o.id === ownerId)?.name : 'All owners';
  const n = (v: number | null, d = 1) => (v === null ? 'n/a' : Number(v.toFixed(d)));
  return toCsv([
    ['Northstar CRM report'], ['Date range', rangeLabel(range)], ['Owner', owner], ['Generated', new Date().toISOString()], [],
    ['Metric', 'Value'],
    ['Total revenue (won deals closed in range)', r.cur.revenue], ['Deals won', r.cur.dealsWon],
    ['Lead conversion % (leads created in range that are now Won)', n(r.cur.conversion)], ['Average deal size', n(r.cur.avgDeal, 0)],
    ['Win rate % (won / (won + lost) closed in range)', n(r.cur.winRate)], ['Average sales cycle (days)', n(r.cur.avgCycle)], [],
    ['Period', 'Revenue', 'Target', 'New leads'], ...r.trend.map((t) => [t.label, t.revenue, t.target, t.leads]), [],
    ['Funnel stage', 'Leads'], ...r.funnel.map((f) => [f.stage, f.count]), [],
    ['Source', 'Leads', 'Won', 'Conversion %'], ...r.sources.map((s) => [s.source, s.leads, s.won, n(s.conversion)]), [],
    ['Rep', 'Leads', 'Deals won', 'Revenue', 'Win rate %', 'Open pipeline'], ...r.reps.map((x) => [x.owner.name, x.leads, x.won, x.revenue, n(x.winRate), x.open]),
  ]);
}
