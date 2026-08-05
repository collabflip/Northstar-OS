import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';

interface ConfidenceBarProps {
  /** 0-100 */
  value: number;
  /** Bar colour; estimates are amber by default */
  color?: string;
  /** Tooltip basis, e.g. "7 comparables, 2 excluded — see reasoning" */
  basis?: string;
  showLabel?: boolean;
  className?: string;
}

export function ConfidenceBar({ value, color = '#9A6A1B', basis, showLabel = true, className }: ConfidenceBarProps) {
  const clamped = Math.max(0, Math.min(100, value));
  return (
    <span className={cn('inline-flex items-center gap-2', className)} title={basis}>
      <span className="h-1 w-16 overflow-hidden rounded-full bg-surface-2" role="progressbar" aria-valuenow={clamped} aria-valuemin={0} aria-valuemax={100}>
        <motion.span
          className="block h-full rounded-full"
          style={{ backgroundColor: color }}
          initial={{ width: 0 }}
          animate={{ width: `${clamped}%` }}
          transition={{ duration: 0.5, ease: 'easeOut' }}
        />
      </span>
      {showLabel && <span className="tnum text-[12px] font-medium text-ink-2">{clamped}%</span>}
    </span>
  );
}
