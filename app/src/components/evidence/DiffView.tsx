import { cn } from '@/lib/utils';

export interface DiffEntry {
  field: string;
  oldValue: string | null;
  newValue: string;
}

interface DiffViewProps {
  diffs: DiffEntry[];
  className?: string;
}

/** Payload-bound approval diff: field, old (strikethrough red-tint), new (emerald-tint), mono values. */
export function DiffView({ diffs, className }: DiffViewProps) {
  return (
    <div className={cn('overflow-hidden rounded-lg border border-line', className)}>
      {diffs.map((d, i) => (
        <div key={i} className={cn('grid grid-cols-[minmax(96px,140px)_1fr_1fr] gap-2 px-3 py-2 text-[12.5px]', i > 0 && 'border-t border-line')}>
          <span className="truncate font-medium text-ink-2">{d.field}</span>
          <span className={cn('min-w-0 truncate rounded px-1.5 py-0.5 font-mono', d.oldValue ? 'bg-[#C2492B]/10 text-ev-conflict line-through' : 'text-ink-3')}>
            {d.oldValue ?? '—'}
          </span>
          <span className="min-w-0 truncate rounded bg-[#1E7A4F]/10 px-1.5 py-0.5 font-mono text-ev-verified">
            {d.newValue}
          </span>
        </div>
      ))}
    </div>
  );
}
