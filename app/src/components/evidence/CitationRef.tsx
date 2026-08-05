import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { FileText } from 'lucide-react';

interface CitationRefProps {
  /** e.g. "p.4 §2" */
  ref: string;
  /** The quoted source text shown in the popover */
  quote: string;
  /** Document name / thumbnail link */
  documentName?: string;
  documentHref?: string;
}

/** Superscript-like inline token `[p.4 §2]` opening a mini-popover with the quoted source. */
export function CitationRef({ ref: refLabel, quote, documentName, documentHref }: CitationRefProps) {
  const [open, setOpen] = useState(false);
  return (
    <span className="relative inline-block align-super">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        onBlur={() => setOpen(false)}
        className="rounded px-0.5 font-mono text-[10.5px] font-medium text-accent hover:bg-accent-tint"
        aria-expanded={open}
      >
        [{refLabel}]
      </button>
      <AnimatePresence>
        {open && (
          <motion.span
            role="tooltip"
            className="absolute left-0 top-full z-30 mt-1 block w-64 rounded-lg border border-line bg-surface p-2.5 text-left shadow-lift"
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 4 }}
            transition={{ duration: 0.14 }}
          >
            <span className="block border-l-2 border-accent pl-2 text-[12px] leading-4 text-ink-2">“{quote}”</span>
            {documentName && (
              <a
                href={documentHref ?? '#'}
                className="mt-2 flex items-center gap-1.5 text-[11px] font-medium text-accent hover:underline"
                onMouseDown={(e) => e.preventDefault()}
              >
                <FileText size={11} aria-hidden />
                {documentName} · {refLabel}
              </a>
            )}
          </motion.span>
        )}
      </AnimatePresence>
    </span>
  );
}
