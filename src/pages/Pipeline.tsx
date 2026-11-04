import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { CalendarCheck, Filter as FilterIcon, GripVertical, Kanban as KanbanIcon, Layers, List, Plus, Scale, Trophy, Calendar } from 'lucide-react';
import { DEAL_STAGES, PRIORITIES, type BoardStage, type Deal, type DealStage, type Priority } from '../types';
import { useStore } from '../store/StoreContext';
import { useFormat } from '../hooks/useFormat';
import { isOpenDeal, sum, thisMonthRange, thisQuarterRange, weightedValue } from '../lib/metrics';
import { startOfDay } from '../lib/dates';
import { Button } from '../components/ui/Button';
import { Badge, STAGE_COLORS } from '../components/ui/Badge';
import { Avatar, CompanyLogo } from '../components/ui/Avatar';
import { ToolbarSelect } from '../components/ui/Form';
import { Card, EmptyState, PageHeader, Segmented, StatCard } from '../components/ui/Misc';
import { DealFormModal } from '../components/pipeline/DealFormModal';

type Closing = '' | 'overdue' | 'month' | '30d' | 'quarter';
type SortKey = 'close' | 'value' | 'priority' | 'updated';
const STAGE_TINT: Record<BoardStage, string> = { New: '#e8eefc', Qualified: '#e4f5ec', Proposal: '#efe8fb', Negotiation: '#fdf0e1', Won: '#dff3e6' };
const PRIO_ORDER: Record<Priority, number> = { High: 0, Medium: 1, Low: 2 };

