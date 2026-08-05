import { Check, X, Minus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useT } from '@/lib/i18n';

export type GateStatus = 'pass' | 'fail' | 'na';

export interface GateCheck {
  id: string;
  label: string;
  /** mono detail, e.g. policy ID or hash */
  detail?: string;
  status: GateStatus;
}

const ICON = { pass: Check, fail: X, na: Minus } as const;
const COLOR = { pass: 'text-ev-verified', fail: 'text-ev-conflict', na: 'text-ink-3' } as const;

interface PolicyGatePanelProps {
  checks: GateCheck[];
  className?: string;
}

/** The 14-check commit-time policy gate. Fail-closed and explainable. */
export function PolicyGatePanel({ checks, className }: PolicyGatePanelProps) {
  const { t } = useT();
  const passed = checks.filter((c) => c.status === 'pass').length;
  return (
    <div className={cn('rounded-xl border border-line bg-surface p-3', className)}>
      <div className="mb-2 flex items-center justify-between">
        <p className="ns-meta">{t('policy.title')}</p>
        <span className="tnum text-[12px] font-medium text-ink-2">
          {passed}/{checks.length} {t('policy.passed')}
        </span>
      </div>
      <ul className="divide-y divide-line">
        {checks.map((c) => {
          const Icon = ICON[c.status];
          return (
            <li key={c.id} className="flex items-center gap-2 py-1.5 text-[13px]">
              <Icon size={14} className={cn('shrink-0', COLOR[c.status])} aria-hidden />
              <span className="min-w-0 flex-1 truncate text-ink">{c.label}</span>
              {c.detail && <code className="truncate font-mono text-[11px] text-ink-3">{c.detail}</code>}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
