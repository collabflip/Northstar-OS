import { useState } from 'react';
import { Lock } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import { cn } from '@/lib/utils';

interface BlockedActionProps {
  label: string;
  /** The exact reason, always visible — fail-closed is explainable */
  reason: string;
  className?: string;
}

/** Disabled action + lock icon + reason popover ("Requires A4 — broker of record approval"). */
export function BlockedAction({ label, reason, className }: BlockedActionProps) {
  const [show, setShow] = useState(false);
  return (
    <span className={cn('relative inline-flex', className)}>
      <button
        type="button"
        disabled
        aria-disabled="true"
        aria-describedby={show ? 'blocked-reason' : undefined}
        onMouseEnter={() => setShow(true)}
        onMouseLeave={() => setShow(false)}
        onFocus={() => setShow(true)}
        onBlur={() => setShow(false)}
        className="inline-flex h-8 cursor-not-allowed items-center gap-1.5 rounded-lg border border-line bg-surface-2 px-3 text-[13px] font-medium text-ev-blocked"
      >
        <Lock size={13} aria-hidden />
        {label}
      </button>
      <AnimatePresence>
        {show && (
          <motion.span
            id="blocked-reason"
            role="tooltip"
            className="absolute bottom-full left-0 z-30 mb-1.5 w-56 rounded-lg border border-line bg-surface p-2 text-[12px] leading-4 text-ink-2 shadow-lift"
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 4 }}
            transition={{ duration: 0.14 }}
          >
            {reason}
          </motion.span>
        )}
      </AnimatePresence>
    </span>
  );
}
