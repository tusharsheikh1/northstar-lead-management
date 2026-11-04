import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowRight, Calendar, Clock, Download, Target, Timer, Trophy, Users, CheckCircle2 } from 'lucide-react';
import { useStore } from '../store/StoreContext';
import { useFormat } from '../hooks/useFormat';
import { RANGE_OPTIONS, inPeriod, periodFor, previousPeriod, type RangeKey, rangeLabel } from '../lib/dates';
import { buckets, earliestDate, isOpenDeal, pctChange, sourceBreakdown, stageSummary, sum } from '../lib/metrics';
import { kpisFor } from '../lib/reports';
import { downloadFile } from '../lib/csv';
import { reportCsv } from '../lib/reports';
import { Button } from '../components/ui/Button';
import { Badge, STAGE_COLORS } from '../components/ui/Badge';
import { Avatar } from '../components/ui/Avatar';
import { ToolbarSelect } from '../components/ui/Form';
import { Card, Delta, EmptyState, PageHeader, StatCard } from '../components/ui/Misc';
import { DonutChart, SOURCE_COLORS } from '../components/charts/Charts';
import type { Activity } from '../types';

const greeting = () => { const h = new Date().getHours(); return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening'; };

export default function Overview() {
  const store = useStore();
  const fmt = useFormat();
  const nav = useNavigate();
  const [range, setRange] = useState<RangeKey>('30d');
  const { db, me } = store;

  const m = useMemo(() => {
    const period = periodFor(range);
    const prev = previousPeriod(period);
    const bs = buckets(period, earliestDate(db));
    const cur = kpisFor(db, period, '');
    const before = prev ? kpisFor(db, prev, '') : null;
    const leadsIn = db.leads.filter((l) => inPeriod(l.createdAt, period));
    const openAt = (t: number) => sum(db.deals.filter((d) => new Date(d.createdAt).getTime() <= t && (!d.closedAt || new Date(d.closedAt).getTime() > t)).map((d) => d.value));
    const start = (period.start ?? earliestDate(db)).getTime();
    const openNow = sum(db.deals.filter(isOpenDeal).map((d) => d.value));
    return {
      period, cur, before, leadsIn,
      leadSpark: bs.map((b) => leadsIn.filter((l) => { const t = new Date(l.createdAt).getTime(); return t >= b.start && t <= b.end; }).length),
      openNow, openDelta: period.start ? pctChange(openNow, openAt(start)) : null, openSpark: bs.map((b) => openAt(b.end)),
      winSpark: bs.map((b) => kpisFor(db, { start: new Date(b.start), end: new Date(b.end) }, '').winRate ?? 0),
      cycleSpark: bs.map((b) => kpisFor(db, { start: new Date(b.start), end: new Date(b.end) }, '').avgCycle ?? 0),
    };
  }, [db, range]);

  const openDeals = db.deals.filter(isOpenDeal);
  const stages = stageSummary(openDeals);
  const sources = sourceBreakdown(m.leadsIn);
  const wonIn = db.deals.filter((d) => d.stage === 'Won' && inPeriod(d.closedAt, m.period));
  const today = new Date();
  const dueToday = db.tasks.filter((t) => new Date(t.dueAt).toDateString() === today.toDateString()).sort((a, b) => Number(a.completed) - Number(b.completed) || a.dueAt.localeCompare(b.dueAt));
  const recent = db.activities.slice(0, 6);

  const target = (a: Activity) => (a.leadId ? `/leads?lead=${a.leadId}` : a.dealId ? `/pipeline?deal=${a.dealId}` : a.taskId ? '/tasks' : '/leads');
  const winDelta = m.before && m.cur.winRate !== null && m.before.winRate !== null ? m.cur.winRate - m.before.winRate : null;
  const cycleDelta = m.before && m.cur.avgCycle !== null && m.before.avgCycle !== null ? m.cur.avgCycle - m.before.avgCycle : null;
  const leadDelta = m.before ? pctChange(m.cur.leads, m.before.leads) : null;

  return (
    <>
      <PageHeader crumb="Overview" title="Overview"
        actions={<>
          <ToolbarSelect label="Date range" icon={<Calendar className="h-4 w-4" />} value={range} onChange={(e) => setRange(e.target.value as RangeKey)} className="min-w-[180px]">
            {RANGE_OPTIONS.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
          </ToolbarSelect>
          <Button variant="primary" icon={<Download className="h-4 w-4" />} onClick={() => downloadFile(`northstar-report-${range}.csv`, reportCsv(db, range, ''))}>Export report</Button>
        </>} />
      <div className="-mt-3 mb-6">
        <h2 className="text-2xl font-bold tracking-tight">{greeting()}, {me.name.split(' ')[0]}</h2>
        <p className="text-[15px] text-ink-soft">Here’s what’s happening with your sales pipeline.</p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <StatCard to="/leads" icon={<Users className="h-4 w-4" />} label="Total leads" value={fmt.number(m.cur.leads)} delta={<Delta value={leadDelta} />} spark={m.leadSpark} sub={`Created · ${rangeLabel(range).toLowerCase()}`} />
        <StatCard to="/pipeline" icon={<Target className="h-4 w-4" />} label="Open opportunities" value={fmt.money(m.openNow)} delta={<Delta value={m.openDelta} />} spark={m.openSpark} sub={`${openDeals.length} open deals · excludes Won/Lost`} />
        <StatCard to="/reports" icon={<Trophy className="h-4 w-4" />} label="Win rate" value={m.cur.winRate === null ? '—' : fmt.percent(m.cur.winRate)} delta={<Delta value={winDelta} suffix=" pp" />} spark={m.winSpark} sub={m.cur.winRate === null ? 'No closed deals in this period' : 'Won ÷ (won + lost) closed in period'} />
        <StatCard to="/reports" icon={<Timer className="h-4 w-4" />} label="Avg. sales cycle" value={m.cur.avgCycle === null ? '—' : `${Math.round(m.cur.avgCycle)} days`} delta={<Delta value={cycleDelta} suffix=" d" goodWhenDown digits={0} />} spark={m.cycleSpark} sub={m.cur.avgCycle === null ? 'No won deals in this period' : 'Created → won, deals won in period'} />
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-[1.35fr_1fr]">
        <Card className="p-5">
          <h2 className="text-lg font-semibold">Pipeline overview</h2>
          <p className="mt-1 text-sm text-ink-soft">Open pipeline value: <strong className="text-base text-ink">{fmt.money(m.openNow)}</strong></p>
          {m.openNow > 0 ? (
            <div className="mt-3 flex h-9 overflow-hidden rounded-lg" role="img" aria-label="Open pipeline value by stage">
              {stages.filter((s) => s.value > 0).map((s) => (
                <Link key={s.stage} to={`/pipeline?stage=${s.stage}`} title={`${s.stage}: ${fmt.money(s.value)}`} style={{ width: `${(s.value / m.openNow) * 100}%`, background: STAGE_COLORS[s.stage] }} className="flex items-center justify-center text-xs font-semibold text-white">
                  {(s.value / m.openNow) * 100 >= 9 ? `${Math.round((s.value / m.openNow) * 100)}%` : ''}
                </Link>))}
            </div>) : <p className="mt-3 text-sm text-ink-soft">No open deals.</p>}
          <table className="mt-4 w-full text-sm">
            <thead><tr className="border-b border-line text-left text-[13px] text-ink-soft"><th className="py-2 font-medium">Stage</th><th className="py-2 text-right font-medium">Value</th><th className="py-2 text-right font-medium">Deals</th></tr></thead>
            <tbody>
              {stages.map((s) => (
                <tr key={s.stage} className="border-b border-line last:border-0 hover:bg-slate-50">
                  <td className="py-2"><Link to={`/pipeline?stage=${s.stage}`} className="flex items-center gap-2 font-medium hover:text-primary-600"><span className="h-2.5 w-2.5 rounded-full" style={{ background: STAGE_COLORS[s.stage] }} />{s.stage}</Link></td>
                  <td className="py-2 text-right font-semibold tabular-nums">{fmt.moneyCompact(s.value)}</td><td className="py-2 text-right tabular-nums">{s.count}</td>
                </tr>))}
              <tr className="border-t-2 border-line text-ink-soft hover:bg-slate-50">
                <td className="py-2"><Link to="/pipeline?stage=Won" className="flex items-center gap-2 hover:text-primary-600"><span className="h-2.5 w-2.5 rounded-full" style={{ background: STAGE_COLORS.Won }} />Won in period <span className="text-xs">(closed, not in open total)</span></Link></td>
                <td className="py-2 text-right font-semibold tabular-nums">{fmt.moneyCompact(sum(wonIn.map((d) => d.value)))}</td><td className="py-2 text-right tabular-nums">{wonIn.length}</td>
              </tr>
            </tbody>
          </table>
        </Card>

        <Card className="p-5">
          <div className="flex items-center justify-between"><h2 className="text-lg font-semibold">Tasks due today</h2><Link to="/tasks" className="inline-flex items-center gap-1 text-sm font-medium text-primary-600 hover:underline">View all <ArrowRight className="h-4 w-4" /></Link></div>
          {dueToday.length === 0 ? <EmptyState icon={<CheckCircle2 className="h-6 w-6" />} title="Nothing due today" message="Enjoy the breathing room, or add a task." /> : (
            <ul className="mt-3 divide-y divide-line">
              {dueToday.map((t) => (
                <li key={t.id} className="flex items-center gap-3 py-2.5">
                  <input type="checkbox" checked={t.completed} aria-label={`${t.completed ? 'Reopen' : 'Complete'} task: ${t.title}`} onChange={(e) => store.setTaskCompleted(t.id, e.target.checked)} className="!h-5 !w-5" />
                  <span className={`min-w-0 flex-1 truncate text-sm font-medium ${t.completed ? 'text-ink-faint line-through' : ''}`}>{t.title}</span>
                  <Badge tone={t.priority} className="hidden sm:inline-flex" />
                  <span className="flex w-20 items-center gap-1 text-[13px] text-ink-soft"><Clock className="h-3.5 w-3.5" aria-hidden />{fmt.time(t.dueAt)}</span>
                </li>))}
            </ul>)}
        </Card>
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-[1fr_1.2fr]">
        <Card className="p-5">
          <h2 className="text-lg font-semibold">Recent activity</h2>
          <ol className="mt-4 space-y-4">
            {recent.map((a, i) => {
              const actor = store.ownerById(a.actorId);
              return (
                <li key={a.id} className="relative flex gap-3">
                  {i < recent.length - 1 && <span className="absolute left-4 top-9 h-[calc(100%-12px)] w-px bg-line" aria-hidden />}
                  <Avatar owner={actor} size={32} />
                  <Link to={target(a)} className="min-w-0 flex-1 rounded-lg px-2 py-0.5 hover:bg-slate-50">
                    <p className="text-sm"><span className="font-semibold">{actor?.name.split(' ')[0]}</span> {a.verb} <span className="font-semibold">{a.subject}</span> {a.detail}</p>
                    <p className="text-xs text-ink-soft">{fmt.relative(a.createdAt)}</p>
                  </Link>
                </li>);
            })}
            {!recent.length && <li><EmptyState title="No activity yet" message="Actions you take will show up here." /></li>}
          </ol>
        </Card>

        <Card className="p-5">
          <h2 className="text-lg font-semibold">Lead sources</h2>
          {sources.length === 0 ? <EmptyState title="No leads in this period" message="Try a longer date range." /> : (
            <div className="mt-2 flex flex-col items-center gap-6 sm:flex-row">
              <DonutChart data={sources.map((s) => ({ name: s.source, value: s.count }))} center={fmt.number(m.leadsIn.length)} sub="Total leads" onSelect={(n) => nav(`/leads?source=${encodeURIComponent(n)}`)} />
              <table className="w-full flex-1 text-sm">
                <thead><tr className="border-b border-line text-left text-[13px] text-ink-soft"><th className="py-2 font-medium">Source</th><th className="py-2 text-right font-medium">Leads</th><th className="py-2 text-right font-medium">Share</th></tr></thead>
                <tbody>{sources.map((s, i) => (
                  <tr key={s.source} className="border-b border-line last:border-0 hover:bg-slate-50">
                    <td className="py-2"><Link to={`/leads?source=${encodeURIComponent(s.source)}`} className="flex items-center gap-2 font-medium hover:text-primary-600"><span className="h-2.5 w-2.5 rounded-full" style={{ background: SOURCE_COLORS[i % SOURCE_COLORS.length] }} />{s.source}</Link></td>
                    <td className="py-2 text-right tabular-nums">{s.count}</td><td className="py-2 text-right tabular-nums">{Math.round((s.count / m.leadsIn.length) * 100)}%</td>
                  </tr>))}</tbody>
              </table>
            </div>)}
        </Card>
      </div>
    </>
  );
}
