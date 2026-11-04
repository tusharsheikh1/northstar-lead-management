import { useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Bell, Building2, CreditCard, Database as DatabaseIcon, Download, Lock, LogOut, Plug, RotateCcw, ShieldCheck, Trash2, Upload, UserPlus, User, Users2, type LucideIcon } from 'lucide-react';
import { OPEN_STAGES, ROLES, type BoardStage, type Role } from '../types';
import { useStore } from '../store/StoreContext';
import { useToast } from '../components/ui/Toast';
import { api, ApiError } from '../api/client';
import { useSession } from '../store/SessionContext';
import { CURRENCIES, DATE_FORMATS, TIME_ZONES } from '../lib/format';
import { isEmail } from '../lib/validate';
import { downloadFile } from '../lib/csv';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { Avatar } from '../components/ui/Avatar';
import { ConfirmDialog, Modal } from '../components/ui/Modal';
import { Field, Input, Select, Switch } from '../components/ui/Form';
import { Card, PageHeader } from '../components/ui/Misc';

const SECTIONS: { id: string; label: string; icon: LucideIcon }[] = [
  { id: 'profile', label: 'Profile', icon: User }, { id: 'workspace', label: 'Workspace', icon: Building2 }, { id: 'team', label: 'Team', icon: Users2 },
  { id: 'notifications', label: 'Notifications', icon: Bell }, { id: 'integrations', label: 'Integrations', icon: Plug }, { id: 'security', label: 'Security', icon: Lock }, { id: 'billing', label: 'Billing', icon: CreditCard },
];

function SetupModal({ title, why, needs, onClose }: { title: string; why: string; needs: string[]; onClose: () => void }) {
  return (
    <Modal title={title} onClose={onClose} footer={<Button variant="primary" onClick={onClose}>Got it</Button>}>
      <div className="space-y-3 text-sm text-ink-soft">
        <div className="flex items-center gap-2"><Badge tone="warning">Requires setup</Badge><span>Not available yet on this server.</span></div>
        <p>{why}</p>
        <p className="font-medium text-ink">What’s needed:</p>
        <ul className="list-disc space-y-1 pl-5">{needs.map((n) => <li key={n}>{n}</li>)}</ul>
      </div>
    </Modal>
  );
}

const SectionCard = ({ title, description, children, footer }: { title: string; description?: string; children: React.ReactNode; footer?: React.ReactNode }) => (
  <Card className="overflow-hidden">
    <div className="border-b border-line px-5 py-4"><h2 className="text-lg font-semibold">{title}</h2>{description && <p className="text-sm text-ink-soft">{description}</p>}</div>
    <div className="p-5">{children}</div>
    {footer && <div className="flex justify-end gap-2 border-t border-line bg-slate-50/60 px-5 py-3">{footer}</div>}
  </Card>
);

function downscale(file: File, size = 160): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const c = document.createElement('canvas'); c.width = c.height = size;
      const s = Math.min(img.width, img.height);
      c.getContext('2d')!.drawImage(img, (img.width - s) / 2, (img.height - s) / 2, s, s, 0, 0, size, size);
      URL.revokeObjectURL(url);
      resolve(c.toDataURL('image/jpeg', 0.85));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('bad image')); };
    img.src = url;
  });
}

