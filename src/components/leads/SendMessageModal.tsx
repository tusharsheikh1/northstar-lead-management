import { useState } from 'react';
import { TriangleAlert } from 'lucide-react';
import type { Lead } from '../../types';
import { useStore } from '../../store/StoreContext';
import { formatBd, normalizeBdMobile } from '../../lib/phone';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { Field, Input, Textarea } from '../ui/Form';

const SMS_MAX = 480;
const isUnicode = (s: string) => /[^\u0000-\u007F]/.test(s); // e.g. Bangla text: 70 characters per SMS segment instead of 160
const segments = (s: string) => (s.length === 0 ? 0 : isUnicode(s) ? Math.ceil(s.length / 67) : Math.ceil(s.length / 153) || 1);

export function SendMessageModal({ lead, channel, onClose, onSent }: { lead: Lead; channel: 'email' | 'sms'; onClose: () => void; onSent?: () => void }) {
  const store = useStore();
  const mode = store.db.settings.channels?.[channel] ?? 'none';
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const to = channel === 'email' ? lead.email : `+${normalizeBdMobile(lead.phone) ? formatBd(normalizeBdMobile(lead.phone)!).slice(1) : lead.phone}`;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const err: Record<string, string> = {};
    if (channel === 'email' && !subject.trim()) err.subject = 'Enter a subject.';
    if (!body.trim()) err.body = 'Enter a message.';
    if (channel === 'sms' && body.length > SMS_MAX) err.body = `SMS is limited to ${SMS_MAX} characters.`;
    setErrors(err);
    if (Object.keys(err).length) return;
    setBusy(true);
    const ok = channel === 'email' ? await store.sendLeadEmail(lead.id, subject.trim(), body.trim()) : await store.sendLeadSms(lead.id, body.trim());
    setBusy(false);
    if (ok) { onSent?.(); onClose(); }
  };

  return (
    <Modal title={channel === 'email' ? `Email ${lead.name}` : `Send SMS to ${lead.name}`} onClose={onClose}
      footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" type="submit" form="send-form" disabled={busy || mode === 'none'}>{busy ? 'Queuing…' : channel === 'email' ? 'Send email' : 'Send SMS'}</Button></>}>
      <form id="send-form" onSubmit={submit} noValidate className="space-y-4">
        {mode === 'log' && <p className="flex gap-2 rounded-lg bg-amber-50 p-3 text-[13px] text-amber-900"><TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />This server is in development mode: the message is written to the server log and <strong>not delivered</strong>.</p>}
        {mode === 'none' && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{channel === 'email' ? 'Email' : 'SMS'} delivery is not configured on this server.</p>}
        <p className="text-sm text-ink-soft">To: <strong className="text-ink">{to}</strong></p>
        {channel === 'email' && <Field label="Subject" required error={errors.subject}>{(p) => <Input {...p} data-autofocus value={subject} onChange={(e) => { setSubject(e.target.value); setErrors((x) => ({ ...x, subject: '' })); }} invalid={!!errors.subject} />}</Field>}
        <Field label="Message" required error={errors.body} hint={channel === 'sms' ? `${body.length}/${SMS_MAX} characters · ${segments(body)} SMS segment${segments(body) === 1 ? '' : 's'}${isUnicode(body) ? ' (Bangla/Unicode text uses shorter segments)' : ''}` : undefined}>
          {(p) => <Textarea {...p} data-autofocus={channel === 'sms'} rows={channel === 'email' ? 7 : 4} value={body} onChange={(e) => { setBody(e.target.value); setErrors((x) => ({ ...x, body: '' })); }} />}
        </Field>
        <p className="text-xs text-ink-soft">Only message people who have agreed to hear from you. Leads marked “Do not contact” are blocked.</p>
      </form>
    </Modal>
  );
}
