import { useT } from '@/lib/i18n';
import type { StringKey } from '@/lib/i18n';
import { EmptyState } from '@/components/evidence/EmptyState';

/**
 * Placeholder page for routes owned by page agents.
 * Each stub keeps the route + page title contract so page agents can swap in
 * full implementations without touching App.tsx.
 */
export default function PageStub({ titleKey, subtitle }: { titleKey: StringKey; subtitle?: string }) {
  const { t } = useT();
  return (
    <div className="p-6">
      <header className="mb-4">
        <h1 className="text-[22px] font-semibold leading-7 tracking-[-0.01em] text-ink">{t(titleKey)}</h1>
        {subtitle && <p className="mt-0.5 text-[12px] text-ink-3">{subtitle}</p>}
      </header>
      <div className="ns-card">
        <EmptyState
          title={t(titleKey)}
          description="This surface is being built by its page agent. The route and shell contract are already in place."
        />
      </div>
    </div>
  );
}