export default function Pipeline() {
  const store = useStore();
  const fmt = useFormat();
  const [params, setParams] = useSearchParams();
  const stageParam = params.get('stage') as DealStage | null;
  const dealParam = params.get('deal');
  const [view, setView] = useState<'board' | 'list'>(stageParam ? 'list' : 'board');
  const [owner, setOwner] = useState('');
  const [priority, setPriority] = useState<'' | Priority>('');
  const [closing, setClosing] = useState<Closing>('');
  const [sortKey, setSortKey] = useState<SortKey>('close');
  const [addStage, setAddStage] = useState<BoardStage | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [overStage, setOverStage] = useState<BoardStage | null>(null);

  const { deals, settings } = store.db;
  const now = new Date();

  // Summary cards respect owner + priority only; they carry their own time semantics.
  const scoped = useMemo(() => deals.filter((d) => (!owner || d.ownerId === owner) && (!priority || d.priority === priority)), [deals, owner, priority]);
  const open = scoped.filter(isOpenDeal);
  const month = thisMonthRange(now);
  const quarter = thisQuarterRange(now);
  const closingMonth = open.filter((d) => { const t = new Date(d.expectedClose); return t >= startOfDay(now) && t <= month.end; });
  const wonQuarter = scoped.filter((d) => d.stage === 'Won' && d.closedAt && new Date(d.closedAt) >= quarter.start && new Date(d.closedAt) <= quarter.end);

  const visible = useMemo(() => {
    const within = (d: Deal) => {
      if (!closing) return true;
      const t = new Date(d.expectedClose).getTime();
      const today = startOfDay(now).getTime();
      if (closing === 'overdue') return isOpenDeal(d) && t < today;
      if (closing === 'month') return t >= month.start.getTime() && t <= month.end.getTime();
      if (closing === 'quarter') return t >= quarter.start.getTime() && t <= quarter.end.getTime();
      return t >= today && t <= today + 30 * 86_400_000;
    };
    const cmp: Record<SortKey, (a: Deal, b: Deal) => number> = {
      close: (a, b) => a.expectedClose.localeCompare(b.expectedClose),
      value: (a, b) => b.value - a.value,
      priority: (a, b) => PRIO_ORDER[a.priority] - PRIO_ORDER[b.priority],
      updated: (a, b) => b.updatedAt.localeCompare(a.updatedAt),
    };
    return scoped.filter(within).sort(cmp[sortKey]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scoped, closing, sortKey]);

  const listRows = visible.filter((d) => !stageParam || d.stage === stageParam);
  const lostCount = visible.filter((d) => d.stage === 'Lost').length;
  const editing = dealParam ? store.dealById(dealParam) : undefined;
  const setStageFilter = (v: string) => { const p = new URLSearchParams(params); if (v) p.set('stage', v); else p.delete('stage'); setParams(p, { replace: true }); };
  const closeDeal = () => { const p = new URLSearchParams(params); p.delete('deal'); setParams(p, { replace: true }); };
  const openDeal = (id: string) => { const p = new URLSearchParams(params); p.set('deal', id); setParams(p, { replace: true }); };
  const filtersOn = !!(owner || priority || closing);

  const onDrop = (stage: BoardStage) => {
    if (dragId) store.moveDeal(dragId, stage);
    setDragId(null); setOverStage(null);
  };
  const shift = (d: Deal, dir: 1 | -1) => {
    if (d.stage === 'Lost') return;
    const next = DEAL_STAGES[DEAL_STAGES.indexOf(d.stage) + dir];
    if (next) store.moveDeal(d.id, next);
  };

  const card = (d: Deal) => {
    const lead = store.leadById(d.leadId);
    const o = store.ownerById(d.ownerId);
    const overdue = isOpenDeal(d) && new Date(d.expectedClose) < startOfDay(now);
    return (
      <div key={d.id} role="button" tabIndex={0} draggable aria-label={`${lead?.name ?? d.title}, ${d.company}, ${fmt.money(d.value)}, ${d.stage}. Press Enter to open, Alt plus arrow keys to change stage.`}
        data-testid={`deal-${d.id}`}
        onDragStart={(e) => { setDragId(d.id); e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', d.id); }}
        onDragEnd={() => { setDragId(null); setOverStage(null); }}
        onClick={() => openDeal(d.id)}
        onKeyDown={(e) => {
          if (e.target !== e.currentTarget) return;
          if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openDeal(d.id); }
          if (e.altKey && e.key === 'ArrowRight') { e.preventDefault(); shift(d, 1); }
          if (e.altKey && e.key === 'ArrowLeft') { e.preventDefault(); shift(d, -1); }
        }}
        className={`group cursor-grab rounded-xl border border-line bg-white p-3 shadow-card transition hover:shadow-pop active:cursor-grabbing ${dragId === d.id ? 'opacity-40' : ''}`}>
        <div className="flex items-start gap-2.5">
          <CompanyLogo name={d.company} size={32} />
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-semibold">{lead?.name ?? d.title}</div>
            <div className="truncate text-[13px] text-ink-soft">{d.company}</div>
          </div>
        </div>
        <div className="mt-3 flex items-center justify-between gap-2"><span className="text-lg font-bold tabular-nums">{fmt.money(d.value)}</span><Badge tone={d.priority} /></div>
        <div className="mt-2 flex items-center justify-between gap-2 text-xs text-ink-soft">
          <span className="flex min-w-0 items-center gap-1.5"><Avatar owner={o} size={20} /><span className="truncate">{o?.name.split(' ')[0]}</span></span>
          <span className={`flex shrink-0 items-center gap-1 ${overdue ? 'font-semibold text-red-600' : ''}`}><Calendar className="h-3.5 w-3.5" aria-hidden />{fmt.date(d.expectedClose)}</span>
        </div>
        <div className="hidden [@media(hover:none)]:block mt-2" onClick={(e) => e.stopPropagation()}>
          {d.stage !== 'Lost' && (
            <select aria-label={`Move ${d.company} to stage`} value={d.stage} onChange={(e) => store.moveDeal(d.id, e.target.value as BoardStage)} className="w-full rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs">
              {DEAL_STAGES.map((s) => <option key={s}>{s}</option>)}
            </select>)}
        </div>
      </div>
    );
  };

  return (
    <>
      <PageHeader crumb="Sales" title="Pipeline" subtitle="Manage deals across every stage."
        actions={<>
          <ToolbarSelect label="Expected close" icon={<CalendarCheck className="h-4 w-4" />} value={closing} onChange={(e) => setClosing(e.target.value as Closing)}>
            <option value="">Any close date</option><option value="overdue">Overdue</option><option value="month">This month</option><option value="30d">Next 30 days</option><option value="quarter">This quarter</option>
          </ToolbarSelect>
          <Button variant="primary" icon={<Plus className="h-4 w-4" />} onClick={() => setAddStage('New')}>Add deal</Button>
        </>} />

      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <StatCard icon={<Layers className="h-4 w-4" />} label="Open pipeline value" value={fmt.money(sum(open.map((d) => d.value)))} sub={`${open.length} open deals (excludes Won and Lost)`} />
        <StatCard icon={<Scale className="h-4 w-4" />} label="Weighted value" value={fmt.money(weightedValue(open, settings.probabilities))} sub="Value × stage probability" tint="bg-violet-50 text-violet-600" title="Probabilities are configurable in Settings → Workspace" />
        <StatCard icon={<CalendarCheck className="h-4 w-4" />} label="Closing this month" value={fmt.money(sum(closingMonth.map((d) => d.value)))} sub={`${closingMonth.length} open deals due by ${fmt.date(month.end)}`} tint="bg-emerald-50 text-emerald-600" />
        <StatCard icon={<Trophy className="h-4 w-4" />} label="Won revenue" value={fmt.money(sum(wonQuarter.map((d) => d.value)))} sub={`${wonQuarter.length} deals closed this quarter`} tint="bg-amber-50 text-amber-600" />
      </div>

      <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <Segmented label="View" value={view} onChange={setView} options={[{ value: 'board', label: 'Board', icon: <KanbanIcon className="h-4 w-4" /> }, { value: 'list', label: 'List', icon: <List className="h-4 w-4" /> }]} />
          <ToolbarSelect label="Filter by owner" icon={<FilterIcon className="h-4 w-4" />} value={owner} onChange={(e) => setOwner(e.target.value)} className="min-w-[160px]">
            <option value="">All owners</option>{store.db.owners.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
          </ToolbarSelect>
          <ToolbarSelect label="Filter by priority" value={priority} onChange={(e) => setPriority(e.target.value as Priority | '')} className="min-w-[140px]">
            <option value="">All priorities</option>{PRIORITIES.map((p) => <option key={p}>{p}</option>)}
          </ToolbarSelect>
          {view === 'list' && (
            <ToolbarSelect label="Filter by stage" value={stageParam ?? ''} onChange={(e) => setStageFilter(e.target.value)} className="min-w-[140px]">
              <option value="">All stages</option>{[...DEAL_STAGES, 'Lost'].map((s) => <option key={s}>{s}</option>)}
            </ToolbarSelect>)}
          {(filtersOn || stageParam) && <Button variant="ghost" size="sm" onClick={() => { setOwner(''); setPriority(''); setClosing(''); setStageFilter(''); }}>Clear filters</Button>}
        </div>
        <ToolbarSelect label="Sort deals" value={sortKey} onChange={(e) => setSortKey(e.target.value as SortKey)} className="min-w-[200px]">
          <option value="close">Sort: Expected close</option><option value="value">Sort: Value (high–low)</option><option value="priority">Sort: Priority</option><option value="updated">Sort: Recently updated</option>
        </ToolbarSelect>
      </div>

      {view === 'board' ? (
        <>
          <div className="-mx-4 mt-4 overflow-x-auto px-4 pb-2 sm:mx-0 sm:px-0" data-testid="board">
            <div className="flex gap-3">
              {DEAL_STAGES.map((stage) => {
                const col = visible.filter((d) => d.stage === stage && (stage !== 'Won' || (!!d.closedAt && new Date(d.closedAt) >= quarter.start)));
                return (
                  <section key={stage} aria-label={`${stage} stage`} data-stage={stage}
                    onDragOver={(e) => { if (dragId) { e.preventDefault(); setOverStage(stage); } }}
                    onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setOverStage((s) => (s === stage ? null : s)); }}
                    onDrop={(e) => { e.preventDefault(); onDrop(stage); }}
                    className={`flex w-[264px] shrink-0 flex-col rounded-xl border bg-white/60 p-2 transition-colors xl:min-w-[200px] xl:flex-1 ${overStage === stage ? 'border-primary-500 bg-primary-50/50 ring-2 ring-primary-500/30' : 'border-line'}`}>
                    <div className="rounded-lg px-3 py-2.5" style={{ background: STAGE_TINT[stage] }}>
                      <h2 className="flex items-center gap-2 text-[15px] font-semibold"><span className="h-2 w-2 rounded-full" style={{ background: STAGE_COLORS[stage] }} aria-hidden />{stage}</h2>
                      <p className="text-[13px] text-ink-soft">{col.length} deal{col.length === 1 ? '' : 's'} • {fmt.moneyCompact(sum(col.map((d) => d.value)))}{stage === 'Won' && ' · this quarter'}</p>
                    </div>
                    <div className="mt-2 flex min-h-[120px] flex-1 flex-col gap-2">
                      {col.map(card)}
                      {col.length === 0 && <p className="flex flex-1 items-center justify-center px-2 text-center text-xs text-ink-faint">{filtersOn ? 'No deals match filters' : 'Drop a deal here'}</p>}
                    </div>
                    <button onClick={() => setAddStage(stage)} className="mt-2 flex items-center justify-center gap-1.5 rounded-lg py-2 text-sm font-medium text-primary-600 hover:bg-primary-50"><Plus className="h-4 w-4" />Add deal</button>
                  </section>);
              })}
            </div>
          </div>
          <p className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px] text-ink-soft">
            <span className="flex items-center gap-1.5"><GripVertical className="h-4 w-4" aria-hidden />Drag deals between stages to update your pipeline. Keyboard: focus a card and press Alt + ← / →. The Won column shows this quarter; use List view for older wins.</span>
            {lostCount > 0 && <button className="font-medium text-primary-600 hover:underline" onClick={() => { setStageFilter('Lost'); setView('list'); }}>View {lostCount} lost deal{lostCount === 1 ? '' : 's'}</button>}
          </p>
        </>
      ) : (
        <Card className="mt-4 overflow-hidden">
          {listRows.length === 0 ? <EmptyState icon={<KanbanIcon className="h-6 w-6" />} title="No deals found" message="No deals match the current filters." action={<Button onClick={() => { setOwner(''); setPriority(''); setClosing(''); setStageFilter(''); }}>Clear filters</Button>} /> : (
            <>
              <div className="hidden overflow-x-auto md:block">
                <table className="w-full min-w-[760px] text-left text-sm">
                  <thead><tr className="border-b border-line bg-slate-50/70 text-[13px] text-ink-soft">{['Deal', 'Stage', 'Owner', 'Priority', 'Expected close', 'Value'].map((h, i) => <th key={h} scope="col" className={`px-4 py-3 font-medium ${i === 5 ? 'text-right' : ''}`}>{h}</th>)}</tr></thead>
                  <tbody>{listRows.map((d) => {
                    const o = store.ownerById(d.ownerId);
                    return (
                      <tr key={d.id} className="border-b border-line last:border-0 hover:bg-slate-50/70">
                        <td className="px-4 py-3"><button className="flex items-center gap-3 text-left hover:text-primary-600" onClick={() => openDeal(d.id)}><CompanyLogo name={d.company} size={28} /><span><span className="block font-medium">{store.leadById(d.leadId)?.name ?? d.title}</span><span className="text-xs text-ink-soft">{d.company}</span></span></button></td>
                        <td className="px-4 py-3"><Badge tone={d.stage} /></td>
                        <td className="px-4 py-3"><span className="flex items-center gap-2"><Avatar owner={o} size={24} />{o?.name}</span></td>
                        <td className="px-4 py-3"><Badge tone={d.priority} /></td>
                        <td className="px-4 py-3 text-ink-soft">{fmt.date(d.expectedClose)}</td>
                        <td className="px-4 py-3 text-right font-medium tabular-nums">{fmt.money(d.value)}</td>
                      </tr>);
                  })}</tbody>
                </table>
              </div>
              <ul className="divide-y divide-line md:hidden">{listRows.map((d) => (
                <li key={d.id}><button onClick={() => openDeal(d.id)} className="w-full p-4 text-left">
                  <span className="flex items-center justify-between gap-2"><span className="font-semibold">{store.leadById(d.leadId)?.name ?? d.title}</span><Badge tone={d.stage} /></span>
                  <span className="text-sm text-ink-soft">{d.company} · {store.ownerById(d.ownerId)?.name}</span>
                  <span className="mt-1 flex justify-between text-xs text-ink-soft"><span>{fmt.date(d.expectedClose)} · {d.priority}</span><span className="text-sm font-semibold text-ink">{fmt.money(d.value)}</span></span>
                </button></li>))}</ul>
              <p className="border-t border-line px-4 py-3 text-[13px] text-ink-soft">{listRows.length} deal{listRows.length === 1 ? '' : 's'} · {fmt.money(sum(listRows.map((d) => d.value)))}</p>
            </>)}
        </Card>
      )}

      {addStage && <DealFormModal defaultStage={addStage} onClose={() => setAddStage(null)} />}
      {dealParam && editing && <DealFormModal deal={editing} onClose={closeDeal} />}
      {dealParam && !editing && <DealMissing onClose={closeDeal} />}
    </>
  );
}

import { ConfirmDialog } from '../components/ui/Modal';
function DealMissing({ onClose }: { onClose: () => void }) {
  return <ConfirmDialog title="Deal not found" confirmLabel="Close" message="This deal no longer exists." onConfirm={onClose} onClose={onClose} />;
}
