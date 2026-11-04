import { useState } from 'react';
import { LEAD_STATUSES, type Lead, type LeadStatus } from '../../types';
import { useStore } from '../../store/StoreContext';
import { useSources } from '../../hooks/useSources';
import { isEmail } from '../../lib/validate';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { Field, Input, Select, Textarea } from '../ui/Form';

export function LeadFormModal({ lead, onClose, onSaved }: { lead?: Lead; onClose: () => void; onSaved?: (l: Lead) => void }) {
  const store = useStore();
  const sources = useSources();
  const [f, setF] = useState({
    name: lead?.name ?? '', company: lead?.company ?? '', email: lead?.email ?? '', phone: lead?.phone ?? '',
    status: (lead?.status ?? 'New') as LeadStatus, ownerId: lead?.ownerId ?? store.me.id,
    source: lead?.source ?? 'Website', value: lead ? String(lead.value) : '', notes: lead?.notes ?? '',
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((p) => ({ ...p, [k]: v }));

  const [busy, setBusy] = useState(false);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const err: Record<string, string> = {};
    if (!f.name.trim()) err.name = 'Enter the lead’s name.';
    if (!f.company.trim()) err.company = 'Enter a company.';
    if (f.email && !isEmail(f.email.trim())) err.email = 'Enter a valid email address, e.g. name@company.com.';
    const value = f.value === '' ? 0 : Number(f.value);
    if (Number.isNaN(value) || value < 0) err.value = 'Estimated value must be a number of 0 or more.';
    setErrors(err);
    if (Object.keys(err).length) return;
    const data = { name: f.name.trim(), company: f.company.trim(), email: f.email.trim(), phone: f.phone.trim(), status: f.status, ownerId: f.ownerId, source: f.source, value, notes: f.notes.trim() };
    setBusy(true);
    let saved: Lead | undefined;
    if (lead) saved = (await store.updateLead(lead.id, data)) ? { ...lead, ...data } : undefined;
    else saved = await store.addLead(data);
    setBusy(false);
    if (!saved) return; // the store already showed the error; keep the form open
    onSaved?.(saved);
    onClose();
  };

  return (
    <Modal title={lead ? 'Edit lead' : 'Add lead'} description={lead ? undefined : 'Create a new lead in your workspace.'} onClose={onClose} size="lg"
      footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" type="submit" form="lead-form" disabled={busy}>{lead ? 'Save changes' : 'Add lead'}</Button></>}>
      <form id="lead-form" onSubmit={submit} noValidate className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Full name" required error={errors.name}>{(p) => <Input {...p} data-autofocus value={f.name} onChange={(e) => set('name', e.target.value)} invalid={!!errors.name} autoComplete="off" />}</Field>
        <Field label="Company" required error={errors.company}>{(p) => <Input {...p} value={f.company} onChange={(e) => set('company', e.target.value)} invalid={!!errors.company} autoComplete="off" />}</Field>
        <Field label="Email" error={errors.email}>{(p) => <Input {...p} type="email" value={f.email} onChange={(e) => set('email', e.target.value)} invalid={!!errors.email} />}</Field>
        <Field label="Phone">{(p) => <Input {...p} type="tel" value={f.phone} onChange={(e) => set('phone', e.target.value)} />}</Field>
        <Field label="Status">{(p) => <Select {...p} value={f.status} onChange={(e) => set('status', e.target.value as LeadStatus)}>{LEAD_STATUSES.map((s) => <option key={s}>{s}</option>)}</Select>}</Field>
        <Field label="Owner">{(p) => <Select {...p} value={f.ownerId} onChange={(e) => set('ownerId', e.target.value)}>{store.db.owners.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}</Select>}</Field>
        <Field label="Source">{(p) => <Select {...p} value={f.source} onChange={(e) => set('source', e.target.value)}>{sources.map((s) => <option key={s}>{s}</option>)}</Select>}</Field>
        <Field label="Estimated value" error={errors.value}>{(p) => <Input {...p} type="number" min="0" step="1" inputMode="decimal" value={f.value} onChange={(e) => set('value', e.target.value)} invalid={!!errors.value} placeholder="0" />}</Field>
        <Field label="Notes" className="sm:col-span-2">{(p) => <Textarea {...p} rows={3} value={f.notes} onChange={(e) => set('notes', e.target.value)} />}</Field>
      </form>
    </Modal>
  );
}