function Profile() {
  const { me, updateProfile } = useStore();
  const toast = useToast();
  const [f, setF] = useState({ name: me.name, email: me.email, jobTitle: me.jobTitle });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const file = useRef<HTMLInputElement>(null);
  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    const err: Record<string, string> = {};
    if (!f.name.trim()) err.name = 'Enter your name.';
    if (!isEmail(f.email.trim())) err.email = 'Enter a valid email address.';
    setErrors(err);
    if (Object.keys(err).length) return;
    setBusy(true);
    if (await updateProfile({ name: f.name.trim(), email: f.email.trim(), jobTitle: f.jobTitle.trim() })) toast.success('Profile saved.');
    setBusy(false);
  };
  const pick = async (fl?: File) => {
    if (!fl) return;
    if (!fl.type.startsWith('image/')) { toast.error('Please choose an image file (PNG, JPG or WebP).'); return; }
    try { if (await updateProfile({ photo: await downscale(fl) })) toast.success('Photo updated.'); } catch { toast.error('That image could not be read.'); }
  };
  return (
    <form onSubmit={save} noValidate>
      <SectionCard title="Profile" description="How you appear to teammates in this workspace." footer={<Button variant="primary" type="submit" disabled={busy}>Save profile</Button>}>
        <div className="mb-6 flex items-center gap-4">
          <Avatar owner={me} size={72} />
          <div className="flex flex-wrap gap-2">
            <Button size="sm" icon={<Upload className="h-3.5 w-3.5" />} onClick={() => file.current?.click()}>Upload photo</Button>
            {me.photo && <Button size="sm" variant="ghost" icon={<Trash2 className="h-3.5 w-3.5" />} onClick={async () => { if (await updateProfile({ photo: null })) toast.success('Photo removed.'); }}>Remove</Button>}
            <input ref={file} type="file" accept="image/*" className="sr-only" aria-label="Profile photo" onChange={(e) => { pick(e.target.files?.[0]); e.target.value = ''; }} />
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Full name" required error={errors.name}>{(p) => <Input {...p} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} invalid={!!errors.name} />}</Field>
          <Field label="Job title">{(p) => <Input {...p} value={f.jobTitle} onChange={(e) => setF({ ...f, jobTitle: e.target.value })} />}</Field>
          <Field label="Email" required error={errors.email} hint="This is also your sign-in email." className="sm:col-span-2">{(p) => <Input {...p} type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} invalid={!!errors.email} />}</Field>
        </div>
      </SectionCard>
    </form>
  );
}

