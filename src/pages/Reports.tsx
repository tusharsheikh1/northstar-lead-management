import { useMemo, useState } from 'react';
import { Calendar, Download, Filter as FilterIcon, Printer } from 'lucide-react';
import { useStore } from '../store/StoreContext';
import { useFormat } from '../hooks/useFormat';
import { RANGE_OPTIONS, rangeLabel, type RangeKey } from '../lib/dates';
import { computeReport, reportCsv, type Report } from '../lib/reports';
import { downloadFile } from '../lib/csv';
import { Button } from '../components/ui/Button';
import { Avatar } from '../components/ui/Avatar';
import { ToolbarSelect } from '../components/ui/Form';
import { Card, Delta, EmptyState, PageHeader, StatCard, Tabs } from '../components/ui/Misc';
import { RevenueTrendChart, SimpleBars, StatusBars } from '../components/charts/Charts';
import { DollarSign, Handshake, Percent, Scale, BarChart3 } from 'lucide-react';
import type { Formatter } from '../lib/format';

type Tab = 'sales' | 'leads' | 'team';

const FUNNEL_SHADES = ['#2f5fe0', '#4c74e6', '#7b8ff0', '#a09bf3', '#c3b3f7'];

function Funnel({ r }: { r: Report }) {
  const top = r.funnel[0].count;
  if (!top) return <EmptyState title="No leads in this period" message="Pick a longer date range to see the funnel." />;
  return (
    <ul className="space-y-3" aria-label="Conversion funnel">
      {r.funnel.map((f, i) => (
        <li key={f.stage} className="flex items-center gap-3">
          <span className="w-24 shrink-0 text-sm">{f.stage}</span>
          <div className="flex-1"><div className="flex h-8 items-center justify-end rounded-md px-3 text-sm font-semibold text-white" style={{ width: `${Math.max((f.count / top) * 100, 9)}%`, background: FUNNEL_SHADES[i] }}>{f.count}</div></div>
          <span className="w-12 shrink-0 text-right text-xs text-ink-soft">{i === 0 ? '100%' : `${Math.round((f.count / top) * 100)}%`}</span>
        </li>))}
    </ul>
  );
}

function SourceTable({ r, fmt }: { r: Report; fmt: Formatter }) {
  const max = Math.max(...r.sources.map((s) => s.leads), 1);
  if (!r.sources.length) return <EmptyState title="No leads in this period" />;
  return (
    <div className="overflow-x-auto"><table className="w-full min-w-[420px] text-sm">
      <thead><tr className="border-b border-line text-left text-[13px] text-ink-soft"><th className="py-2 font-medium">Source</th><th className="w-1/3 py-2" /><th className="py-2 text-right font-medium">Leads</th><th className="py-2 text-right font-medium">Won</th><th className="py-2 text-right font-medium">Conversion</th></tr></thead>
      <tbody>{r.sources.map((s) => (
        <tr key={s.source} className="border-b border-line last:border-0">
          <td className="py-2.5 font-medium">{s.source}</td>
          <td className="py-2.5 pr-3"><div className="h-2.5 rounded-full bg-slate-100" role="presentation"><div className="h-full rounded-full bg-primary-500" style={{ width: `${(s.leads / max) * 100}%` }} /></div></td>
          <td className="py-2.5 text-right tabular-nums">{fmt.number(s.leads)}</td><td className="py-2.5 text-right tabular-nums">{s.won}</td><td className="py-2.5 text-right tabular-nums">{fmt.percent(s.conversion)}</td>
        </tr>))}</tbody>
    </table></div>
  );
}

function TeamTable({ r, fmt, full }: { r: Report; fmt: Formatter; full?: boolean }) {
  return (
    <div className="overflow-x-auto"><table className="w-full min-w-[420px] text-sm">
      <thead><tr className="border-b border-line text-left text-[13px] text-ink-soft"><th className="py-2 font-medium">Rep</th>{full && <th className="py-2 text-right font-medium">New leads</th>}<th className="py-2 text-right font-medium">Deals won</th><th className="py-2 text-right font-medium">Revenue</th><th className="py-2 text-right font-medium">Win rate</th>{full && <th className="py-2 text-right font-medium">Open pipeline</th>}</tr></thead>
      <tbody>{r.reps.map((x) => (
        <tr key={x.owner.id} className="border-b border-line last:border-0">
          <td className="py-2.5"><span className="flex items-center gap-2.5 font-medium"><Avatar owner={x.owner} size={32} />{x.owner.name}</span></td>
          {full && <td className="py-2.5 text-right tabular-nums">{x.leads}</td>}
          <td className="py-2.5 text-right tabular-nums">{x.won}</td><td className="py-2.5 text-right tabular-nums">{fmt.money(x.revenue)}</td>
          <td className="py-2.5 text-right tabular-nums">{x.winRate === null ? '—' : fmt.percent(x.winRate)}</td>
          {full && <td className="py-2.5 text-right tabular-nums">{fmt.money(x.open)}</td>}
        </tr>))}</tbody>
    </table></div>
  );
}

