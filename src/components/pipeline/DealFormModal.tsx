import { useState } from 'react';
import { Link } from 'react-router-dom';
import { DEAL_STAGES, PRIORITIES, type BoardStage, type Deal, type Priority } from '../../types';
import { useStore } from '../../store/StoreContext';
import { useFormat } from '../../hooks/useFormat';
import { toDateInput } from '../../lib/dates';
import { addDays } from 'date-fns';
import { Modal, ConfirmDialog } from '../ui/Modal';
import { Button } from '../ui/Button';
import { Badge } from '../ui/Badge';
import { Field, Input, Select, Textarea } from '../ui/Form';

export function DealFormModal({ deal, defaultStage, defaultLeadId, onClose }: { deal?: Deal; defaultStage?: BoardStage; defaultLeadId?: string; onClose: () => void }) {
  const store = useStore();
  const fmt = useFormat();
  const lead0 = store.leadById(deal?.leadId ?? defaultLeadId);
  const [f, setF] = useState({
    leadId: deal?.leadId ?? defaultLeadId ?? '', title: deal?.title ?? (lead0 ? `${lead0.company} - ${lead0.name.split(' ')[0]}` : ''),
    company: deal?.company ?? lead0?.company ?? '', value: deal ? String(deal.value) : lead0 ? String(lead0.value) : '',
    stage: (deal && deal.stage !== 'Lost' ? deal.stage : defaultStage ?? 'New') as BoardStage,
    ownerId: deal?.ownerId ?? lead0?.ownerId ?? store.me.id, priority: (deal?.priority ?? 'Medium') as Priority,
    close: toDateInput(deal ? new Date(deal.expectedClose) : addDays(new Date(), 30)),
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [lostOpen, setLostOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((p) => ({ ...p, [k]: v }));
  const isLost = deal?.stage === 'Lost';
  const tasks = deal ? store.db.tasks.filter((t) => t.dealId === deal.id && !t.completed) : [];

  const pickLead = (id: string) => {
    const l = store.leadById(id);
    setF((p) => ({ ...p, leadId: id, ...(l ? { company: l.company, title: `${l.company} - ${l.name.split(' ')[0]}`, value: p.value || String(l.value), ownerId: l.ownerId } : {}) }));
  };

  const [busy, setBusy] = useState(false);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const err: Record<string, string> = {};
    if (!f.leadId) err.leadId = 'Choose the lead this deal belongs to.';
    if (!f.title.trim()) err.title = 'Enter a deal name.';
    if (!f.company.trim()) err.company = 'Enter a company.';
    const value = Number(f.value);
    if (f.value === '' || Number.isNaN(value) || value < 0) err.value = 'Enter a deal value of 0 or more.';
    if (!f.close || Number.isNaN(new Date(`${f.close}T12:00`).getTime())) err.close = 'Choose an expected close date.';
    setErrors(err);
    if (Object.keys(err).length) return;
    const data = { leadId: f.leadId, title: f.title.trim(), company: f.company.trim(), value, stage: f.stage, ownerId: f.ownerId, priority: f.priority, expectedClose: new Date(`${f.close}T12:00:00`).toISOString() };
    setBusy(true);
    let saved: boolean;
    if (deal) {
      const { stage, leadId: _leadId, ...rest } = data;
      saved = await store.updateDeal(deal.id, isLost ? rest : { ...rest, stage });
    } else saved = !!(await store.addDeal(data));
    setBusy(false);
    if (saved) onClose();
  };

  if (confirmDelete && deal) {
    return <ConfirmDialog title="Delete this deal?" message={<>“{deal.title}” will be permanently removed. Linked tasks stay, but lose their deal link. The lead is not deleted.</>} onConfirm={() => { store.deleteDeal(deal.id); onClose(); }} onClose={() => setConfirmDelete(false)} />;
  }

  return (
    <Modal title={deal ? 'Deal details' : 'Add deal'} description={deal ? undefined : 'Track a new opportunity on the pipeline.'} onClose={onClose} size="lg"
      footer={<>
        {deal && <Button variant="ghost" className="mr-auto !text-red-600 hover:!bg-red-50" onClick={() => setConfirmDelete(true)}>Delete</Button>}
        {deal && !isLost && !lostOpen && <Button onClick={() => setLostOpen(true)}>Mark as lost</Button>}
        {deal && isLost && <Button onClick={() => { store.reopenDeal(deal.id); onClose(); }}>Reopen deal</Button>}
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="primary" type="submit" form="deal-form" disabled={busy}>{deal ? 'Save changes' : 'Add deal'}</Button>
      </>}>
      {deal && (
        <div className="mb-4 flex flex-wrap items-center gap-2 text-sm">
          <Badge tone={deal.stage} />
          {deal.closedAt && <span className="text-ink-soft">Closed {fmt.date(deal.closedAt)}</span>}
          {isLost && deal.lostReason && <span className="text-ink-soft">- Reason: {deal.lostReason}</span>}
          <Link to={`/leads?lead=${deal.leadId}`} onClick={onClose} className="ml-auto font-medium text-primary-600 hover:underline">View lead</Link>
        </div>
      )}
      {lostOpen && deal && (
        <div className="mb-4 rounded-xl border border-red-200 bg-red-50/60 p-4">
          <Field label="Why was this deal lost?" required>{(p) => <Textarea {...p} data-autofocus rows={2} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Chose a competitor, budget cut…" />}</Field>
          <div className="mt-3 flex gap-2">
            <Button variant="danger" size="sm" disabled={!reason.trim()} onClick={() => { store.markDealLost(deal.id, reason.trim()); onClose(); }}>Confirm lost</Button>
            <Button size="sm" onClick={() => setLostOpen(false)}>Cancel</Button>
          </div>
        </div>
      )}
      <form id="deal-form" onSubmit={submit} noValidate className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Lead" required error={errors.leadId} className="sm:col-span-2">{(p) => (
          <Select {...p} value={f.leadId} onChange={(e) => pickLead(e.target.value)} disabled={!!deal}>
            <option value="">Select a lead…</option>
            {[...store.db.leads].sort((a, b) => a.company.localeCompare(b.company)).map((l) => <option key={l.id} value={l.id}>{l.company} - {l.name}</option>)}
          </Select>)}</Field>
        <Field label="Deal name" required error={errors.title}>{(p) => <Input {...p} value={f.title} onChange={(e) => set('title', e.target.value)} invalid={!!errors.title} />}</Field>
        <Field label="Company" required error={errors.company}>{(p) => <Input {...p} value={f.company} onChange={(e) => set('company', e.target.value)} invalid={!!errors.company} />}</Field>
        <Field label="Value" required error={errors.value}>{(p) => <Input {...p} type="number" min="0" step="1" value={f.value} onChange={(e) => set('value', e.target.value)} invalid={!!errors.value} />}</Field>
        <Field label="Stage">{(p) => (
          <Select {...p} value={isLost ? 'Lost' : f.stage} disabled={isLost} onChange={(e) => set('stage', e.target.value as BoardStage)}>
            {isLost && <option>Lost</option>}{DEAL_STAGES.map((s) => <option key={s}>{s}</option>)}
          </Select>)}</Field>
        <Field label="Owner">{(p) => <Select {...p} value={f.ownerId} onChange={(e) => set('ownerId', e.target.value)}>{store.db.owners.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}</Select>}</Field>
        <Field label="Priority">{(p) => <Select {...p} value={f.priority} onChange={(e) => set('priority', e.target.value as Priority)}>{PRIORITIES.map((x) => <option key={x}>{x}</option>)}</Select>}</Field>
        <Field label="Expected close date" required error={errors.close}>{(p) => <Input {...p} type="date" value={f.close} onChange={(e) => set('close', e.target.value)} invalid={!!errors.close} />}</Field>
        <div className="flex items-end text-[13px] text-ink-soft">Win probability at this stage: {isLost ? 0 : store.db.settings.probabilities[f.stage]}%</div>
      </form>
      {tasks.length > 0 && (
        <div className="mt-5">
          <h3 className="mb-2 text-sm font-semibold">Open tasks</h3>
          <ul className="space-y-1 text-sm text-ink-soft">{tasks.map((t) => <li key={t.id}>• {t.title} <span className="text-ink-faint">({fmt.date(t.dueAt)})</span></li>)}</ul>
        </div>
      )}
    </Modal>
  );
}
