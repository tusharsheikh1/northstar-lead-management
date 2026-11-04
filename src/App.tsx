import { Link, Navigate, Route, Routes } from 'react-router-dom';
import { AppShell } from './components/layout/AppShell';
import { Button } from './components/ui/Button';
import { EmptyState } from './components/ui/Misc';
import Overview from './pages/Overview';
import Leads from './pages/Leads';
import Pipeline from './pages/Pipeline';
import Tasks from './pages/Tasks';
import Reports from './pages/Reports';
import SettingsPage from './pages/Settings';

export default function App() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route index element={<Navigate to="/overview" replace />} />
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
  );
}
