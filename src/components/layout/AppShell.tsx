import { useEffect, useState } from 'react';
import { Link, Outlet, useLocation } from 'react-router-dom';
import { Menu, FlaskConical } from 'lucide-react';
import { Logo, SidebarContent } from './Sidebar';
import { Drawer } from '../ui/Drawer';
import { IconButton } from '../ui/Button';

export function AppShell() {
  const [open, setOpen] = useState(false);
  const { pathname } = useLocation();
  useEffect(() => { document.getElementById('main')?.scrollTo({ top: 0 }); }, [pathname]);
  return (
    <div className="flex h-full">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-3 focus:top-3 focus:z-[200] focus:rounded-lg focus:bg-white focus:px-3 focus:py-2 focus:shadow-pop">Skip to content</a>
      <aside className="no-print hidden w-[76px] shrink-0 border-r border-line bg-white md:block lg:w-[248px]" aria-label="Sidebar">
        <SidebarContent />
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="no-print flex items-center gap-3 border-b border-line bg-white px-4 py-2 md:hidden">
          <IconButton label="Open navigation menu" onClick={() => setOpen(true)} className="!h-10 !w-10"><Menu className="h-6 w-6" /></IconButton>
          <Logo />
        </div>
        <div className="no-print flex flex-wrap items-center justify-center gap-x-2 bg-navy-900 px-4 py-1.5 text-center text-xs text-white/90" role="note">
          <FlaskConical className="h-3.5 w-3.5 shrink-0" aria-hidden />
          <strong className="font-semibold">Demo workspace</strong>
          <span className="hidden text-white/70 sm:inline">Sample data stored only in this browser. No backend is connected.</span>
          <Link to="/settings?section=workspace" className="font-medium text-white underline underline-offset-2">Manage demo data</Link>
        </div>
        <main id="main" tabIndex={-1} className="app-main flex-1 overflow-y-auto px-4 py-6 sm:px-6 lg:px-8 lg:py-7">
          <div className="mx-auto max-w-[1280px]"><Outlet /></div>
        </main>
      </div>
      {open && (
        <Drawer title="Navigation" side="left" width="max-w-[280px]" onClose={() => setOpen(false)}>
          <SidebarContent drawer onNavigate={() => setOpen(false)} />
        </Drawer>
      )}
    </div>
  );
}
