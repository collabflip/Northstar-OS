import { cn } from '@/lib/utils';
import { useT } from '@/lib/i18n';

export type FreshnessLevel = 'fresh' | 'aging' | 'stale';

export function freshnessFromAge(ageHours: number): FreshnessLevel {
  if (ageHours < 24) return 'fresh';
  if (ageHours <= 24 * 7) return 'aging';
  return 'stale';
}

const DOT: Record<FreshnessLevel, string> = {
  fresh: 'bg-ev-verified',
  aging: 'bg-ev-estimate',
  stale: 'bg-ev-conflict',
};

interface FreshnessIndicatorProps {
  /** Human-readable relative age, e.g. "2h ago" */
  label: string;
  level: FreshnessLevel;
  /** Exact timestamp shown on hover, with sync cursor ID */
  exact?: string;
  cursorId?: string;
  className?: string;
}

export function FreshnessIndicator({ label, level, exact, cursorId, className }: FreshnessIndicatorProps) {
  const { t } = useT();
  const title = [exact, cursorId ? `cursor ${cursorId}` : null].filter(Boolean).join(' · ');
  return (
    <span
      className={cn('inline-flex items-center gap-1.5 text-[12px] text-ink-3', className)}
      title={title || undefined}
    >
      <span className={cn('h-1.5 w-1.5 rounded-full', DOT[level])} aria-hidden />
      <span>
        {t('freshness.updated')} {label}
        {level === 'stale' && <span className="ml-1 font-medium text-ev-conflict">· {t('freshness.stale')}</span>}
      </span>
    </span>
  );
}