function Workspace() {
  const store = useStore();
  const toast = useToast();
  const isAdmin = store.me.role === 'Admin';
  const { workspace, probabilities } = store.db.settings;
  const [w, setW] = useState({ ...workspace, monthlyTarget: String(workspace.monthlyTarget) });
  const [prob, setProb] = useState<Record<BoardStage, string>>(Object.fromEntries(Object.entries(probabilities).map(([k, v]) => [k, String(v)])) as Record<BoardStage, string>);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [confirm, setConfirm] = useState<null | 'sample' | 'clear'>(null);
  const [busy, setBusy] = useState(false);
  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    const err: Record<string, string> = {};
    if (!w.name.trim()) err.name = 'Enter a workspace name.';
    const target = Number(w.monthlyTarget);
    if (w.monthlyTarget === '' || Number.isNaN(target) || target < 0) err.target = 'Enter a target of 0 or more.';
    OPEN_STAGES.forEach((s) => { const n = Number(prob[s]); if (prob[s] === '' || Number.isNaN(n) || n < 0 || n > 100) err[s] = '0–100'; });
    setErrors(err);
    if (Object.keys(err).length) return;
    setBusy(true);
    await store.saveWorkspace({
      name: w.name.trim(), currency: w.currency, language: w.language, timeZone: w.timeZone, dateFormat: w.dateFormat, monthlyTarget: target,
      probabilities: Object.fromEntries(OPEN_STAGES.map((k) => [k, Number(prob[k])])) as Record<string, number>,
    });
    setBusy(false);
  };
  return (
    <div className="space-y-5">
      {!isAdmin && <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900">Only workspace admins can change these settings.</p>}
      <form onSubmit={save} noValidate>
        <fieldset disabled={!isAdmin} className="min-w-0">
          <SectionCard title="Workspace" description="Regional formats apply across every page." footer={<Button variant="primary" type="submit" disabled={!isAdmin || busy}>Save workspace</Button>}>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Workspace name" required error={errors.name} className="sm:col-span-2">{(p) => <Input {...p} value={w.name} onChange={(e) => setW({ ...w, name: e.target.value })} invalid={!!errors.name} />}</Field>
              <Field label="Currency" hint="Changes the currency symbol and formatting only. Amounts are not converted.">{(p) => <Select {...p} value={w.currency} onChange={(e) => setW({ ...w, currency: e.target.value })}>{CURRENCIES.map((c) => <option key={c}>{c}</option>)}</Select>}</Field>
              <Field label="Language" hint="Only English is available in this version.">{(p) => <Select {...p} value={w.language} onChange={(e) => setW({ ...w, language: e.target.value })}><option value="en-US">English (US)</option><option value="en-GB">English (UK) — number formatting</option><option disabled>Español — not available</option><option disabled>Français — not available</option></Select>}</Field>
              <Field label="Time zone" hint="Used when displaying times. Day grouping (Today, Tomorrow) follows your device clock.">{(p) => <Select {...p} value={w.timeZone} onChange={(e) => setW({ ...w, timeZone: e.target.value })}>{TIME_ZONES.map((z) => <option key={z} value={z}>{z === 'auto' ? 'Browser default' : z}</option>)}</Select>}</Field>
              <Field label="Date format">{(p) => <Select {...p} value={w.dateFormat} onChange={(e) => setW({ ...w, dateFormat: e.target.value })}>{DATE_FORMATS.map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}</Select>}</Field>
              <Field label="Monthly revenue target" error={errors.target} hint="Drawn as the dashed line on the revenue trend chart.">{(p) => <Input {...p} type="number" min="0" value={w.monthlyTarget} onChange={(e) => setW({ ...w, monthlyTarget: e.target.value })} invalid={!!errors.target} />}</Field>
            </div>
            <h3 className="mb-1 mt-7 text-sm font-semibold">Stage win probabilities</h3>
            <p className="mb-3 text-[13px] text-ink-soft">Used for the weighted pipeline value. Won deals are always 100%; Lost deals are excluded.</p>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              {OPEN_STAGES.map((s) => <Field key={s} label={`${s} (%)`} error={errors[s]}>{(p) => <Input {...p} type="number" min="0" max="100" value={prob[s]} onChange={(e) => setProb({ ...prob, [s]: e.target.value })} invalid={!!errors[s]} />}</Field>)}
            </div>
          </SectionCard>
        </fieldset>
      </form>
      <SectionCard title="Data" description="Your workspace data is stored in the server’s PostgreSQL database.">
        <div className="flex flex-wrap gap-2">
          <Button icon={<Download className="h-4 w-4" />} onClick={() => downloadFile('northstar-workspace.json', JSON.stringify(store.db, null, 2), 'application/json')}>Export all data (JSON)</Button>
          <Button icon={<DatabaseIcon className="h-4 w-4" />} disabled={!isAdmin} onClick={() => setConfirm('sample')}>Replace with sample data</Button>
          <Button icon={<RotateCcw className="h-4 w-4" />} className="!text-red-600" disabled={!isAdmin} onClick={() => setConfirm('clear')}>Delete all leads, deals and tasks</Button>
        </div>
        {!isAdmin && <p className="mt-3 text-xs text-ink-soft">Only admins can replace or delete workspace data.</p>}
      </SectionCard>
      {confirm === 'sample' && <ConfirmDialog title="Replace with sample data?" confirmLabel="Replace" message="All current leads, deals, tasks, notes and activity will be deleted and replaced with sample records. This cannot be undone." onConfirm={async () => { if (await store.loadSampleData()) toast.info('Workspace now contains sample data.'); }} onClose={() => setConfirm(null)} />}
      {confirm === 'clear' && <ConfirmDialog title="Delete all data?" confirmLabel="Delete everything" message="Every lead, deal, task, note and activity in this workspace will be permanently deleted. Team members and settings are kept. This cannot be undone." onConfirm={() => store.clearData()} onClose={() => setConfirm(null)} />}
    </div>
  );
}

