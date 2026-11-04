import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { api, ApiError } from '../api/client';
import { Logo } from '../components/layout/Sidebar';
import { Button } from '../components/ui/Button';
import { Field, Input } from '../components/ui/Form';
import { isEmail } from '../lib/validate';
import { useSession } from '../store/SessionContext';

function Shell({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div className="flex min-h-full items-center justify-center bg-canvas px-4 py-10">
      <div className="w-full max-w-md">
        <div className="mb-6 flex justify-center"><Logo /></div>
        <div className="card space-y-4 p-6 sm:p-8">
          <div><h1 className="text-2xl font-bold tracking-tight">{title}</h1>{subtitle && <p className="mt-1 text-sm text-ink-soft">{subtitle}</p>}</div>
          {children}
        </div>
      </div>
    </div>
  );
}

/** Asks for an email address and requests a reset link. The response never says whether the account exists. */
export function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isEmail(email.trim())) { setError('Enter a valid email address.'); return; }
    setBusy(true); setError('');
    try { await api.post('/auth/forgot-password', { email: email.trim() }); setDone(true); }
    catch (ex) { setError(ex instanceof ApiError ? ex.message : 'Something went wrong. Please try again.'); }
    setBusy(false);
  };
  if (done) return (
    <Shell title="Check your email" subtitle="If an account exists for that address, we’ve sent a link to reset your password. It expires in 1 hour.">
      <p className="rounded-lg bg-slate-50 p-3 text-[13px] text-ink-soft">Nothing arrived? Check your spam folder. If this server has no email set up, ask your workspace admin to reset access for you.</p>
      <Link to="/login" className="block text-center text-sm font-medium text-primary-600 hover:underline">Back to sign in</Link>
    </Shell>
  );
  return (
    <Shell title="Forgot your password?" subtitle="Enter your email and we’ll send you a reset link.">
      <form onSubmit={submit} noValidate className="space-y-4">
        <Field label="Email" required error={error}>{(p) => <Input {...p} data-autofocus type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} invalid={!!error} />}</Field>
        <Button type="submit" variant="primary" className="w-full" disabled={busy}>{busy ? 'Sending…' : 'Send reset link'}</Button>
      </form>
      <Link to="/login" className="block text-center text-sm font-medium text-primary-600 hover:underline">Back to sign in</Link>
    </Shell>
  );
}

export function ResetPassword() {
  const [params] = useSearchParams();
  const nav = useNavigate();
  const token = params.get('token') ?? '';
  const [f, setF] = useState({ password: '', confirm: '' });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState('');
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const err: Record<string, string> = {};
    if (f.password.length < 8) err.password = 'Use at least 8 characters.';
    if (f.confirm !== f.password) err.confirm = 'Passwords do not match.';
    setErrors(err); setFormError('');
    if (Object.keys(err).length) return;
    setBusy(true);
    try { await api.post('/auth/reset-password', { token, password: f.password }); setDone(true); }
    catch (ex) { setFormError(ex instanceof ApiError ? ex.message : 'Something went wrong. Please try again.'); }
    setBusy(false);
  };
  if (!token) return <Shell title="Reset link missing" subtitle="Open the link from your email, or request a new one."><Link to="/forgot-password" className="text-sm font-medium text-primary-600 hover:underline">Request a reset link</Link></Shell>;
  if (done) return (
    <Shell title="Password updated" subtitle="You can now sign in with your new password.">
      <Button variant="primary" className="w-full" onClick={() => nav('/login', { replace: true })}>Go to sign in</Button>
    </Shell>
  );
  return (
    <Shell title="Choose a new password">
      <form onSubmit={submit} noValidate className="space-y-4">
        {formError && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{formError} <Link to="/forgot-password" className="font-medium underline">Request a new link</Link></p>}
        <Field label="New password" required error={errors.password} hint="At least 8 characters.">{(p) => <Input {...p} data-autofocus type="password" autoComplete="new-password" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} invalid={!!errors.password} />}</Field>
        <Field label="Confirm new password" required error={errors.confirm}>{(p) => <Input {...p} type="password" autoComplete="new-password" value={f.confirm} onChange={(e) => setF({ ...f, confirm: e.target.value })} invalid={!!errors.confirm} />}</Field>
        <Button type="submit" variant="primary" className="w-full" disabled={busy}>{busy ? 'Saving…' : 'Update password'}</Button>
      </form>
    </Shell>
  );
}

export function AcceptInvite() {
  const [params] = useSearchParams();
  const nav = useNavigate();
  const { acceptInvite, state } = useSession();
  const token = params.get('token') ?? '';
  const [info, setInfo] = useState<{ email: string; role: string; workspace: string; invitedBy: string | null } | 'invalid' | null>(null);
  const [f, setF] = useState({ name: '', password: '' });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.get<{ email: string; role: string; workspace: string; invitedBy: string | null }>(`/auth/invitation?token=${encodeURIComponent(token)}`).then(setInfo).catch(() => setInfo('invalid'));
  }, [token]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const err: Record<string, string> = {};
    if (!f.name.trim()) err.name = 'Enter your name.';
    if (f.password.length < 8) err.password = 'Use at least 8 characters.';
    setErrors(err); setFormError('');
    if (Object.keys(err).length) return;
    setBusy(true);
    try { await acceptInvite({ token, name: f.name.trim(), password: f.password }); nav('/overview', { replace: true }); }
    catch (ex) { setFormError(ex instanceof ApiError ? ex.message : 'Something went wrong. Please try again.'); setBusy(false); }
  };

  if (state.status === 'authed') return <Shell title="You’re already signed in" subtitle="Sign out first, then open the invitation link again to join with the invited email."><Link to="/overview" className="text-sm font-medium text-primary-600 hover:underline">Back to the app</Link></Shell>;
  if (info === null) return <Shell title="Loading invitation…"><p role="status" className="text-sm text-ink-soft">One moment.</p></Shell>;
  if (info === 'invalid') return <Shell title="Invitation not valid" subtitle="This invitation is invalid, has expired, or was withdrawn. Ask your workspace admin for a new one."><Link to="/login" className="text-sm font-medium text-primary-600 hover:underline">Go to sign in</Link></Shell>;
  return (
    <Shell title={`Join ${info.workspace}`} subtitle={`${info.invitedBy ?? 'A teammate'} invited you as ${info.role}.`}>
      <form onSubmit={submit} noValidate className="space-y-4">
        {formError && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{formError}</p>}
        <Field label="Email">{() => <span className="block rounded-lg bg-slate-50 px-3 py-2 text-sm">{info.email}</span>}</Field>
        <Field label="Your name" required error={errors.name}>{(p) => <Input {...p} data-autofocus autoComplete="name" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} invalid={!!errors.name} />}</Field>
        <Field label="Choose a password" required error={errors.password} hint="At least 8 characters.">{(p) => <Input {...p} type="password" autoComplete="new-password" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} invalid={!!errors.password} />}</Field>
        <Button type="submit" variant="primary" className="w-full" disabled={busy}>{busy ? 'Joining…' : 'Accept invitation'}</Button>
      </form>
    </Shell>
  );
}
