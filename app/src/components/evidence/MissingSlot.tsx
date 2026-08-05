import { CircleDashed, Send } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useT } from '@/lib/i18n';

interface MissingSlotProps {
  fieldLabel: string;
  /** Request affordance handler (e.g. request from seller) */
  onRequest?: () => void;
  className?: string;
}

/** Dashed-border inline field for missing information with a "Provide / Request" affordance. */
export function MissingSlot({ fieldLabel, onRequest, className }: MissingSlotProps) {
  const { t } = useT();
  return (
    <span className={cn('inline-flex items-center gap-2 rounded-md border border-dashed border-ev-missing bg-[#9B9587]/5 px-2 py-1', className)}>
      <CircleDashed size={13} className="shrink-0 text-ev-missing" aria-hidden />
      <span className="text-[12px] text-ink-3">
        {fieldLabel} — {t('misc.notProvided')}
      </span>
      {onRequest && (
        <button
          type="button"
          onClick={onRequest}
          className="inline-flex items-center gap-1 rounded-md border border-line bg-surface px-1.5 py-0.5 text-[11px] font-medium text-accent hover:bg-accent-tint"
        >
          <Send size={10} aria-hidden />
          {t('action.requestFromSeller')}
        </button>
      )}
    </span>
  );
}
