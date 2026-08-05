import {
  CheckCircle2, Database, Sigma, Sparkles, HelpCircle, CircleDashed,
  GitCompareArrows, Compass, BadgeCheck, Lock,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { useT } from '@/lib/i18n';
import type { StringKey } from '@/lib/i18n';

export type EvidenceState =
  | 'verified' | 'external' | 'estimate' | 'generated' | 'assumption'
  | 'missing' | 'conflict' | 'ai' | 'approved' | 'blocked';

const CONFIG: Record<EvidenceState, { icon: LucideIcon; color: string; dashed?: boolean }> = {
  verified:   { icon: CheckCircle2,      color: '#1E7A4F' },
  external:   { icon: Database,          color: '#54677A' },
  estimate:   { icon: Sigma,             color: '#9A6A1B' },
  generated:  { icon: Sparkles,          color: '#6E6A86' },
  assumption: { icon: HelpCircle,        color: '#5B564C', dashed: true },
  missing:    { icon: CircleDashed,      color: '#9B9587' },
  conflict:   { icon: GitCompareArrows,  color: '#C2492B' },
  ai:         { icon: Compass,           color: '#0E5A50' },
  approved:   { icon: BadgeCheck,        color: '#1E7A4F' },
  blocked:    { icon: Lock,              color: '#75706A' },
};

const LABEL_KEY: Record<EvidenceState, StringKey> = {
  verified: 'ev.verified', external: 'ev.external', estimate: 'ev.estimate',
  generated: 'ev.generated', assumption: 'ev.assumption', missing: 'ev.missing',
  conflict: 'ev.conflict', ai: 'ev.ai', approved: 'ev.approved', blocked: 'ev.blocked',
};

export function evidenceColor(state: EvidenceState): string {
  return CONFIG[state].color;
}

interface EvidenceChipProps {
  state: EvidenceState;
  /** Optional override label; defaults to localized state label */
  label?: string;
  /** Chips appear with scale 0.9→1 per motion spec; disable inside drawers */
  animate?: boolean;
  onClick?: () => void;
  className?: string;
}

export function EvidenceChip({ state, label, animate = true, onClick, className }: EvidenceChipProps) {
  const { t } = useT();
  const { icon: Icon, color, dashed } = CONFIG[state];
  const text = label ?? t(LABEL_KEY[state]);
  const body = (
    <>
      <Icon size={12} strokeWidth={2} aria-hidden />
      <span className="truncate">{text}</span>
    </>
  );
  const style = {
    color,
    backgroundColor: `${color}1A`,
    borderColor: `${color}4D`,
  };
  const cls = cn(
    'inline-flex h-5 max-w-full items-center gap-1 rounded-md border px-1.5 text-[11px] font-medium leading-none',
    dashed && 'border-dashed',
    onClick && 'cursor-pointer hover:brightness-95',
    className,
  );
  if (onClick) {
    return (
      <motion.button
        type="button"
        onClick={onClick}
        className={cls}
        style={style}
        initial={animate ? { scale: 0.9, opacity: 0 } : false}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 0.16 }}
      >
        {body}
      </motion.button>
    );
  }
  return (
    <motion.span
      className={cls}
      style={style}
      initial={animate ? { scale: 0.9, opacity: 0 } : false}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ duration: 0.16 }}
    >
      {body}
    </motion.span>
  );
}
