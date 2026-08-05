import { AnimatePresence, motion } from 'framer-motion';
import { X, ExternalLink } from 'lucide-react';
import { useEffect } from 'react';
import { EvidenceChip } from './EvidenceChip';
import type { EvidenceState } from './EvidenceChip';
import { FreshnessIndicator } from './FreshnessIndicator';
import type { FreshnessLevel } from './FreshnessIndicator';
import { ConfidenceBar } from './ConfidenceBar';
import { useT } from '@/lib/i18n';

export interface LineageLink {
  kind: 'agent' | 'tool' | 'source' | 'policy';
  label: string;
  /** mono-ID link into Audit Explorer */
  ref: string;
}

export interface EvidenceDetail {
  statement: string;
  state: EvidenceState;
  sourceName?: string;
  sourceHref?: string;
  freshnessLabel?: string;
  freshnessLevel?: FreshnessLevel;
  confidence?: number;
  confidenceBasis?: string;
  lineage?: LineageLink[];
  assumptions?: string[];
  conflicts?: { a: string; b: string }[];
  policies?: { id: string; label: string }[];
}

interface EvidenceDrawerProps {
  open: boolean;
  onClose: () => void;
  evidence: EvidenceDetail | null;
}

/** "Why this?" right drawer, 420px, opened from any material statement. */
export function EvidenceDrawer({ open, onClose, evidence }: EvidenceDrawerProps) {
  const { t } = useT();

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && evidence && (
        <>
          <motion.div
            className="fixed inset-0 z-40 bg-ink/20"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            onClick={onClose}
            aria-hidden
          />
          <motion.aside
            role="dialog"
            aria-modal="true"
            aria-label={t('drawer.title')}
            className="fixed inset-y-0 right-0 z-50 flex w-[420px] max-w-[92vw] flex-col border-l border-line bg-surface shadow-lift"
            initial={{ x: 420 }}
            animate={{ x: 0 }}
            exit={{ x: 420 }}
            transition={{ type: 'spring', stiffness: 380, damping: 34 }}
          >
            <header className="flex h-14 shrink-0 items-center justify-between border-b border-line px-4">
              <h2 className="text-[16px] font-semibold text-ink">{t('drawer.title')}</h2>
              <button type="button" onClick={onClose} aria-label={t('action.close')} className="rounded-md p-1.5 text-ink-3 hover:bg-surface-2 hover:text-ink">
                <X size={16} />
              </button>
            </header>
            <div className="flex-1 space-y-5 overflow-y-auto p-4">
              <section>
                <p className="ns-meta mb-1.5">{t('drawer.statement')}</p>
                <p className="text-[14px] leading-5 text-ink">{evidence.statement}</p>
                <div className="mt-2">
                  <EvidenceChip state={evidence.state} animate={false} />
                </div>
              </section>

              {evidence.sourceName && (
                <section>
                  <p className="ns-meta mb-1.5">{t('drawer.source')}</p>
                  {evidence.sourceHref ? (
                    <a href={evidence.sourceHref} className="inline-flex items-center gap-1 text-[13px] font-medium text-accent hover:underline">
                      {evidence.sourceName}
                      <ExternalLink size={12} aria-hidden />
                    </a>
                  ) : (
                    <p className="text-[13px] text-ink">{evidence.sourceName}</p>
                  )}
                </section>
              )}

              {evidence.freshnessLabel && (
                <section>
                  <p className="ns-meta mb-1.5">{t('drawer.freshness')}</p>
                  <FreshnessIndicator label={evidence.freshnessLabel} level={evidence.freshnessLevel ?? 'fresh'} />
                </section>
              )}

              {typeof evidence.confidence === 'number' && (
                <section>
                  <p className="ns-meta mb-1.5">{t('drawer.confidence')}</p>
                  <ConfidenceBar value={evidence.confidence} basis={evidence.confidenceBasis} />
                  {evidence.confidenceBasis && (
                    <p className="mt-1 text-[12px] text-ink-3">{evidence.confidenceBasis}</p>
                  )}
                </section>
              )}

              {evidence.lineage && evidence.lineage.length > 0 && (
                <section>
                  <p className="ns-meta mb-1.5">{t('drawer.lineage')}</p>
                  <ol className="space-y-1.5">
                    {evidence.lineage.map((link, i) => (
                      <li key={i} className="flex items-center gap-2 text-[13px]">
                        <span className="w-14 shrink-0 text-[11px] font-medium uppercase tracking-[0.04em] text-ink-3">{link.kind}</span>
                        <span className="min-w-0 flex-1 truncate text-ink">{link.label}</span>
                        <a href={`/audit?ref=${encodeURIComponent(link.ref)}`} className="shrink-0 font-mono text-[11px] text-accent hover:underline">
                          {link.ref}
                        </a>
                      </li>
                    ))}
                  </ol>
                </section>
              )}

              {evidence.assumptions && evidence.assumptions.length > 0 && (
                <section>
                  <p className="ns-meta mb-1.5">{t('drawer.assumptions')}</p>
                  <ul className="space-y-1">
                    {evidence.assumptions.map((a, i) => (
                      <li key={i} className="border-l-2 border-dashed border-ev-assumption pl-2 text-[13px] text-ink-2">{a}</li>
                    ))}
                  </ul>
                </section>
              )}

              {evidence.conflicts && evidence.conflicts.length > 0 && (
                <section>
                  <p className="ns-meta mb-1.5">{t('drawer.conflicts')}</p>
                  <ul className="space-y-2">
                    {evidence.conflicts.map((c, i) => (
                      <li key={i} className="grid grid-cols-2 gap-2 border-l-2 border-ev-conflict pl-2 text-[13px]">
                        <span className="rounded-md bg-[#C2492B]/10 px-2 py-1 text-ink">{c.a}</span>
                        <span className="rounded-md bg-surface-2 px-2 py-1 text-ink">{c.b}</span>
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              {evidence.policies && evidence.policies.length > 0 && (
                <section>
                  <p className="ns-meta mb-1.5">{t('drawer.policies')}</p>
                  <ul className="space-y-1">
                    {evidence.policies.map((p) => (
                      <li key={p.id} className="flex items-center gap-2 text-[13px]">
                        <code className="font-mono text-[11px] text-ink-3">{p.id}</code>
                        <span className="text-ink-2">{p.label}</span>
                      </li>
                    ))}
                  </ul>
                </section>
              )}
            </div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}
