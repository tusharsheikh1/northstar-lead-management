import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { addDays, addMonths, eachDayOfInterval, endOfMonth, endOfWeek, format, isSameDay, isSameMonth, startOfMonth, startOfWeek } from 'date-fns';
import { Bell, CalendarCheck, CalendarClock, CalendarPlus, Check, CheckCheck, ChevronLeft, ChevronRight, Clock, Pencil, Plus, Trash2, TriangleAlert, ListChecks } from 'lucide-react';
import { PRIORITIES, type Priority, type Task } from '../types';
import { useStore } from '../store/StoreContext';
import { useFormat } from '../hooks/useFormat';
import { startOfDay, toDateInput } from '../lib/dates';
import { Button, IconButton } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { Avatar } from '../components/ui/Avatar';
import { ConfirmDialog } from '../components/ui/Modal';
import { ToolbarSelect } from '../components/ui/Form';
import { Card, EmptyState, PageHeader, StatCard, Tabs } from '../components/ui/Misc';
import { TaskFormModal } from '../components/tasks/TaskFormModal';

type Tab = 'all' | 'mine' | 'assigned' | 'completed';
type Group = 'Overdue' | 'Today' | 'Tomorrow' | 'Later' | 'Earlier';
const GROUP_ORDER: Group[] = ['Overdue', 'Today', 'Tomorrow', 'Later', 'Earlier'];

