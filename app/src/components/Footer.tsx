import { Link } from 'react-router';
import { useT } from '@/lib/i18n';

/** Minimal footer for portal / auth pages (the app shell has no footer). */
export function Footer() {
  const { t } = useT();
  return (
    <footer className="border-t border-line bg-surface px-6 py-4">
      <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-2 text-[12px] text-ink-3">
        <span className="flex items-center gap-2">
          <img src="/logo.svg" alt="" className="h-4 w-4" />
          {t('brand.name')} · {t('tenant.name')}
        </span>
        <span className="flex items-center gap-3">
          <span className="inline-flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-ev-estimate" aria-hidden />
            {t('sidebar.mockProviders')} · {t('topbar.demoData')}
          </span>
          <Link to="/login" className="font-medium text-accent hover:underline">
            {t('topbar.signIn')}
          </Link>
        </span>
      </div>
    </footer>
  );
}
