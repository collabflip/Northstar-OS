import { ShieldCheck, Lock } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useT } from '@/lib/i18n';
import type { StringKey } from '@/lib/i18n';

export type AutonomyLevel = 'A0' | 'A1' | 'A2' | 'A3' | 'A4';

const COLOR: Record<AutonomyLevel, string> = {
  A0: '#54677A',
  A1: '#6E6A86',
  A2: '#9A6A1B',
  A3: '#0E5A50',
  A4: '#C2492B',
};

const LABEL_KEY: Record<AutonomyLevel, StringKey> = {
  A0: 'autonomy.A0', A1: 'autonomy.A1', A2: 'autonomy.A2', A3: 'autonomy.A3', A4: 'autonomy.A4',
};

const ORDER: AutonomyLevel[] = ['A0', 'A1', 'A2', 'A3', 'A4'];

export function autonomyExceeds(required: AutonomyLevel, ceiling: AutonomyLevel): boolean {
  return ORDER.indexOf(required) > ORDER.indexOf(ceiling);
}

interface AutonomyBadgeProps {
  level: AutonomyLevel;
  /** When the action exceeds the tenant ceiling, render blocked with the missing authority */
  ceiling?: AutonomyLevel;
  showLabel?: boolean;
  className?: string;
}

export function AutonomyBadge({ level, ceiling, showLabel = true, className }: AutonomyBadgeProps) {
  const { t } = useT();
  const blocked = ceiling ? autonomyExceeds(level, ceiling) : false;
  const color = blocked ? '#75706A' : COLOR[level];
  const tooltip = blocked
    ? `${t('ev.blocked')} — requires ${level} ${t(LABEL_KEY[level])}; ceiling ${ceiling}`
    : `${level} — ${t(LABEL_KEY[level])}`;
  return (
    <span
      className={cn('inline-flex h-5 items-center gap-1 rounded-md border px-1.5 text-[11px] font-medium leading-none', className)}
      style={{ color, borderColor: `${color}66`, backgroundColor: `${color}0F` }}
      title={tooltip}
    >
      {blocked ? <Lock size={11} aria-hidden /> : <ShieldCheck size={11} aria-hidden />}
      <span className="font-mono text-[11px]">{blocked ? t('ev.blocked') : level}</span>
      {showLabel && !blocked && <span>{t(LABEL_KEY[level])}</span>}
      {blocked && <span>requires {level}</span>}
    </span>
  );
}
