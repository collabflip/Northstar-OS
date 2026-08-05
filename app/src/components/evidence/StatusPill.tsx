import { cn } from '@/lib/utils';

export type StatusTone = 'neutral' | 'accent' | 'emerald' | 'amber' | 'red' | 'slate' | 'violet';

const TONE: Record<StatusTone, string> = {
  neutral: 'bg-ink-3',
  accent: 'bg-accent',
  emerald: 'bg-ev-verified',
  amber: 'bg-ev-estimate',
  red: 'bg-ev-conflict',
  slate: 'bg-ev-external',
  violet: 'bg-ev-generated',
};

interface StatusPillProps {
  label: string;
  tone?: StatusTone;
  className?: string;
}

/** Pipeline/transaction/task status: dot + label, consistent across kanban, tables, timelines. */
export function StatusPill({ label, tone = 'neutral', className }: StatusPillProps) {
  return (
    <span className={cn('inline-flex h-5 items-center gap-1.5 rounded-full border border-line bg-surface px-2 text-[11px] font-medium text-ink-2', className)}>
      <span className={cn('h-1.5 w-1.5 rounded-full', TONE[tone])} aria-hidden />
      <span className="truncate">{label}</span>
    </span>
  );
}