export default function Tasks() {
  const store = useStore();
  const fmt = useFormat();
  const { tasks, owners } = store.db;
  const [tab, setTab] = useState<Tab>('all');
  const [owner, setOwner] = useState('');
  const [priority, setPriority] = useState<'' | Priority>('');
  const [status, setStatus] = useState<'open' | 'completed' | 'all'>('open');
  const [day, setDay] = useState<Date | null>(null);
  const [month, setMonth] = useState(() => startOfMonth(new Date()));
  const [modal, setModal] = useState<null | { kind: 'add' } | { kind: 'edit'; task: Task } | { kind: 'delete'; task: Task }>(null);

  const now = new Date();
  const today = startOfDay(now);
  const tomorrow = addDays(today, 1);
  const dayAfter = addDays(today, 2);
  const groupOf = (t: Task): Group => {
    const d = new Date(t.dueAt);
    if (d < today) return t.completed ? 'Earlier' : 'Overdue';
    if (d < tomorrow) return 'Today';
    if (d < dayAfter) return 'Tomorrow';
    return 'Later';
  };

  const open = tasks.filter((t) => !t.completed);
  const dueToday = open.filter((t) => groupOf(t) === 'Today');
  const overdue = open.filter((t) => groupOf(t) === 'Overdue');
  const upcoming = open.filter((t) => new Date(t.dueAt) >= tomorrow);
  const weekAgo = addDays(today, -6);
  const doneWeek = tasks.filter((t) => t.completed && t.completedAt && new Date(t.completedAt) >= weekAgo);
  const todaysAll = tasks.filter((t) => groupOf(t) === 'Today');

  const base = useMemo(() => tasks.filter((t) =>
    (!owner || t.ownerId === owner) && (!priority || t.priority === priority) && (!day || isSameDay(new Date(t.dueAt), day))),
  [tasks, owner, priority, day]);
  const inTab = (t: Task, k: Tab) => k === 'mine' ? t.ownerId === store.me.id : k === 'assigned' ? t.assignedById === store.me.id && t.ownerId !== store.me.id : k === 'completed' ? t.completed : true;
  const statusOk = (t: Task) => tab === 'completed' ? t.completed : status === 'all' ? true : status === 'open' ? !t.completed : t.completed;
  const visible = base.filter((t) => inTab(t, tab) && statusOk(t));
  const tabCount = (k: Tab) => base.filter((t) => inTab(t, k) && (k === 'completed' ? true : !t.completed)).length;

  const grouped = GROUP_ORDER.map((g) => ({ g, items: visible.filter((t) => groupOf(t) === g).sort((a, b) => (g === 'Earlier' ? b.dueAt.localeCompare(a.dueAt) : a.dueAt.localeCompare(b.dueAt))) })).filter((x) => x.items.length);

  const mineToday = todaysAll.filter((t) => t.ownerId === store.me.id);
  const mineDone = mineToday.filter((t) => t.completed).length;
  const pct = mineToday.length ? Math.round((mineDone / mineToday.length) * 100) : 0;
  const reminder = open.filter((t) => t.ownerId === store.me.id && new Date(t.dueAt) >= now).sort((a, b) => a.dueAt.localeCompare(b.dueAt))[0];

  const days = eachDayOfInterval({ start: startOfWeek(month), end: endOfWeek(endOfMonth(month)) });
  const hasTasks = (d: Date) => tasks.some((t) => isSameDay(new Date(t.dueAt), d));
  const R = 46; const C = 2 * Math.PI * R;
  const dueLabel = (t: Task, g: Group) => (g === 'Today' || g === 'Tomorrow' ? fmt.time(t.dueAt) : `${fmt.date(t.dueAt)}, ${fmt.time(t.dueAt)}`);

  return (
    <>
      <PageHeader crumb="Tasks" title="Tasks" subtitle="Stay on top of follow-ups and keep deals moving."
        actions={<Button variant="primary" icon={<Plus className="h-4 w-4" />} onClick={() => setModal({ kind: 'add' })}>Add task</Button>} />

      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <StatCard icon={<CalendarCheck className="h-4 w-4" />} label="Due today" value={dueToday.length} sub={`${todaysAll.length} scheduled today in total`} tint="bg-red-50 text-red-500" />
        <StatCard icon={<TriangleAlert className="h-4 w-4" />} label="Overdue" value={overdue.length} sub={overdue.length ? 'Open and past their due date' : 'Nothing overdue'} tint="bg-red-50 text-red-600" />
        <StatCard icon={<CalendarClock className="h-4 w-4" />} label="Upcoming" value={upcoming.length} sub="Open, due tomorrow or later" />
        <StatCard icon={<CheckCheck className="h-4 w-4" />} label="Completed" value={doneWeek.length} sub="In the last 7 days" tint="bg-emerald-50 text-emerald-600" />
      </div>

      <div className="mt-6 grid grid-cols-[minmax(0,1fr)] gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
        <Card>
          <div className="flex flex-wrap items-center justify-between gap-3 px-4 pt-3">
            <Tabs label="Task views" value={tab} onChange={setTab} tabs={[
              { value: 'all', label: 'All tasks', count: tabCount('all') }, { value: 'mine', label: 'My tasks', count: tabCount('mine') },
              { value: 'assigned', label: 'Assigned by me', count: tabCount('assigned') }, { value: 'completed', label: 'Completed', count: tabCount('completed') }]} />
          </div>
          <div className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-3">
            <ToolbarSelect label="Filter by owner" value={owner} onChange={(e) => setOwner(e.target.value)} className="min-w-[150px]"><option value="">All owners</option>{owners.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}</ToolbarSelect>
            <ToolbarSelect label="Filter by priority" value={priority} onChange={(e) => setPriority(e.target.value as Priority | '')} className="min-w-[140px]"><option value="">All priorities</option>{PRIORITIES.map((p) => <option key={p}>{p}</option>)}</ToolbarSelect>
            <ToolbarSelect label="Filter by status" value={tab === 'completed' ? 'completed' : status} disabled={tab === 'completed'} onChange={(e) => setStatus(e.target.value as 'open' | 'completed' | 'all')} className="min-w-[140px]">
              <option value="open">Open</option><option value="completed">Completed</option><option value="all">Open + completed</option>
            </ToolbarSelect>
            {(owner || priority || day || status !== 'open') && <Button size="sm" variant="ghost" onClick={() => { setOwner(''); setPriority(''); setDay(null); setStatus('open'); }}>Clear filters</Button>}
            {day && <span className="rounded-lg bg-primary-50 px-2.5 py-1 text-[13px] font-medium text-primary-700">Showing {format(day, 'EEE, MMM d')}</span>}
          </div>

          {grouped.length === 0 ? (
            <EmptyState icon={<ListChecks className="h-6 w-6" />} title={tasks.length ? 'No tasks match' : 'No tasks yet'}
              message={tasks.length ? 'Nothing matches these filters. Try clearing them.' : 'Add a task to start tracking follow-ups.'}
              action={<Button variant="primary" onClick={() => setModal({ kind: 'add' })}>Add task</Button>} />
          ) : grouped.map(({ g, items }) => (
            <section key={g} aria-label={g}>
              <h2 className={`px-4 py-2 text-sm font-semibold ${g === 'Overdue' ? 'bg-red-50 text-red-700' : 'bg-slate-50 text-ink'}`}>
                {g === 'Today' ? `Today · ${format(now, 'EEEE, MMMM d')}` : g === 'Tomorrow' ? `Tomorrow · ${format(tomorrow, 'EEEE, MMMM d')}` : g} ({items.length})
              </h2>
              <ul>
                {items.map((t) => {
                  const lead = store.leadById(t.leadId); const deal = store.dealById(t.dealId); const o = store.ownerById(t.ownerId);
                  return (
                    <li key={t.id} className="flex items-center gap-3 border-b border-line px-4 py-3 last:border-0 hover:bg-slate-50/60">
                      <button role="checkbox" aria-checked={t.completed} aria-label={`${t.completed ? 'Reopen' : 'Complete'} task: ${t.title}`} onClick={() => store.setTaskCompleted(t.id, !t.completed)}
                        className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 ${t.completed ? 'border-emerald-500 bg-emerald-500 text-white' : 'border-slate-300 hover:border-primary-500'}`}>
                        {t.completed && <Check className="h-3 w-3" strokeWidth={3} />}
                      </button>
                      <div className="min-w-0 flex-1">
                        <p className={`truncate text-sm font-semibold ${t.completed ? 'text-ink-faint line-through' : ''}`}>{t.title}</p>
                        <p className="truncate text-[13px] text-ink-soft">
                          {lead ? <Link className="text-primary-600 hover:underline" to={`/leads?lead=${lead.id}`}>{lead.company}</Link> : <span>No linked lead</span>}
                          {deal && <span> · Deal: {deal.stage}</span>}
                          <span className="sm:hidden"> · {dueLabel(t, g)}</span>
                        </p>
                      </div>
                      <Badge tone={g === 'Overdue' ? 'Overdue' : t.priority} className="hidden sm:inline-flex">{g === 'Overdue' ? `Overdue · ${t.priority}` : t.priority}</Badge>
                      <span className="hidden w-40 items-center gap-1.5 text-[13px] text-ink-soft lg:flex"><Clock className="h-3.5 w-3.5 shrink-0" aria-hidden />{dueLabel(t, g)}</span>
                      <span className="hidden w-32 items-center gap-2 text-[13px] md:flex"><Avatar owner={o} size={26} /><span className="truncate">{o?.name}</span></span>
                      <IconButton label={`Edit task: ${t.title}`} onClick={() => setModal({ kind: 'edit', task: t })}><Pencil className="h-4 w-4" /></IconButton>
                      <IconButton label={`Delete task: ${t.title}`} onClick={() => setModal({ kind: 'delete', task: t })}><Trash2 className="h-4 w-4" /></IconButton>
                    </li>);
                })}
              </ul>
            </section>))}
        </Card>

        <div className="space-y-5">
          <Card className="p-4 sm:p-5">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-lg font-semibold" aria-live="polite">{format(month, 'MMMM yyyy')}</h2>
              <div className="flex gap-1"><IconButton label="Previous month" onClick={() => setMonth(addMonths(month, -1))}><ChevronLeft className="h-5 w-5" /></IconButton><IconButton label="Next month" onClick={() => setMonth(addMonths(month, 1))}><ChevronRight className="h-5 w-5" /></IconButton></div>
            </div>
            <div className="grid grid-cols-7 text-center text-xs text-ink-soft">{['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => <div key={d} className="py-1.5">{d}</div>)}</div>
            <div className="grid grid-cols-7 gap-y-1" role="grid" aria-label="Calendar">
              {days.map((d) => {
                const sel = day && isSameDay(d, day); const isToday = isSameDay(d, now); const dot = hasTasks(d);
                return (
                  <button key={d.toISOString()} onClick={() => setDay(sel ? null : d)} aria-pressed={!!sel} aria-label={`${format(d, 'EEEE, MMMM d')}${dot ? ', has tasks' : ''}`}
                    className={`relative mx-auto flex h-9 w-9 flex-col items-center justify-center rounded-lg text-sm ${sel ? 'bg-primary-500 font-semibold text-white' : isToday ? 'bg-primary-50 font-semibold text-primary-700' : isSameMonth(d, month) ? 'hover:bg-slate-100' : 'text-ink-faint hover:bg-slate-50'}`}>
                    {d.getDate()}
                    {dot && <span className={`absolute bottom-1 h-1 w-1 rounded-full ${sel ? 'bg-white' : 'bg-primary-500'}`} aria-hidden />}
                  </button>);
              })}
            </div>
            <p className="mt-3 flex items-center gap-2 text-xs text-ink-soft"><span className="h-2 w-2 rounded-full bg-primary-500" aria-hidden />Has tasks · select a day to filter the list</p>
            <Button size="sm" className="mt-3 w-full" icon={<CalendarPlus className="h-4 w-4" />} onClick={() => setModal({ kind: 'add' })}>{day ? `Add task on ${format(day, 'MMM d')}` : 'Add task'}</Button>
          </Card>

          <Card className="p-4 sm:p-5">
            <h2 className="text-lg font-semibold">My focus</h2>
            <p className="text-[13px] text-ink-soft">Your tasks due today</p>
            <div className="mt-4 flex items-center gap-5">
              <div className="relative h-[112px] w-[112px] shrink-0" role="img" aria-label={`${mineDone} of ${mineToday.length} tasks completed today`}>
                <svg viewBox="0 0 112 112" className="-rotate-90"><circle cx="56" cy="56" r={R} fill="none" stroke="#e8ecf6" strokeWidth="9" /><circle cx="56" cy="56" r={R} fill="none" stroke="#4169E1" strokeWidth="9" strokeLinecap="round" strokeDasharray={C} strokeDashoffset={C * (1 - pct / 100)} /></svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center"><span className="text-lg font-bold">{mineDone} of {mineToday.length}</span><span className="text-xs text-ink-soft">completed</span></div>
              </div>
              <div><p className="text-lg font-bold">{mineToday.length - mineDone} task{mineToday.length - mineDone === 1 ? '' : 's'} remaining</p><p className="text-[13px] text-ink-soft">{pct}% of today’s tasks completed</p></div>
            </div>
            {reminder ? (
              <button onClick={() => setModal({ kind: 'edit', task: reminder })} className="mt-4 flex w-full items-center gap-3 rounded-xl bg-primary-50 p-3 text-left hover:bg-primary-100/70">
                <Bell className="h-5 w-5 shrink-0 text-primary-500" aria-hidden />
                <span className="min-w-0 flex-1"><span className="block text-sm font-semibold text-primary-700">Next up</span><span className="block truncate text-sm font-medium">{reminder.title}</span><span className="text-xs text-ink-soft">{isSameDay(new Date(reminder.dueAt), now) ? 'Today' : fmt.date(reminder.dueAt)} at {fmt.time(reminder.dueAt)}</span></span>
                <ChevronRight className="h-4 w-4 text-ink-soft" aria-hidden />
              </button>) : <p className="mt-4 rounded-xl bg-slate-50 p-3 text-sm text-ink-soft">No upcoming tasks assigned to you.</p>}
            <p className="mt-2 text-xs text-ink-faint">Reminders are shown in-app only. Email reminders require setup (see Settings).</p>
          </Card>
        </div>
      </div>

      {modal?.kind === 'add' && <TaskFormModal defaults={{ date: toDateInput(day ?? new Date()) }} onClose={() => setModal(null)} />}
      {modal?.kind === 'edit' && <TaskFormModal task={modal.task} onClose={() => setModal(null)} />}
      {modal?.kind === 'delete' && <ConfirmDialog title="Delete this task?" message={<>“{modal.task.title}” will be permanently deleted.</>} onConfirm={() => store.deleteTask(modal.task.id)} onClose={() => setModal(null)} />}
    </>
  );
}
