import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { ApiError } from '../api/client';
import { Logo } from '../components/layout/Sidebar';
import { Button } from '../components/ui/Button';
import { Field, Input } from '../components/ui/Form';
import { isEmail } from '../lib/validate';
import { useSession } from '../store/SessionContext';

export default function Auth({ mode }: { mode: 'login' | 'register' }) {
  const { login, register, state } = useSession();
  const loc = useLocation();
  const isLogin = mode === 'login';
  const [f, setF] = useState({ name: '', email: '', password: '', workspaceName: '', sampleData: true });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState('');
  const [busy, setBusy] = useState(false);
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((p) => ({ ...p, [k]: v }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const err: Record<string, string> = {};
    if (!isLogin && !f.name.trim()) err.name = 'Enter your name.';
    if (!isEmail(f.email.trim())) err.email = 'Enter a valid email address.';
    if (!f.password) err.password = 'Enter your password.';
    else if (!isLogin && f.password.length < 8) err.password = 'Use at least 8 characters.';
    if (!isLogin && !f.workspaceName.trim()) err.workspaceName = 'Enter a workspace name.';
    setErrors(err); setFormError('');
    if (Object.keys(err).length) return;
    setBusy(true);
    try {
      if (isLogin) await login(f.email.trim(), f.password);
      else await register({ name: f.name.trim(), email: f.email.trim(), password: f.password, workspaceName: f.workspaceName.trim(), sampleData: f.sampleData });
    } catch (ex) {
      if (ex instanceof ApiError) { setFormError(ex.message); if (ex.fields) setErrors(ex.fields); }
      else setFormError('Something went wrong. Please try again.');
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-full items-center justify-center bg-canvas px-4 py-10">
      <div className="w-full max-w-md">
        <div className="mb-6 flex justify-center"><Logo /></div>
        <form onSubmit={submit} noValidate className="card space-y-4 p-6 sm:p-8" aria-label={isLogin ? 'Sign in' : 'Create account'}>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">{isLogin ? 'Sign in' : 'Create your workspace'}</h1>
            <p className="mt-1 text-sm text-ink-soft">{isLogin ? 'Welcome back to Northstar.' : 'Start managing leads in minutes.'}</p>
          </div>
          {state.status === 'anon' && state.error && <p role="alert" className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">{state.error}</p>}
          {formError && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{formError}</p>}
          {!isLogin && <Field label="Your name" required error={errors.name}>{(p) => <Input {...p} data-autofocus autoComplete="name" value={f.name} onChange={(e) => set('name', e.target.value)} invalid={!!errors.name} />}</Field>}
          <Field label="Email" required error={errors.email}>{(p) => <Input {...p} type="email" autoComplete="email" value={f.email} onChange={(e) => set('email', e.target.value)} invalid={!!errors.email} />}</Field>
          <Field label="Password" required error={errors.password} hint={isLogin ? undefined : 'At least 8 characters.'}>{(p) => <Input {...p} type="password" autoComplete={isLogin ? 'current-password' : 'new-password'} value={f.password} onChange={(e) => set('password', e.target.value)} invalid={!!errors.password} />}</Field>
          {!isLogin && <>
            <Field label="Workspace name" required error={errors.workspaceName}>{(p) => <Input {...p} value={f.workspaceName} onChange={(e) => set('workspaceName', e.target.value)} invalid={!!errors.workspaceName} placeholder="Acme Sales" />}</Field>
            <label className="flex items-start gap-3 rounded-lg bg-slate-50 p-3 text-sm">
              <input type="checkbox" className="mt-0.5" checked={f.sampleData} onChange={(e) => set('sampleData', e.target.checked)} />
              <span><span className="font-medium">Start with sample data</span><span className="block text-[13px] text-ink-soft">Adds realistic leads, deals and tasks so you can explore. You can delete them later in Settings.</span></span>
            </label>
          </>}
          <Button type="submit" variant="primary" className="w-full" disabled={busy}>{busy ? 'Please wait…' : isLogin ? 'Sign in' : 'Create workspace'}</Button>
          <p className="text-center text-sm text-ink-soft">
            {isLogin ? <>New to Northstar? <Link className="font-medium text-primary-600 hover:underline" to="/register" state={loc.state}>Create a workspace</Link></>
              : <>Already have an account? <Link className="font-medium text-primary-600 hover:underline" to="/login" state={loc.state}>Sign in</Link></>}
          </p>
        </form>
      </div>
    </div>
  );
}
