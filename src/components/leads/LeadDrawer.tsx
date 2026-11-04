import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Ban, Building2, CalendarPlus, Handshake, Mail, MessageSquare, MessageSquarePlus, Pencil, Phone, Plus, Send, Trash2 } from 'lucide-react';
import { LEAD_STATUSES, type Lead, type LeadStatus } from '../../types';
import { useStore } from '../../store/StoreContext';
import { useFormat } from '../../hooks/useFormat';
import { Drawer } from '../ui/Drawer';
import { Avatar, CompanyLogo } from '../ui/Avatar';
import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';
import { Select, Textarea } from '../ui/Form';
import { LeadFormModal } from './LeadFormModal';
import { DealFormModal } from '../pipeline/DealFormModal';
import { TaskFormModal } from '../tasks/TaskFormModal';
import { ConfirmDialog } from '../ui/Modal';
import { SendMessageModal } from './SendMessageModal';
import { api } from '../../api/client';
import { normalizeBdMobile } from '../../lib/phone';

function Section({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="border-t border-line px-5 py-4">
      <div className="mb-3 flex items-center justify-between"><h3 className="text-sm font-semibold">{title}</h3>{action}</div>
      {children}
    </section>
  );
}

interface LeadMessage { id: string; channel: 'email' | 'sms'; to: string; subject: string | null; body: string; status: string; error: string | null; sender: string | null; createdAt: string }
const STATUS_TONE: Record<string, string> = { sent: 'success', queued: 'info', logged: 'warning', skipped: 'warning', failed: 'Overdue' };
const STATUS_LABEL: Record<string, string> = { sent: 'Sent', queued: 'Sending…', logged: 'Logged (not delivered)', skipped: 'Not sent — channel not configured', failed: 'Failed' };

function MessageHistory({ leadId, refreshKey }: { leadId: string; refreshKey: number }) {
  const fmt = useFormat();
  const [items, setItems] = useState<LeadMessage[] | null>(null);
  const load = useCallback(() => api.get<{ messages: LeadMessage[] }>(`/leads/${leadId}/messages`).then((r) => setItems(r.messages)).catch(() => setItems([])), [leadId]);
  useEffect(() => { load(); }, [load, refreshKey]);
  // While something is still queued, check again every few seconds.
  useEffect(() => {
    if (!items?.some((m) => m.status === 'queued')) return;
    const t = setTimeout(load, 3000);
    return () => clearTimeout(t);
  }, [items, load]);
  if (items === null) return <p className="text-sm text-ink-soft">Loading…</p>;
  if (!items.length) return <p className="text-sm text-ink-soft">No emails or SMS sent to this lead yet.</p>;
  return (
    <ul className="space-y-3">
      {items.map((m) => (
        <li key={m.id} className="rounded-lg border border-line p-3 text-sm">
          <div className="flex items-center justify-between gap-2">
            <span className="flex items-center gap-1.5 font-medium">{m.channel === 'email' ? <Mail className="h-3.5 w-3.5" aria-hidden /> : <MessageSquare className="h-3.5 w-3.5" aria-hidden />}{m.channel === 'email' ? m.subject : 'SMS'}</span>
            <Badge tone={STATUS_TONE[m.status] ?? 'neutral'}>{STATUS_LABEL[m.status] ?? m.status}</Badge>
          </div>
          <p className="mt-1 line-clamp-2 whitespace-pre-line text-ink-soft">{m.body}</p>
          <p className="mt-1 text-xs text-ink-soft">To {m.to} · {m.sender ?? 'System'} · {fmt.relative(m.createdAt)}</p>
          {m.error && m.status !== 'sent' && <p className="mt-1 text-xs text-red-600">{m.error}</p>}
        </li>))}
    </ul>
  );
}

