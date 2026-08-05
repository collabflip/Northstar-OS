import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { User, Bot, Cog, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { EvidenceChip } from './EvidenceChip';
import type { EvidenceState } from './EvidenceChip';

export type ActorKind = 'human' | 'agent' | 'system';

const ACTOR_ICON = { human: User, agent: Bot, system: Cog } as const;

interface TimelineItemProps {
  title: string;
  actor: { kind: ActorKind; name: string };
  timestamp: string;
  evidenceState?: EvidenceState;
  detail?: string;
  isLast?: boolean;
}

/** Vertical timeline node: icon, actor chip, timestamp, evidence chip, expandable detail. */
export function TimelineItem({ title, actor, timestamp, evidenceState, detail, isLast }: TimelineItemProps) {
  const [open, setOpen] = useState(false);
  const Icon = ACTOR_ICON[actor.kind];
  return (
    <li className="relative flex gap-3 pb-4">
      {!isLast && <span className="absolute left-[11px] top-6 h-full w-px bg-line" aria-hidden />}
      <span className="z-10 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-line bg-surface text-ink-2">
        <Icon size={12} aria-hidden />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <p className="text-[13px] font-medium text-ink">{title}</p>
          {evidenceState && <EvidenceChip state={evidenceState} />}
        </div>
        <div className="mt-0.5 flex flex-wrap items-center gap-2 text-[12px] text-ink-3">
          <span className="inline-flex items-center gap-1 rounded-full bg-surface-2 px-1.5 py-0.5 text-[11px] font-medium text-ink-2">
            {actor.name}
          </span>
          <span className="tnum">{timestamp}</span>
          {detail && (
            <button
              type="button"
              onClick={() => setOpen((v) => !v)}
              className="inline-flex items-center gap-0.5 text-[11px] font-medium text-accent hover:underline"
              aria-expanded={open}
            >
              Details
              <motion.span animate={{ rotate: open ? 180 : 0 }} transition={{ duration: 0.16 }} className="inline-flex">
                <ChevronDown size={11} aria-hidden />
              </motion.span>
            </button>
          )}
        </div>
        <AnimatePresence initial={false}>
          {open && detail && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 380, damping: 34 }}
              className={cn('overflow-hidden')}
            >
              <p className="mt-1.5 rounded-lg bg-surface-2 p-2 text-[12px] leading-4 text-ink-2">{detail}</p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </li>
  );
}
