import { useState } from 'react';
import { Link, Outlet, useLocation } from 'react-router';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Bell, Search, ShieldCheck, ChevronsLeft, ChevronsRight, ChevronDown,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useT } from '@/lib/i18n';
import type { StringKey } from '@/lib/i18n';
import { useAuth } from '@/hooks/useAuth';
import { AuthLayoutSkeleton } from './AuthLayoutSkeleton';
import { Navbar } from './Navbar';
import { AutonomyBadge } from './evidence/AutonomyBadge';

/** Map pathnames to localized page-context labels for the top bar. */
const PAGE_TITLES: [RegExp, StringKey][] = [
  [/^\/$/, 'nav.commandCentre'],
  [/^\/pipeline/, 'nav.pipeline'],
  [/^\/conversations/, 'nav.conversations'],
  [/^\/calendar/, 'nav.calendar'],
  [/^\/sellers/, 'nav.sellers'],
  [/^\/approvals/, 'nav.approvals'],
  [/^\/campaigns/, 'nav.campaigns'],
  [/^\/offers/, 'nav.offers'],
  [/^\/transactions/, 'nav.transactions'],
  [/^\/compliance/, 'nav.compliance'],
  [/^\/audit/, 'nav.audit'],
  [/^\/settings/, 'nav.settings'],
];

