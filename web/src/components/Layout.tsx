import { useState, type ReactNode } from 'react';
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  Bell,
  Building2,
  ClipboardList,
  FileStack,
  Gavel,
  HelpCircle,
  HardHat,
  LayoutDashboard,
  LogOut,
  Map,
  Menu,
  MessageSquareWarning,
  Search,
  Settings,
  ShieldCheck,
  Users,
  Wallet,
  X,
} from 'lucide-react';
import { get } from '../lib/api';
import { useAuth } from '../lib/auth';
import { firstName, initials } from '../lib/format';
import { Badge, Button, cn } from './ui';

type NavItem = {
  to: string;
  label: string;
  icon: ReactNode;
  show: (ctx: { can: (...c: string[]) => boolean; isRole: (...r: string[]) => boolean }) => boolean;
};

const always = () => true;

/** Nav is filtered by role — an investor sees a simplified set. */
const NAV: { group: string; items: NavItem[] }[] = [
  {
    group: 'Overview',
    items: [
      { to: '/', label: 'Dashboard', icon: <LayoutDashboard className="h-4 w-4" />, show: always },
    ],
  },
  {
    group: 'Casework',
    items: [
      { to: '/cases', label: 'All cases', icon: <FileStack className="h-4 w-4" />, show: always },
      { to: '/applications', label: 'New applications', icon: <ClipboardList className="h-4 w-4" />, show: always },
      {
        to: '/queue',
        label: 'Waiting on me',
        icon: <Gavel className="h-4 w-4" />,
        show: ({ isRole }) => !isRole('INVESTOR', 'VIEWER'),
      },
    ],
  },
  {
    group: 'Operations',
    items: [
      {
        to: '/land-inventory',
        label: 'Plots',
        icon: <Map className="h-4 w-4" />,
        show: ({ isRole }) => !isRole('INVESTOR'),
      },
      { to: '/payments', label: 'Payments', icon: <Wallet className="h-4 w-4" />, show: always },
      { to: '/construction', label: 'Building work', icon: <HardHat className="h-4 w-4" />, show: always },
      { to: '/grievances', label: 'Complaints', icon: <MessageSquareWarning className="h-4 w-4" />, show: always },
      {
        to: '/reports',
        label: 'Reports',
        icon: <Building2 className="h-4 w-4" />,
        show: ({ can }) => can('reports:view'),
      },
    ],
  },
  {
    group: 'Administration',
    items: [
      { to: '/admin/users', label: 'Users', icon: <Users className="h-4 w-4" />, show: ({ can }) => can('users:manage') },
      {
        to: '/admin/settings',
        label: 'Settings',
        icon: <Settings className="h-4 w-4" />,
        show: ({ can }) => can('settings:manage'),
      },
      {
        to: '/admin/audit',
        label: 'Activity history',
        icon: <ShieldCheck className="h-4 w-4" />,
        show: ({ can }) => can('audit:view'),
      },
    ],
  },
];

