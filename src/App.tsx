import { Link, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { AppShell } from './components/layout/AppShell';
import { Button } from './components/ui/Button';
import { EmptyState } from './components/ui/Misc';
import { useSession } from './store/SessionContext';
import { StoreProvider } from './store/StoreContext';
import Auth from './pages/Auth';
import { AcceptInvite, ForgotPassword, ResetPassword } from './pages/AccountLinks';
import Overview from './pages/Overview';
import Leads from './pages/Leads';
import Pipeline from './pages/Pipeline';
import Tasks from './pages/Tasks';
import Reports from './pages/Reports';
import SettingsPage from './pages/Settings';

export default function App() {
  const { state } = useSession();
  const loc = useLocation();

  if (state.status === 'loading') return <div className="flex h-full items-center justify-center text-sm text-ink-soft" role="status">Loading…</div>;

  if (state.status === 'anon') {
    return (
      <Routes>
        <Route path="/login" element={<Auth mode="login" />} />
        <Route path="/register" element={<Auth mode="register" />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/reset-password" element={<ResetPassword />} />
        <Route path="/accept-invite" element={<AcceptInvite />} />
        <Route path="*" element={<Navigate to="/login" replace state={{ from: loc.pathname + loc.search }} />} />
      </Routes>
    );
  }

  return (
    <StoreProvider initial={state.initial}>
      <Routes>
        <Route path="/accept-invite" element={<AcceptInvite />} />
        <Route path="/reset-password" element={<ResetPassword />} />
        <Route element={<AppShell />}>
          <Route index element={<Navigate to="/overview" replace />} />
          <Route path="/login" element={<Navigate to={(loc.state as { from?: string } | null)?.from ?? '/overview'} replace />} />
          <Route path="/register" element={<Navigate to={(loc.state as { from?: string } | null)?.from ?? '/overview'} replace />} />
          <Route path="/overview" element={<Overview />} />
          <Route path="/leads" element={<Leads />} />
          <Route path="/pipeline" element={<Pipeline />} />
          <Route path="/tasks" element={<Tasks />} />
          <Route path="/reports" element={<Reports />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="*" element={
            <EmptyState title="Page not found" message="The page you are looking for does not exist."
              action={<Link to="/overview"><Button variant="primary">Back to overview</Button></Link>} />} />
        </Route>
      </Routes>
    </StoreProvider>
  );
}