function Team() {
  const store = useStore();
  const isAdmin = store.me.role === 'Admin';
  const [add, setAdd] = useState(false);
  const [f, setF] = useState({ name: '', email: '', jobTitle: '', role: 'Sales rep' as Role, password: '' });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const err: Record<string, string> = {};
    if (!f.name.trim()) err.name = 'Enter a name.';
    if (!isEmail(f.email.trim())) err.email = 'Enter a valid email address.';
    if (f.password.length < 8) err.password = 'Use at least 8 characters.';
    setErrors(err);
    if (Object.keys(err).length) return;
    setBusy(true);
    const ok = await store.addMember({ ...f, name: f.name.trim(), email: f.email.trim(), jobTitle: f.jobTitle.trim() });
    setBusy(false);
    if (ok) { setAdd(false); setF({ name: '', email: '', jobTitle: '', role: 'Sales rep', password: '' }); }
  };
  return (
    <>
      <SectionCard title="Team" description="People in this workspace and what they can do.">
        <ul className="divide-y divide-line">
          {store.db.owners.map((o) => (
            <li key={o.id} className="flex flex-wrap items-center gap-3 py-3">
              <Avatar owner={o} size={40} />
              <div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold">{o.name}{o.id === store.me.id && <span className="ml-2 text-xs font-normal text-ink-soft">(you)</span>}{o.canSignIn === false && <Badge tone="neutral" className="ml-2">Sample member · no login</Badge>}</p><p className="truncate text-[13px] text-ink-soft">{o.jobTitle || 'No title'} · {o.email}</p></div>
              <div className="w-36"><Select aria-label={`Role for ${o.name}`} value={o.role} disabled={!isAdmin || o.id === store.me.id} title={o.id === store.me.id ? 'You cannot change your own role' : !isAdmin ? 'Only admins can change roles' : undefined}
                onChange={(e) => store.setMemberRole(o.id, e.target.value as Role)}>{ROLES.map((r) => <option key={r}>{r}</option>)}</Select></div>
            </li>))}
        </ul>
        <p className="mt-3 text-xs text-ink-soft">Viewers are read-only; only Admins can manage the team and workspace settings.</p>
        <Button className="mt-4" icon={<UserPlus className="h-4 w-4" />} disabled={!isAdmin} onClick={() => setAdd(true)}>Add member</Button>
        {!isAdmin && <p className="mt-2 text-xs text-ink-soft">Only admins can add members.</p>}
      </SectionCard>
      {add && (
        <Modal title="Add team member" description="Creates an account they can sign in with. No email is sent, so share the password securely." onClose={() => setAdd(false)}
          footer={<><Button onClick={() => setAdd(false)}>Cancel</Button><Button variant="primary" type="submit" form="member-form" disabled={busy}>Add member</Button></>}>
          <form id="member-form" onSubmit={submit} noValidate className="grid gap-4 sm:grid-cols-2">
            <Field label="Full name" required error={errors.name}>{(p) => <Input {...p} data-autofocus value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} invalid={!!errors.name} />}</Field>
            <Field label="Job title">{(p) => <Input {...p} value={f.jobTitle} onChange={(e) => setF({ ...f, jobTitle: e.target.value })} />}</Field>
            <Field label="Email" required error={errors.email}>{(p) => <Input {...p} type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} invalid={!!errors.email} />}</Field>
            <Field label="Role">{(p) => <Select {...p} value={f.role} onChange={(e) => setF({ ...f, role: e.target.value as Role })}>{ROLES.map((r) => <option key={r}>{r}</option>)}</Select>}</Field>
            <Field label="Initial password" required error={errors.password} hint="At least 8 characters." className="sm:col-span-2">{(p) => <Input {...p} type="text" autoComplete="off" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} invalid={!!errors.password} />}</Field>
          </form>
        </Modal>
      )}
    </>
  );
}

function Notifications() {
  const { db, saveNotifications } = useStore();
  const n = db.settings.notifications;
  return (
    <SectionCard title="Notifications" description="Choose what you’d like to hear about.">
      <div className="mb-5 flex items-center gap-2 rounded-xl bg-amber-50 p-3 text-sm text-amber-900"><Badge tone="warning">Requires setup</Badge>Email delivery is not connected on this server, so no emails are sent yet. Your preferences are saved and will apply once it is.</div>
      <div className="space-y-5">
        <Switch label="Email updates" description="Activity on leads and deals you own." checked={n.emailUpdates} onChange={(v) => saveNotifications({ emailUpdates: v })} />
        <Switch label="Task reminders" description="Reminders before a task is due." checked={n.taskReminders} onChange={(v) => saveNotifications({ taskReminders: v })} />
        <Switch label="Weekly summary" description="A digest of pipeline changes every Monday." checked={n.weeklySummary} onChange={(v) => saveNotifications({ weeklySummary: v })} />
      </div>
    </SectionCard>
  );
}

