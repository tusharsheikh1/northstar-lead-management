import { useState } from 'react';
import { PRIORITIES, type Priority, type Task } from '../../types';
import { useStore } from '../../store/StoreContext';
import { fromInputs, toDateInput, toTimeInput } from '../../lib/dates';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { Field, Input, Select } from '../ui/Form';

export function TaskFormModal({ task, defaults, onClose }: { task?: Task; defaults?: { leadId?: string; dealId?: string; date?: string }; onClose: () => void }) {
  const store = useStore();
  const due = task ? new Date(task.dueAt) : new Date();
  const [f, setF] = useState({
    title: task?.title ?? '', ownerId: task?.ownerId ?? store.me.id, priority: (task?.priority ?? 'Medium') as Priority,
    date: defaults?.date ?? toDateInput(due), time: task ? toTimeInput(due) : '09:00',
    leadId: task?.leadId ?? defaults?.leadId ?? '', dealId: task?.dealId ?? defaults?.dealId ?? '',
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((p) => ({ ...p, [k]: v }));
  const leadDeals = store.db.deals.filter((d) => d.leadId === f.leadId);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const err: Record<string, string> = {};
    if (!f.title.trim()) err.title = 'Enter a task title.';
    if (!f.date) err.date = 'Choose a due date.';
    else if (Number.isNaN(new Date(`${f.date}T00:00`).getTime())) err.date = 'Enter a valid date.';
    setErrors(err);
    if (Object.keys(err).length) return;
    const data = { title: f.title.trim(), ownerId: f.ownerId, priority: f.priority, dueAt: fromInputs(f.date, f.time || '09:00'), leadId: f.leadId || undefined, dealId: f.leadId && f.dealId ? f.dealId : undefined };
    if (task) store.updateTask(task.id, data); else store.addTask(data);
    onClose();
  };

  return (
    <Modal title={task ? 'Edit task' : 'Add task'} onClose={onClose}
      footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" type="submit" form="task-form">{task ? 'Save changes' : 'Add task'}</Button></>}>
      <form id="task-form" onSubmit={submit} noValidate className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Title" required error={errors.title} className="sm:col-span-2">{(p) => <Input {...p} data-autofocus value={f.title} onChange={(e) => set('title', e.target.value)} invalid={!!errors.title} />}</Field>
        <Field label="Due date" required error={errors.date}>{(p) => <Input {...p} type="date" value={f.date} onChange={(e) => set('date', e.target.value)} invalid={!!errors.date} />}</Field>
        <Field label="Due time">{(p) => <Input {...p} type="time" value={f.time} onChange={(e) => set('time', e.target.value)} />}</Field>
        <Field label="Owner">{(p) => <Select {...p} value={f.ownerId} onChange={(e) => set('ownerId', e.target.value)}>{store.db.owners.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}</Select>}</Field>
        <Field label="Priority">{(p) => <Select {...p} value={f.priority} onChange={(e) => set('priority', e.target.value as Priority)}>{PRIORITIES.map((x) => <option key={x}>{x}</option>)}</Select>}</Field>
        <Field label="Related lead">{(p) => (
          <Select {...p} value={f.leadId} onChange={(e) => setF((s) => ({ ...s, leadId: e.target.value, dealId: '' }))}>
            <option value="">None</option>
            {[...store.db.leads].sort((a, b) => a.company.localeCompare(b.company)).map((l) => <option key={l.id} value={l.id}>{l.company} - {l.name}</option>)}
          </Select>)}</Field>
        <Field label="Related deal" hint={f.leadId ? (leadDeals.length ? undefined : 'This lead has no deals yet.') : 'Choose a lead first.'}>{(p) => (
          <Select {...p} value={f.dealId} disabled={!leadDeals.length} onChange={(e) => set('dealId', e.target.value)}>
            <option value="">None</option>{leadDeals.map((d) => <option key={d.id} value={d.id}>{d.title} ({d.stage})</option>)}
          </Select>)}</Field>
      </form>
    </Modal>
  );
}
