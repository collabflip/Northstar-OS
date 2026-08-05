import { NavLink } from 'react-router';
import {
  LayoutDashboard, KanbanSquare, MessagesSquare, CalendarDays,
  Users, CheckSquare, Megaphone, FileSignature, ReceiptText,
  ShieldCheck, ScrollText, Settings,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useT } from '@/lib/i18n';
import type { StringKey } from '@/lib/i18n';

interface NavItem {
  to: string;
  key: StringKey;
  icon: LucideIcon;
  badge?: number;
}

interface NavGroup {
  key: StringKey;
  items: NavItem[];
}

/** Sidebar nav for the app shell (not a marketing navbar). */
export const NAV_GROUPS: NavGroup[] = [
  {
    key: 'nav.group.operate',
    items: [
      { to: '/', key: 'nav.commandCentre', icon: LayoutDashboard },
      { to: '/pipeline', key: 'nav.pipeline', icon: KanbanSquare },
      { to: '/conversations', key: 'nav.conversations', icon: MessagesSquare },
      { to: '/calendar', key: 'nav.calendar', icon: CalendarDays },
    ],
  },
  {
    key: 'nav.group.sell',
    items: [
      { to: '/sellers', key: 'nav.sellers', icon: Users },
      { to: '/approvals', key: 'nav.approvals', icon: CheckSquare, badge: 3 },
      { to: '/campaigns', key: 'nav.campaigns', icon: Megaphone },
      { to: '/offers', key: 'nav.offers', icon: FileSignature },
      { to: '/transactions', key: 'nav.transactions', icon: ReceiptText },
    ],
  },
  {
    key: 'nav.group.govern',
    items: [
      { to: '/compliance', key: 'nav.compliance', icon: ShieldCheck },
      { to: '/audit', key: 'nav.audit', icon: ScrollText },
      { to: '/settings', key: 'nav.settings', icon: Settings },
    ],
  },
];

interface NavbarProps {
  collapsed: boolean;
}

export function Navbar({ collapsed }: NavbarProps) {
  const { t } = useT();
  return (
    <nav aria-label="Primary" className="flex-1 space-y-4 overflow-y-auto px-2 py-3">
      {NAV_GROUPS.map((group) => (
        <div key={group.key}>
          {!collapsed && (
            <p className="mb-1 px-2 text-[10.5px] font-semibold uppercase tracking-[0.06em] text-white/40">
              {t(group.key)}
            </p>
          )}
          <ul className="space-y-0.5">
            {group.items.map((item) => (
              <li key={item.to}>
                <NavLink
                  to={item.to}
                  end={item.to === '/'}
                  title={collapsed ? t(item.key) : undefined}
                  className={({ isActive }) =>
                    cn(
                      'group relative flex h-8 items-center gap-2.5 rounded-md px-2 text-[13px] font-medium transition-colors duration-150',
                      collapsed && 'justify-center px-0',
                      isActive
                        ? 'bg-pine-2 text-[#FAF8F4]'
                        : 'text-[#FAF8F4]/65 hover:bg-pine-2/60 hover:text-[#FAF8F4]/85',
                    )
                  }
                >
                  {({ isActive }) => (
                    <>
                      {isActive && (
                        <span className="absolute left-0 top-1/2 h-4 w-[3px] -translate-y-1/2 rounded-r bg-accent" aria-hidden />
                      )}
                      <item.icon size={16} strokeWidth={1.8} className="shrink-0" aria-hidden />
                      {!collapsed && <span className="min-w-0 flex-1 truncate leading-tight">{t(item.key)}</span>}
                      {!collapsed && item.badge != null && item.badge > 0 && (
                        <span className="tnum flex h-4 min-w-4 items-center justify-center rounded-full bg-ev-estimate px-1 text-[10px] font-semibold text-white">
                          {item.badge}
                        </span>
                      )}
                      {collapsed && item.badge != null && item.badge > 0 && (
                        <span className="absolute right-1 top-0.5 h-1.5 w-1.5 rounded-full bg-ev-estimate" aria-hidden />
                      )}
                    </>
                  )}
                </NavLink>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </nav>
  );
}