function Integrations() {
  const [open, setOpen] = useState<string | null>(null);
  const items = [
    { name: 'Google Workspace', desc: 'Sync Gmail and Calendar with leads and tasks.', needs: ['A Google OAuth client', 'A backend to store refresh tokens securely'] },
    { name: 'Slack', desc: 'Post deal updates to a channel.', needs: ['A Slack app with OAuth', 'A backend to send messages'] },
    { name: 'Zapier', desc: 'Trigger workflows when leads change.', needs: ['A public webhook endpoint', 'API keys managed server-side'] },
    { name: 'Webhooks', desc: 'Send events to your own systems.', needs: ['A backend to deliver and retry events'] },
    { name: 'HubSpot import', desc: 'Migrate contacts and deals.', needs: ['A HubSpot OAuth app', 'A backend to call the HubSpot API'] },
  ];
  const cur = items.find((i) => i.name === open);
  return (
    <>
      <SectionCard title="Integrations" description="Connect Northstar to the tools your team uses.">
        <ul className="divide-y divide-line">{items.map((i) => (
          <li key={i.name} className="flex flex-wrap items-center gap-3 py-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-slate-100 text-ink-soft"><Plug className="h-5 w-5" /></span>
            <div className="min-w-0 flex-1"><p className="text-sm font-semibold">{i.name}</p><p className="text-[13px] text-ink-soft">{i.desc}</p></div>
            <Badge tone="neutral">Not connected</Badge>
            <Button size="sm" onClick={() => setOpen(i.name)}>Set up</Button>
          </li>))}</ul>
      </SectionCard>
      {cur && <SetupModal title={`Connect ${cur.name}`} why="Connecting needs server-side credentials, which have not been configured on this server. Nothing has been connected." needs={cur.needs} onClose={() => setOpen(null)} />}
    </>
  );
}

function ChangePassword() {
  const toast = useToast();
  const [f, setF] = useState({ current: '', next: '', confirm: '' });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const err: Record<string, string> = {};
    if (!f.current) err.current = 'Enter your current password.';
    if (f.next.length < 8) err.next = 'Use at least 8 characters.';
    if (f.confirm !== f.next) err.confirm = 'Passwords do not match.';
    setErrors(err);
    if (Object.keys(err).length) return;
    setBusy(true);
    try {
      await api.post('/auth/change-password', { currentPassword: f.current, newPassword: f.next });
      toast.success('Password changed.');
      setF({ current: '', next: '', confirm: '' });
    } catch (ex) {
      if (ex instanceof ApiError) { setErrors(ex.fields?.currentPassword ? { current: ex.fields.currentPassword } : {}); toast.error(ex.message); }
    }
    setBusy(false);
  };
  return (
    <form onSubmit={submit} noValidate className="grid gap-4 sm:grid-cols-3">
      <Field label="Current password" error={errors.current}>{(p) => <Input {...p} type="password" autoComplete="current-password" value={f.current} onChange={(e) => setF({ ...f, current: e.target.value })} invalid={!!errors.current} />}</Field>
      <Field label="New password" error={errors.next}>{(p) => <Input {...p} type="password" autoComplete="new-password" value={f.next} onChange={(e) => setF({ ...f, next: e.target.value })} invalid={!!errors.next} />}</Field>
      <Field label="Confirm new password" error={errors.confirm}>{(p) => <Input {...p} type="password" autoComplete="new-password" value={f.confirm} onChange={(e) => setF({ ...f, confirm: e.target.value })} invalid={!!errors.confirm} />}</Field>
      <div className="sm:col-span-3"><Button type="submit" variant="primary" disabled={busy}>Change password</Button></div>
    </form>
  );
}