export function LeadDrawer({ lead, onClose }: { lead: Lead; onClose: () => void }) {
  const store = useStore();
  const fmt = useFormat();
  const [modal, setModal] = useState<'edit' | 'deal' | 'task' | 'delete' | 'email' | 'sms' | null>(null);
  const [msgKey, setMsgKey] = useState(0);
  const [note, setNote] = useState('');
  const owner = store.ownerById(lead.ownerId);
  const deals = store.db.deals.filter((d) => d.leadId === lead.id);
  const tasks = store.db.tasks.filter((t) => t.leadId === lead.id).sort((a, b) => a.dueAt.localeCompare(b.dueAt));
  const notes = store.db.notes.filter((n) => n.leadId === lead.id);
  const history = store.db.activities.filter((a) => a.leadId === lead.id).slice(0, 12);

  const channels = store.db.settings.channels ?? { email: 'none', sms: 'none' };
  const blockedReason = (c: 'email' | 'sms') =>
    lead.doNotContact ? 'Marked Do not contact' : channels[c] === 'none' ? `${c === 'email' ? 'Email' : 'SMS'} is not configured on this server`
      : c === 'email' ? (lead.email ? undefined : 'This lead has no email address') : normalizeBdMobile(lead.phone) ? undefined : 'Needs a Bangladeshi mobile number';
  const saveNote = () => { if (!note.trim()) return; store.addNote(lead.id, note.trim()); setNote(''); };
  const detail = (label: string, value: React.ReactNode) => (
    <div><dt className="text-xs text-ink-soft">{label}</dt><dd className="mt-0.5 text-sm font-medium">{value}</dd></div>
  );

  return (
    <>
      <Drawer title="Lead details" onClose={onClose}>
        <div className="px-5 pb-5 pt-4">
          <div className="flex items-start gap-3">
            <Avatar name={lead.name} size={48} />
            <div className="min-w-0 flex-1">
              <h3 className="truncate text-lg font-semibold" data-testid="drawer-name">{lead.name}</h3>
              <p className="flex items-center gap-1.5 text-sm text-ink-soft"><CompanyLogo name={lead.company} size={18} />{lead.company}</p>
            </div>
            <Button size="sm" icon={<Pencil className="h-3.5 w-3.5" />} onClick={() => setModal('edit')}>Edit</Button>
            <Button size="sm" variant="ghost" aria-label="Delete lead" className="!px-2 !text-red-600 hover:!bg-red-50" onClick={() => setModal('delete')}><Trash2 className="h-4 w-4" /></Button>
          </div>
          <div className="mt-4 flex items-center gap-3">
            {lead.doNotContact && <Badge tone="Lost"><Ban className="mr-1 h-3 w-3" aria-hidden />Do not contact</Badge>}
            <Badge tone={lead.status} />
            <div className="w-44"><Select aria-label="Change status" value={lead.status} onChange={(e) => store.updateLead(lead.id, { status: e.target.value as LeadStatus })}>{LEAD_STATUSES.map((s) => <option key={s}>{s}</option>)}</Select></div>
          </div>
        </div>

        <Section title="Contact information">
          <dl className="grid grid-cols-2 gap-4">
            {detail('Email', lead.email ? <a className="inline-flex items-center gap-1.5 text-primary-600 hover:underline" href={`mailto:${lead.email}`}><Mail className="h-3.5 w-3.5" />{lead.email}</a> : '—')}
            {detail('Phone', lead.phone ? <a className="inline-flex items-center gap-1.5 text-primary-600 hover:underline" href={`tel:${lead.phone}`}><Phone className="h-3.5 w-3.5" />{lead.phone}</a> : '—')}
            {detail('Company', <span className="inline-flex items-center gap-1.5"><Building2 className="h-3.5 w-3.5 text-ink-soft" />{lead.company}</span>)}
            {detail('Source', lead.source)}
            {detail('Owner', <span className="inline-flex items-center gap-2"><Avatar owner={owner} size={20} />{owner?.name ?? 'Unassigned'}</span>)}
            {detail('Estimated value', fmt.money(lead.value))}
            {detail('Created', fmt.date(lead.createdAt))}
            {detail('Last activity', fmt.relative(lead.lastActivityAt))}
          </dl>
        </Section>

        <Section title="Messages" action={
          <span className="flex gap-2">
            <Button size="sm" icon={<Mail className="h-3.5 w-3.5" />} onClick={() => setModal('email')} disabled={!lead.email || lead.doNotContact || channels.email === 'none'} title={blockedReason('email')}>Email</Button>
            <Button size="sm" icon={<Send className="h-3.5 w-3.5" />} onClick={() => setModal('sms')} disabled={!normalizeBdMobile(lead.phone) || lead.doNotContact || channels.sms === 'none'} title={blockedReason('sms')}>SMS</Button>
          </span>}>
          {(channels.email === 'none' || channels.sms === 'none') && <p className="mb-3 text-[13px] text-ink-soft">{[channels.email === 'none' && 'Email', channels.sms === 'none' && 'SMS'].filter(Boolean).join(' and ')} delivery is not set up on this server.</p>}
          <MessageHistory leadId={lead.id} refreshKey={msgKey} />
        </Section>

        <Section title="Notes">
          {lead.notes && <p className="mb-3 rounded-lg bg-slate-50 p-3 text-sm text-ink-soft">{lead.notes}</p>}
          <label htmlFor="new-note" className="sr-only">Add a note</label>
          <Textarea id="new-note" rows={2} placeholder="Add a note…" value={note} onChange={(e) => setNote(e.target.value)} />
          <div className="mt-2 flex justify-end"><Button size="sm" variant="primary" icon={<MessageSquarePlus className="h-3.5 w-3.5" />} disabled={!note.trim()} onClick={saveNote}>Add note</Button></div>
          <ul className="mt-3 space-y-3">
            {notes.map((n) => (
              <li key={n.id} className="text-sm">
                <p>{n.body}</p>
                <p className="mt-0.5 text-xs text-ink-soft">{store.ownerById(n.authorId)?.name} · {fmt.relative(n.createdAt)}</p>
              </li>
            ))}
            {!notes.length && <li className="text-sm text-ink-soft">No notes yet.</li>}
          </ul>
        </Section>

        <Section title="Related deals" action={<Button size="sm" icon={<Plus className="h-3.5 w-3.5" />} onClick={() => setModal('deal')}>Add deal</Button>}>
          {deals.length ? <ul className="space-y-2">{deals.map((d) => (
            <li key={d.id}>
              <Link to={`/pipeline?deal=${d.id}`} className="flex items-center gap-3 rounded-lg border border-line p-3 hover:bg-slate-50">
                <Handshake className="h-4 w-4 text-ink-soft" aria-hidden />
                <span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium">{d.title}</span><span className="text-xs text-ink-soft">Expected close {fmt.date(d.expectedClose)}</span></span>
                <Badge tone={d.stage} /><span className="text-sm font-semibold">{fmt.money(d.value)}</span>
              </Link>
            </li>))}</ul> : <p className="text-sm text-ink-soft">No deals linked to this lead.</p>}
        </Section>

        <Section title="Tasks" action={<Button size="sm" icon={<CalendarPlus className="h-3.5 w-3.5" />} onClick={() => setModal('task')}>Add task</Button>}>
          {tasks.length ? <ul className="space-y-2">{tasks.map((t) => (
            <li key={t.id} className="flex items-center gap-3 text-sm">
              <input type="checkbox" checked={t.completed} aria-label={`Mark "${t.title}" ${t.completed ? 'open' : 'complete'}`} onChange={(e) => store.setTaskCompleted(t.id, e.target.checked)} />
              <span className={`flex-1 ${t.completed ? 'text-ink-faint line-through' : ''}`}>{t.title}</span>
              <span className="text-xs text-ink-soft">{fmt.date(t.dueAt)}</span>
            </li>))}</ul> : <p className="text-sm text-ink-soft">No tasks for this lead.</p>}
        </Section>

        <Section title="Activity history">
          {history.length ? <ol className="space-y-3 border-l border-line pl-4">{history.map((a) => (
            <li key={a.id} className="relative text-sm">
              <span className="absolute -left-[21px] top-1.5 h-2 w-2 rounded-full bg-primary-300" aria-hidden />
              <span className="font-semibold">{store.ownerById(a.actorId)?.name.split(' ')[0]}</span> {a.verb} <span className="font-semibold">{a.subject}</span> {a.detail}
              <span className="block text-xs text-ink-soft">{fmt.relative(a.createdAt)}</span>
            </li>))}</ol> : <p className="text-sm text-ink-soft">No activity recorded.</p>}
        </Section>
      </Drawer>
      {(modal === 'email' || modal === 'sms') && <SendMessageModal lead={lead} channel={modal} onClose={() => setModal(null)} onSent={() => setMsgKey((k) => k + 1)} />}
      {modal === 'edit' && <LeadFormModal lead={lead} onClose={() => setModal(null)} />}
      {modal === 'deal' && <DealFormModal defaultLeadId={lead.id} onClose={() => setModal(null)} />}
      {modal === 'task' && <TaskFormModal defaults={{ leadId: lead.id }} onClose={() => setModal(null)} />}
      {modal === 'delete' && <ConfirmDialog title={`Delete ${lead.name}?`} message={<>This permanently removes the lead and its {deals.length} deal(s), {tasks.length} task(s), notes and activity. This cannot be undone.</>}
        onConfirm={() => { store.deleteLeads([lead.id]); onClose(); }} onClose={() => setModal(null)} />}
    </>
  );
}
