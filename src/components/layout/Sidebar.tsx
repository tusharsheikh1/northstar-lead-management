import { NavLink, Link } from 'react-router-dom';
import { BarChart3, Home, Kanban, LogOut, Settings, SquareCheckBig, Users, type LucideIcon } from 'lucide-react';
import { useStore } from '../../store/StoreContext';
import { useSession } from '../../store/SessionContext';
import { Avatar } from '../ui/Avatar';

export function Logo({ textClass = '' }: { textClass?: string }) {
  return (
    <div className="flex items-center gap-2.5">
      <svg viewBox="0 0 32 32" className="h-8 w-8 shrink-0" aria-hidden><path fill="#4169E1" d="M16 1c1 8.5 6.5 14 15 15-8.5 1-14 6.5-15 15-1-8.5-6.5-14-15-15 8.5-1 14-6.5 15-15z" /></svg>
      <span className={`text-[22px] font-bold tracking-tight text-navy-900 ${textClass}`}>Northstar</span>
    </div>
  );
}

const NAV: { to: string; label: string; icon: LucideIcon }[] = [
  { to: '/overview', label: 'Overview', icon: Home },
  { to: '/leads', label: 'Leads', icon: Users },
  { to: '/pipeline', label: 'Pipeline', icon: Kanban },
  { to: '/tasks', label: 'Tasks', icon: SquareCheckBig },
  { to: '/reports', label: 'Reports', icon: BarChart3 },
];

/** `drawer` always shows labels; otherwise labels hide at tablet width (icon rail). */
export function SidebarContent({ drawer = false, onNavigate }: { drawer?: boolean; onNavigate?: () => void }) {
  const { me } = useStore();
  const { logout } = useSession();
  const label = drawer ? '' : 'hidden lg:inline';
  const item = (to: string, text: string, Icon: LucideIcon) => (
    <NavLink key={to} to={to} onClick={onNavigate} title={text}
      className={({ isActive }) => `flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-[15px] font-medium transition-colors ${drawer ? '' : 'justify-center lg:justify-start'} ${isActive ? 'bg-primary-100/70 text-primary-600' : 'text-ink hover:bg-slate-100'}`}>
      <Icon className="h-5 w-5 shrink-0" aria-hidden />
      <span className={label}>{text}</span>
    </NavLink>
  );
  return (
    <div className="flex h-full flex-col">
      <div className={`px-5 pb-3 pt-6 ${drawer ? '' : 'flex justify-center lg:block lg:px-5'}`}>
        <Link to="/overview" onClick={onNavigate} aria-label="Northstar home"><Logo textClass={label} /></Link>
      </div>
      <nav aria-label="Primary" className="flex-1 space-y-1 px-3 py-3">
        {NAV.map((n) => item(n.to, n.label, n.icon))}
        <div className="my-3 border-t border-line" />
        {item('/settings', 'Settings', Settings)}
      </nav>
      <div className="border-t border-line p-3">
        <Link to="/settings?section=profile" onClick={onNavigate} title={`${me.name} - profile settings`}
          className={`flex items-center gap-3 rounded-xl p-2 hover:bg-slate-100 ${drawer ? '' : 'justify-center lg:justify-start'}`}>
          <Avatar owner={me} size={40} />
          <span className={`min-w-0 flex-1 ${label}`}>
            <span className="block truncate text-sm font-semibold">{me.name}</span>
            <span className="block truncate text-[13px] text-ink-soft">{me.jobTitle}</span>
          </span>
        </Link>
        <button type="button" onClick={() => { onNavigate?.(); logout(); }} title="Sign out"
          className={`mt-1 flex w-full items-center gap-3 rounded-xl px-3.5 py-2 text-sm font-medium text-ink-soft hover:bg-slate-100 hover:text-ink ${drawer ? '' : 'justify-center lg:justify-start'}`}>
          <LogOut className="h-4 w-4 shrink-0" aria-hidden /><span className={label}>Sign out</span>
        </button>
      </div>
    </div>
  );
}
