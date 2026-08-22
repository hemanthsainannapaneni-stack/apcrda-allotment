import { useState, type ReactNode } from 'react';
import { Link, NavLink } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  Bell,
  Building2,
  FileStack,
  HelpCircle,
  HardHat,
  LayoutDashboard,
  LogOut,
  Map,
  Menu,
  MessageSquareWarning,
  Settings,
  ShieldCheck,
  Users,
  Wallet,
  X,
} from 'lucide-react';
import { get } from '../lib/api';
import { useAuth } from '../lib/auth';
import { initials } from '../lib/format';
import { cn } from './ui';

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
      { to: '/', label: 'Dashboard', icon: <LayoutDashboard className="h-[18px] w-[18px]" />, show: always },
    ],
  },
  {
    group: 'Casework',
    items: [
      { to: '/applications', label: 'Applications', icon: <FileStack className="h-[18px] w-[18px]" />, show: always },
    ],
  },
  {
    group: 'Operations',
    items: [
      {
        to: '/land-inventory',
        label: 'Plots',
        icon: <Map className="h-[18px] w-[18px]" />,
        show: ({ isRole }) => !isRole('INVESTOR'),
      },
      { to: '/payments', label: 'Payments', icon: <Wallet className="h-[18px] w-[18px]" />, show: always },
      { to: '/building-permits', label: 'Building permits', icon: <HardHat className="h-[18px] w-[18px]" />, show: always },
      { to: '/grievances', label: 'Complaints', icon: <MessageSquareWarning className="h-[18px] w-[18px]" />, show: always },
      {
        to: '/reports',
        label: 'Reports',
        icon: <Building2 className="h-[18px] w-[18px]" />,
        show: ({ can }) => can('reports:view'),
      },
    ],
  },
  {
    group: 'Administration',
    items: [
      { to: '/admin/users', label: 'Users', icon: <Users className="h-[18px] w-[18px]" />, show: ({ can }) => can('users:manage') },
      {
        to: '/admin/settings',
        label: 'Settings',
        icon: <Settings className="h-[18px] w-[18px]" />,
        show: ({ can }) => can('settings:manage'),
      },
      {
        to: '/admin/audit',
        label: 'Activity history',
        icon: <ShieldCheck className="h-[18px] w-[18px]" />,
        show: ({ can }) => can('audit:view'),
      },
    ],
  },
];

export function Layout({ children }: { children: ReactNode }) {
  const { user, meta, signOut, can, isRole } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);

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
          <p className="truncate text-sm font-bold leading-tight text-white">
            {meta?.organisation.shortName ?? 'APCRDA'}
          </p>
          <p className="truncate text-[11px] leading-tight text-navy-200">
            {meta?.organisation.portalName ?? 'Land Allotment Portal'}
          </p>
        </div>
      </Link>

      <div className="flex-1 overflow-y-auto px-2 py-3">
        {groups.map((group) => (
          <div key={group.group} className="mb-4">
            <p className="px-3 pb-1.5 text-[11px] font-bold uppercase tracking-wider text-navy-300/80">
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
                      // Weight stays constant between states — only the colour and
                      // background move, so nothing shifts as you navigate.
                      'flex items-center gap-2.5 rounded-md px-3 py-2 text-sm font-semibold transition-colors',
                      isActive ? 'bg-white/15 text-white' : 'text-navy-100 hover:bg-white/10 hover:text-white'
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
        {/* Notifications live here rather than in a top bar — the unread count
            has to stay visible from every screen, and this is the only chrome
            that is. */}
        <Link
          to="/notifications"
          onClick={() => setMobileOpen(false)}
          className="mb-1 flex items-center gap-2.5 rounded-md px-3 py-2 text-sm font-semibold text-navy-100 hover:bg-white/10 hover:text-white"
        >
          <Bell className="h-[18px] w-[18px]" />
          <span className="flex-1 truncate">Notifications</span>
          {(notifications?.unread ?? 0) > 0 && (
            <span className="flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-bold text-white">
              {notifications.unread > 99 ? '99+' : notifications.unread}
            </span>
          )}
        </Link>
        <Link
          to="/help"
          onClick={() => setMobileOpen(false)}
          className="mb-2 flex items-center gap-2.5 rounded-md px-3 py-2 text-sm font-semibold text-navy-100 hover:bg-white/10 hover:text-white"
        >
          <HelpCircle className="h-[18px] w-[18px]" />
          How this works
        </Link>
        <div className="flex items-center gap-2.5">
          <Link
            to="/profile"
            onClick={() => setMobileOpen(false)}
            className="flex min-w-0 flex-1 items-center gap-2.5 rounded-md p-1 hover:bg-white/10"
          >
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/10 text-[11px] font-bold text-white">
              {initials(user?.name)}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13px] font-semibold text-white">{user?.name}</p>
              <p className="truncate text-[11px] text-navy-200">
                {isRole('VIEWER') ? 'Read-only · ' : ''}
                {user?.roleName}
              </p>
            </div>
          </Link>
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
        {/* No top bar on desktop at all. Below lg the sidebar is off-canvas, so
            a slim strip survives purely to carry the toggle that opens it —
            without it there is no way back to the navigation on a phone. */}
        <header className="no-print flex h-12 shrink-0 items-center gap-2 border-b border-ink-200 bg-white px-3 lg:hidden">
          <button
            className="rounded p-2 text-ink-500 hover:bg-ink-100"
            onClick={() => setMobileOpen((v) => !v)}
            aria-label="Toggle navigation"
          >
            {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
          <Link to="/" className="truncate text-sm font-bold text-navy-900">
            {meta?.organisation.shortName ?? 'APCRDA'}
          </Link>
        </header>

        <main className="min-w-0 flex-1 overflow-y-auto">
          {/* Full width by design — the wide tables and the eight-panel row want
              every pixel. The top inset is deliberately smaller than the rest:
              the header bar above already reads as a divider, so a full gap there
              just pushes the first thing on the page out of view. */}
          <div className="w-full px-3 pb-3 pt-2 sm:px-4 sm:pb-4">{children}</div>
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
    /* items-center, not items-start: the left side is now usually a single
       title line, so centring sets it on the same axis as the action buttons
       instead of floating it above them. */
    <div className="mb-3 flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
      <div className="min-w-0">
        {breadcrumb && <div className="text-xs text-ink-500">{breadcrumb}</div>}
        <h1 className="text-lg font-bold leading-tight text-ink-900 sm:text-xl">{title}</h1>
        {description && <p className="mt-0.5 max-w-3xl text-xs text-ink-500 sm:text-sm">{description}</p>}
      </div>
      {actions && <div className="no-print flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}