const Def = ({ children }: { children: React.ReactNode }) => <p className="mt-3 border-t border-line pt-3 text-xs text-ink-soft">{children}</p>;

export default function Reports() {
  const store = useStore();
  const fmt = useFormat();
  const [tab, setTab] = useState<Tab>('sales');
  const [range, setRange] = useState<RangeKey>('90d');
  const [owner, setOwner] = useState('');
  const r = useMemo(() => computeReport(store.db, range, owner), [store.db, range, owner]);
  const k = r.cur;
  const ownerName = owner ? store.ownerById(owner)?.name : 'All owners';
  const none = (v: number | null, f: (n: number) => string) => (v === null ? '—' : f(v));

  return (
    <>
      <PageHeader crumb="Reports" title="Reports" subtitle="Turn sales activity into actionable insights."
        actions={<>
          <ToolbarSelect label="Date range" icon={<Calendar className="h-4 w-4" />} value={range} onChange={(e) => setRange(e.target.value as RangeKey)} className="min-w-[170px]">{RANGE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</ToolbarSelect>
          <ToolbarSelect label="Owner" icon={<FilterIcon className="h-4 w-4" />} value={owner} onChange={(e) => setOwner(e.target.value)} className="min-w-[160px]"><option value="">All owners</option>{store.db.owners.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}</ToolbarSelect>
          <Button icon={<Printer className="h-4 w-4" />} onClick={() => window.print()}>Print</Button>
          <Button variant="primary" icon={<Download className="h-4 w-4" />} onClick={() => downloadFile(`northstar-report-${range}.csv`, reportCsv(store.db, range, owner))}>Export CSV</Button>
        </>} />
      <p className="print-only mb-4 text-sm text-ink-soft">{rangeLabel(range)} · {ownerName} · {store.db.settings.workspace.name} · Generated {fmt.dateTime(new Date())}</p>

      <div className="no-print"><Tabs label="Report sections" value={tab} onChange={setTab} tabs={[{ value: 'sales', label: 'Sales overview' }, { value: 'leads', label: 'Lead analytics' }, { value: 'team', label: 'Team performance' }]} /></div>

      <div className="mt-5 grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <StatCard icon={<DollarSign className="h-4 w-4" />} label="Total revenue" value={fmt.money(k.revenue)} delta={<Delta value={r.delta('revenue')} />} spark={r.trend.map((t) => t.revenue)} sub="Won deals closed in period" />
        <StatCard icon={<Handshake className="h-4 w-4" />} label="Deals won" value={k.dealsWon} delta={<Delta value={r.delta('dealsWon')} />} spark={r.trend.map((t) => t.won)} sub={k.winRate === null ? 'No closed deals' : `Win rate ${fmt.percent(k.winRate)}`} tint="bg-emerald-50 text-emerald-600" />
        <StatCard icon={<Percent className="h-4 w-4" />} label="Lead conversion" value={none(k.conversion, (n) => fmt.percent(n))} delta={<Delta value={r.delta('conversion')} />} spark={r.trend.map((t) => t.leads)} sub={k.leads ? `${k.wonLeads} of ${k.leads} new leads won` : 'No leads created in period'} tint="bg-violet-50 text-violet-600" />
        <StatCard icon={<Scale className="h-4 w-4" />} label="Avg. deal size" value={none(k.avgDeal, (n) => fmt.money(n))} delta={<Delta value={r.delta('avgDeal')} />} spark={r.trend.map((t) => t.avgDeal)} sub={k.dealsWon ? `Across ${k.dealsWon} won deals` : 'No won deals in period'} tint="bg-amber-50 text-amber-600" />
      </div>

      {!r.hasData && <Card className="mt-5"><EmptyState icon={<BarChart3 className="h-6 w-6" />} title="No data for this period" message="There are no new leads or won deals for the selected filters. Try a longer date range or a different owner." action={<Button onClick={() => { setRange('all'); setOwner(''); }}>Show all time</Button>} /></Card>}

      {r.hasData && tab === 'sales' && (
        <>
          <div className="mt-5 grid gap-5 lg:grid-cols-[1.6fr_1fr]">
            <Card className="p-5"><h2 className="text-lg font-semibold">Revenue trend</h2><p className="mb-3 text-sm text-ink-soft">Revenue vs. target ({fmt.money(store.db.settings.workspace.monthlyTarget)} per month, set in Settings). Partial first/last periods are prorated.</p>
              <RevenueTrendChart data={r.trend} fmt={fmt} /></Card>
            <Card className="p-5"><h2 className="mb-4 text-lg font-semibold">Conversion funnel</h2><Funnel r={r} />
              <Def>Counts leads created in the period by the furthest stage they have reached. Lost leads count only toward “Leads”.</Def></Card>
          </div>
          <div className="mt-5 grid gap-5 lg:grid-cols-2">
            <Card className="p-5"><h2 className="text-lg font-semibold">Lead sources performance</h2><p className="mb-3 text-sm text-ink-soft">Leads, volume, and conversion rate by source.</p><SourceTable r={r} fmt={fmt} /></Card>
            <Card className="p-5"><h2 className="text-lg font-semibold">Team performance</h2><p className="mb-3 text-sm text-ink-soft">Deals won, revenue, and win rate by sales rep.</p><TeamTable r={r} fmt={fmt} /></Card>
          </div>
        </>)}

      {r.hasData && tab === 'leads' && (
        <div className="mt-5 grid gap-5 lg:grid-cols-2">
          <Card className="p-5"><h2 className="text-lg font-semibold">New leads over time</h2><p className="mb-3 text-sm text-ink-soft">Leads created per period</p><SimpleBars data={r.trend} dataKey="leads" nameKey="label" /></Card>
          <Card className="p-5"><h2 className="mb-3 text-lg font-semibold">Current status of new leads</h2>{r.statusMix.length ? <StatusBars data={r.statusMix} /> : <EmptyState title="No leads in this period" />}</Card>
          <Card className="p-5"><h2 className="mb-3 text-lg font-semibold">Conversion funnel</h2><Funnel r={r} /></Card>
          <Card className="p-5"><h2 className="mb-3 text-lg font-semibold">Lead sources performance</h2><SourceTable r={r} fmt={fmt} />
            <Def>Conversion = leads from the source (created in period) that are now Won ÷ leads from the source created in period.</Def></Card>
        </div>)}

      {r.hasData && tab === 'team' && (
        <div className="mt-5 grid gap-5">
          <Card className="p-5"><h2 className="text-lg font-semibold">Team performance</h2><p className="mb-3 text-sm text-ink-soft">Per-rep results for {rangeLabel(range).toLowerCase()}.</p><TeamTable r={r} fmt={fmt} full />
            <Def>Win rate = deals won ÷ (won + lost) closed in the period. Open pipeline is the current value of each rep’s open deals (all time).</Def></Card>
          <Card className="p-5"><h2 className="mb-3 text-lg font-semibold">Revenue by rep</h2>
            <SimpleBars data={r.reps.map((x) => ({ name: x.owner.name.split(' ')[0], revenue: x.revenue }))} dataKey="revenue" nameKey="name" money fmt={fmt} /></Card>
        </div>)}

      <Card className="mt-5 p-5">
        <h2 className="text-sm font-semibold">Metric definitions</h2>
        <dl className="mt-2 grid gap-x-8 gap-y-1.5 text-[13px] text-ink-soft md:grid-cols-2">
          <div><dt className="inline font-medium text-ink">Total revenue: </dt><dd className="inline">sum of Won deals whose close date falls in the period.</dd></div>
          <div><dt className="inline font-medium text-ink">Lead conversion: </dt><dd className="inline">leads created in the period that are now Won ÷ leads created in the period. Recent periods are naturally lower because deals take time to close.</dd></div>
          <div><dt className="inline font-medium text-ink">Avg. deal size: </dt><dd className="inline">revenue ÷ deals won.</dd></div>
          <div><dt className="inline font-medium text-ink">Change indicators: </dt><dd className="inline">compared with the equally long previous period (hidden for “All time” or when there is no baseline).</dd></div>
        </dl>
      </Card>
    </>
  );
}
