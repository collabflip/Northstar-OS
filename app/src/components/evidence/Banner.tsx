import { Info, ShieldAlert, AlertTriangle, FlaskConical } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export type BannerVariant = 'info' | 'warning' | 'escalation' | 'truthful';

const CONFIG: Record<BannerVariant, { icon: LucideIcon; cls: string }> = {
  info:       { icon: Info,          cls: 'border-accent/30 bg-accent-tint text-ink' },
  warning:    { icon: AlertTriangle, cls: 'border-ev-estimate/30 bg-[#9A6A1B]/10 text-ink' },
  escalation: { icon: ShieldAlert,   cls: 'border-ev-conflict/30 bg-[#C2492B]/10 text-ink' },
  truthful:   { icon: FlaskConical,  cls: 'border-line-strong bg-surface-2 text-ink-2' },
};

interface BannerProps {
  variant: BannerVariant;
  title?: string;
  children: ReactNode;
  action?: ReactNode;
  className?: string;
}

/** Page-level strip banner. `escalation` is for human-only topics; `truthful` for mock-integration notices. */
export function Banner({ variant, title, children, action, className }: BannerProps) {
  const { icon: Icon, cls } = CONFIG[variant];
  return (
    <div className={cn('flex items-start gap-3 rounded-lg border px-3 py-2.5 text-[13px] leading-[18px]', cls, className)} role={variant === 'escalation' ? 'alert' : 'status'}>
      <Icon size={16} className="mt-0.5 shrink-0" aria-hidden />
      <div className="min-w-0 flex-1">
        {title && <p className="font-semibold">{title}</p>}
        <div>{children}</div>
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}