function Security() {
  const { logout } = useSession();
  const [open, setOpen] = useState(false);
  return (
    <>
      <SectionCard title="Password" description="Change the password you use to sign in."><ChangePassword /></SectionCard>
      <div className="mt-5" />
      <SectionCard title="Security" description="Additional protections and session.">
        <ul className="divide-y divide-line">
          <li className="flex flex-wrap items-center gap-3 pb-4"><span className="flex h-10 w-10 items-center justify-center rounded-lg bg-slate-100 text-ink-soft"><ShieldCheck className="h-5 w-5" /></span>
            <div className="min-w-0 flex-1"><p className="text-sm font-semibold">Two-factor authentication</p><p className="text-[13px] text-ink-soft">Not enabled.</p></div><Badge tone="neutral">Not enabled</Badge><Button size="sm" onClick={() => setOpen(true)}>Enable</Button></li>
          <li className="flex flex-wrap items-center gap-3 py-4"><span className="flex h-10 w-10 items-center justify-center rounded-lg bg-slate-100 text-ink-soft"><Lock className="h-5 w-5" /></span>
            <div className="min-w-0 flex-1"><p className="text-sm font-semibold">Session</p><p className="text-[13px] text-ink-soft">You stay signed in on this browser for up to 7 days. Passwords are stored hashed (bcrypt).</p></div><Button size="sm" icon={<LogOut className="h-3.5 w-3.5" />} onClick={logout}>Sign out</Button></li>
        </ul>
      </SectionCard>
      {open && <SetupModal title="Two-factor authentication" why="Two-factor authentication is not implemented yet, so it cannot be turned on." needs={['A TOTP (authenticator app) enrolment and verification flow on the server', 'Recovery codes']} onClose={() => setOpen(false)} />}
    </>
  );
}

function Billing() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <SectionCard title="Billing" description="Plan, payment method and invoices.">
        <dl className="grid gap-4 sm:grid-cols-3">
          <div><dt className="text-xs text-ink-soft">Plan</dt><dd className="mt-1 text-sm font-semibold">Self-hosted <Badge tone="neutral">No paid plan</Badge></dd></div>
          <div><dt className="text-xs text-ink-soft">Payment method</dt><dd className="mt-1 text-sm font-semibold"><Badge tone="neutral">Not connected</Badge></dd></div>
          <div><dt className="text-xs text-ink-soft">Invoices</dt><dd className="mt-1 text-sm font-semibold text-ink-soft">None</dd></div>
        </dl>
        <Button className="mt-5" variant="primary" onClick={() => setOpen(true)}>Upgrade plan</Button>
      </SectionCard>
      {open && <SetupModal title="Upgrade plan" why="No payment is taken and no plan changes." needs={['A billing provider such as Stripe', 'A backend to create subscriptions and webhooks']} onClose={() => setOpen(false)} />}
    </>
  );
}

export default function SettingsPage() {
  const [params, setParams] = useSearchParams();
  const id = SECTIONS.some((s) => s.id === params.get('section')) ? params.get('section')! : 'profile';
  const body = { profile: <Profile />, workspace: <Workspace />, team: <Team />, notifications: <Notifications />, integrations: <Integrations />, security: <Security />, billing: <Billing /> }[id];
  return (
    <>
      <PageHeader crumb="Settings" title="Settings" subtitle="Manage your profile, workspace and preferences." />
      <div className="grid gap-5 lg:grid-cols-[220px_1fr]">
        <nav aria-label="Settings sections" className="-mx-4 flex gap-1 overflow-x-auto px-4 pb-1 lg:mx-0 lg:flex-col lg:px-0">
          {SECTIONS.map((s) => (
            <button key={s.id} onClick={() => setParams({ section: s.id }, { replace: true })} aria-current={s.id === id ? 'page' : undefined}
              className={`flex shrink-0 items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium ${s.id === id ? 'bg-primary-100/70 text-primary-600' : 'text-ink-soft hover:bg-slate-100 hover:text-ink'}`}>
              <s.icon className="h-4 w-4" aria-hidden />{s.label}
            </button>))}
        </nav>
        <div className="min-w-0 max-w-3xl" key={id}>{body}</div>
      </div>
    </>
  );
}
