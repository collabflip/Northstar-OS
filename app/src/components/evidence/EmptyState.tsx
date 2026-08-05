import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface EmptyStateProps {
  title: string;
  description?: string;
  /** Defaults to the manifest's empty-inbox illustration */
  illustration?: string;
  action?: ReactNode;
  className?: string;
}

/** Illustrated empty state with a next action. */
export function EmptyState({ title, description, illustration = '/empty-inbox.svg', action, className }: EmptyStateProps) {
  return (
    <div className={cn('flex flex-col items-center justify-center px-6 py-10 text-center', className)}>
      <img src={illustration} alt="" className="mb-4 h-auto w-40 opacity-90" />
      <p className="text-[14px] font-semibold text-ink">{title}</p>
      {description && <p className="mt-1 max-w-sm text-[13px] text-ink-2">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