export default function Layout() {
  const { t, lang, setLang } = useT();
  const location = useLocation();
  const [collapsed, setCollapsed] = useState(false);
  const [autonomyOpen, setAutonomyOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);

  const pageTitle = PAGE_TITLES.find(([re]) => re.test(location.pathname))?.[1];

  // F2: auth gate — unauthenticated users are redirected to /login.
  const { user, isLoading } = useAuth({ redirectOnUnauthenticated: true });
  if (isLoading) return <AuthLayoutSkeleton />;
  if (!user) return null;

  return (
    <div className="flex min-h-[100dvh] bg-paper">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:z-[60] focus:m-2 focus:rounded-md focus:bg-surface focus:px-3 focus:py-2 focus:text-[13px] focus:font-medium focus:text-accent"
      >
        Skip to content
      </a>

      {/* ── Sidebar (pine) ─────────────────────────────────────────── */}
      <aside
        className={cn(
          'sticky top-0 flex h-[100dvh] shrink-0 flex-col bg-pine transition-[width] duration-200',
          collapsed ? 'w-16' : 'w-[248px]',
        )}
      >
        {/* Brand */}
        <div className={cn('flex h-14 shrink-0 items-center gap-2.5 border-b border-white/10 px-4', collapsed && 'justify-center px-0')}>
          <img src="/logo.svg" alt="" className="h-7 w-7 shrink-0 rounded-[4px] bg-[#FAF8F4]" />
          {!collapsed && (
            <div className="min-w-0">
              <p className="truncate text-[14px] font-semibold leading-4 text-[#FAF8F4]">{t('brand.name')}</p>
              <span className="mt-0.5 inline-block rounded bg-white/10 px-1 font-mono text-[10px] text-white/60">
                {t('tenant.short')}
              </span>
            </div>
          )}
        </div>

        <Navbar collapsed={collapsed} />

        {/* Sidebar footer */}
        <div className="shrink-0 space-y-2 border-t border-white/10 p-3">
          {!collapsed && (
            <div className="flex items-center justify-between rounded-lg bg-white/5 px-2 py-1.5">
              <span className="text-[11px] font-medium text-white/55">{t('sidebar.autonomyCeiling')}</span>
              <AutonomyBadge level="A2" showLabel={false} className="border-white/20 bg-white/5 text-[#FAF8F4]" />
            </div>
          )}
          {!collapsed && (
            <p className="flex items-center gap-1.5 px-1 text-[11px] text-white/55">
              <span className="h-1.5 w-1.5 rounded-full bg-ev-estimate" aria-hidden />
              {t('sidebar.mockProviders')}
            </p>
          )}
          {collapsed && (
            <p className="flex justify-center" title={t('sidebar.mockProviders')}>
              <span className="h-1.5 w-1.5 rounded-full bg-ev-estimate" aria-hidden />
            </p>
          )}
          <div className={cn('flex items-center gap-2', collapsed && 'justify-center')}>
            <img src="/avatar-maya.png" alt="Maya Chen" className="h-7 w-7 shrink-0 rounded-full border border-white/20 object-cover" />
            {!collapsed && (
              <div className="min-w-0 flex-1">
                <p className="truncate text-[12px] font-medium leading-4 text-[#FAF8F4]">Maya Chen</p>
                <p className="truncate text-[10.5px] text-white/50">Sales Representative</p>
              </div>
            )}
            <button
              type="button"
              onClick={() => setCollapsed((v) => !v)}
              aria-label={collapsed ? t('sidebar.expand') : t('sidebar.collapse')}
              className="rounded-md p-1 text-white/50 hover:bg-white/10 hover:text-white"
            >
              {collapsed ? <ChevronsRight size={14} /> : <ChevronsLeft size={14} />}
            </button>
          </div>
        </div>
      </aside>

      {/* ── Main column ────────────────────────────────────────────── */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Top bar */}
        <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center gap-3 border-b border-line bg-surface px-4">
          <h2 className="min-w-0 truncate text-[14px] font-semibold text-ink">
            {pageTitle ? t(pageTitle) : t('brand.name')}
          </h2>

          <span className="hidden items-center gap-1.5 rounded-full border border-ev-estimate/30 bg-[#9A6A1B]/10 px-2 py-0.5 text-[11px] font-medium text-ev-estimate md:inline-flex">
            <span className="h-1.5 w-1.5 rounded-full bg-ev-estimate" aria-hidden />
            {t('topbar.demoData')}
          </span>

          <div className="flex-1" />

          {/* ⌘K search affordance */}
          <button
            type="button"
            className="hidden h-8 items-center gap-2 rounded-lg border border-line bg-surface-2 px-2.5 text-[12px] text-ink-3 hover:border-line-strong sm:flex"
            aria-label={t('topbar.search')}
          >
            <Search size={13} aria-hidden />
            <span className="hidden lg:inline">{t('topbar.search')}</span>
            <kbd className="rounded border border-line bg-surface px-1 font-mono text-[10px] text-ink-3">⌘K</kbd>
          </button>

          {/* EN | FR segmented toggle */}
          <div role="group" aria-label={t('topbar.language')} className="flex h-7 items-center rounded-lg border border-line bg-surface-2 p-0.5">
            {(['en', 'fr'] as const).map((l) => (
              <button
                key={l}
                type="button"
                onClick={() => setLang(l)}
                aria-pressed={lang === l}
                className={cn(
                  'h-6 rounded-md px-2 text-[11px] font-semibold uppercase transition-colors',
                  lang === l ? 'bg-surface text-ink shadow-card' : 'text-ink-3 hover:text-ink-2',
                )}
              >
                {l}
              </button>
            ))}
          </div>

          {/* Autonomy selector */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setAutonomyOpen((v) => !v)}
              aria-expanded={autonomyOpen}
              className="flex h-8 items-center gap-1.5 rounded-lg border border-line px-2 text-[12px] font-medium text-ink-2 hover:border-line-strong"
            >
              <ShieldCheck size={14} className="text-aut-a2" aria-hidden />
              <span className="font-mono">A2</span>
              <ChevronDown size={12} className="text-ink-3" aria-hidden />
            </button>
            <AnimatePresence>
              {autonomyOpen && (
                <motion.div
                  role="dialog"
                  className="absolute right-0 top-full z-40 mt-1.5 w-72 rounded-xl border border-line bg-surface p-3 shadow-lift"
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 4 }}
                  transition={{ duration: 0.14 }}
                >
                  <AutonomyBadge level="A2" />
                  <p className="mt-2 text-[12px] leading-4 text-ink-2">{t('topbar.autonomyExplainer')}</p>
                  <Link to="/settings" onClick={() => setAutonomyOpen(false)} className="mt-2 inline-block text-[12px] font-medium text-accent hover:underline">
                    {t('nav.settings')} →
                  </Link>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Notifications */}
          <button type="button" aria-label={t('topbar.notifications')} className="relative rounded-lg p-2 text-ink-2 hover:bg-surface-2">
            <Bell size={16} aria-hidden />
            <span className="tnum absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-ev-conflict px-1 text-[9.5px] font-semibold text-white">
              3
            </span>
          </button>

          {/* Tenant */}
          <span className="hidden items-center gap-1.5 text-[12px] font-medium text-ink-2 xl:flex">
            <span className="h-2 w-2 rounded-full bg-maple" aria-hidden />
            {t('tenant.name')}
          </span>

          {/* User menu */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setUserMenuOpen((v) => !v)}
              aria-expanded={userMenuOpen}
              aria-label={t('topbar.userMenu')}
              className="flex items-center gap-1 rounded-lg p-1 hover:bg-surface-2"
            >
              <img src="/avatar-maya.png" alt="" className="h-7 w-7 rounded-full border border-line object-cover" />
              <ChevronDown size={12} className="text-ink-3" aria-hidden />
            </button>
            <AnimatePresence>
              {userMenuOpen && (
                <motion.div
                  role="menu"
                  className="absolute right-0 top-full z-40 mt-1.5 w-48 rounded-xl border border-line bg-surface p-1 shadow-lift"
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 4 }}
                  transition={{ duration: 0.14 }}
                >
                  <p className="px-2.5 py-1.5 text-[12px] font-medium text-ink">Maya Chen</p>
                  <p className="px-2.5 pb-1.5 text-[11px] text-ink-3">maya.chen@harbourline.example</p>
                  <div className="my-1 h-px bg-line" />
                  {/* AUTH-SLOT: rewired to useAuth() in backend graft */}
                  <Link
                    to="/login"
                    role="menuitem"
                    onClick={() => setUserMenuOpen(false)}
                    className="block rounded-lg px-2.5 py-1.5 text-[13px] text-ink-2 hover:bg-surface-2"
                  >
                    {t('topbar.signIn')}
                  </Link>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </header>

        {/* Content slot — page transition: fade + 8px rise, 200ms ease-out */}
        <main id="main-content" className="min-w-0 flex-1">
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={location.pathname}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2, ease: 'easeOut' }}
            >
              <Outlet />
            </motion.div>
          </AnimatePresence>
        </main>
      </div>
    </div>
  );
}