export function Layout({ children }: { children: ReactNode }) {
  const { user, meta, signOut, can, isRole } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();

  const { data: notifications } = useQuery({
    queryKey: ['notifications', 'unread-count'],
    queryFn: () => get('/notifications?unread=true&pageSize=1'),
    refetchInterval: 60_000,
  });

  const groups = NAV.map((g) => ({ ...g, items: g.items.filter((i) => i.show({ can, isRole })) })).filter(
    (g) => g.items.length
  );

  const sidebar = (
    <nav className="flex h-full flex-col">
      <Link to="/" className="flex items-center gap-2.5 border-b border-navy-800/60 px-4 py-3.5">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded bg-white/10 text-xs font-bold text-white">
          AP
        </div>
        <div className="min-w-0">
          <p className="truncate text-[13px] font-bold leading-tight text-white">
            {meta?.organisation.shortName ?? 'APCRDA'}
          </p>
          <p className="truncate text-[10px] leading-tight text-navy-200">
            {meta?.organisation.portalName ?? 'Land Allotment Portal'}
          </p>
        </div>
      </Link>

      <div className="flex-1 overflow-y-auto px-2 py-3">
        {groups.map((group) => (
          <div key={group.group} className="mb-4">
            <p className="px-3 pb-1.5 text-[10px] font-bold uppercase tracking-widest text-navy-300/70">
              {group.group}
            </p>
            <div className="space-y-0.5">
              {group.items.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.to === '/'}
                  onClick={() => setMobileOpen(false)}
                  className={({ isActive }) =>
                    cn(
                      'flex items-center gap-2.5 rounded-md px-3 py-2 text-[13px] font-medium transition-colors',
                      isActive
                        ? 'bg-white/12 text-white'
                        : 'text-navy-100/80 hover:bg-white/8 hover:text-white'
                    )
                  }
                >
                  {item.icon}
                  <span className="truncate">{item.label}</span>
                </NavLink>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="border-t border-navy-800/60 p-3">
        <Link
          to="/help"
          onClick={() => setMobileOpen(false)}
          className="mb-2 flex items-center gap-2.5 rounded-md px-3 py-2 text-[13px] font-medium text-navy-100/80 hover:bg-white/8 hover:text-white"
        >
          <HelpCircle className="h-4 w-4" />
          How this works
        </Link>
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/10 text-[11px] font-bold text-white">
            {initials(user?.name)}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-semibold text-white">{user?.name}</p>
            <p className="truncate text-[10px] text-navy-200">{user?.roleName}</p>
          </div>
          <button
            onClick={() => void signOut()}
            title="Sign out"
            className="rounded p-1.5 text-navy-200 hover:bg-white/10 hover:text-white"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </div>
    </nav>
  );

  return (
    <div className="flex h-full">
      <aside className="no-print hidden w-60 shrink-0 bg-navy-900 lg:block">{sidebar}</aside>

      {mobileOpen && (
        <div className="no-print fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-ink-900/50" onClick={() => setMobileOpen(false)} />
          <aside className="relative h-full w-64 bg-navy-900">{sidebar}</aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="no-print flex h-14 shrink-0 items-center gap-3 border-b border-ink-200 bg-white px-3 sm:px-4">
          <button
            className="rounded p-2 text-ink-500 hover:bg-ink-100 lg:hidden"
            onClick={() => setMobileOpen((v) => !v)}
            aria-label="Toggle navigation"
          >
            {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>

          <form
            className="relative hidden max-w-sm flex-1 sm:block"
            onSubmit={(e) => {
              e.preventDefault();
              const q = new FormData(e.currentTarget).get('q');
              navigate(`/cases?q=${encodeURIComponent(String(q ?? ''))}`);
            }}
          >
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
            <input
              name="q"
              placeholder="Search for a case, company or plot…"
              className="input-base h-9 pl-8"
              defaultValue={new URLSearchParams(location.search).get('q') ?? ''}
            />
          </form>

          <div className="ml-auto flex items-center gap-1.5">
            <Link
              to="/notifications"
              className="relative rounded p-2 text-ink-500 hover:bg-ink-100"
              aria-label="Notifications"
            >
              <Bell className="h-4.5 w-4.5" />
              {(notifications?.unread ?? 0) > 0 && (
                <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-600 px-1 text-[9px] font-bold text-white">
                  {notifications.unread > 99 ? '99+' : notifications.unread}
                </span>
              )}
            </Link>
            {isRole('VIEWER') && <Badge tone="muted">Read-only</Badge>}
            <Link to="/profile" className="hidden sm:block">
              <Button variant="ghost" size="sm">
                {firstName(user?.name)}
              </Button>
            </Link>
          </div>
        </header>

        <main className="min-w-0 flex-1 overflow-y-auto">
          <div className="mx-auto w-full max-w-[1500px] p-3 sm:p-5">{children}</div>
        </main>
      </div>
    </div>
  );
}

export function PageHeader({
  title,
  description,
  actions,
  breadcrumb,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  breadcrumb?: ReactNode;
}) {
  return (
    <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        {breadcrumb && <div className="mb-1 text-xs text-ink-500">{breadcrumb}</div>}
        <h1 className="text-lg font-bold text-ink-900 sm:text-xl">{title}</h1>
        {description && <p className="mt-0.5 max-w-3xl text-xs text-ink-500 sm:text-sm">{description}</p>}
      </div>
      {actions && <div className="no-print flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}
