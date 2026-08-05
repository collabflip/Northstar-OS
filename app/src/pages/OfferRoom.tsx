import { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { format, formatDistanceToNowStrict } from 'date-fns';
import {
  Clock, FileText, FileWarning, Lock, MessageCircleQuestion, Scale, ShieldAlert,
  Upload, X,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useOps } from '@/lib/i18n/ops';
import type { OpsKey } from '@/lib/i18n/ops';
import { formatCAD } from '@/lib/i18n';
import { trpc } from '@/providers/trpc';
import { Banner } from '@/components/evidence/Banner';
import { BlockedAction } from '@/components/evidence/BlockedAction';
import { CitationRef } from '@/components/evidence/CitationRef';
import { ConfidenceBar } from '@/components/evidence/ConfidenceBar';
import { EvidenceChip } from '@/components/evidence/EvidenceChip';
import type { EvidenceState } from '@/components/evidence/EvidenceChip';
import { MissingSlot } from '@/components/evidence/MissingSlot';
import { StatusPill } from '@/components/evidence/StatusPill';
import { EmptyState } from '@/components/evidence/EmptyState';
import { AutonomyBadge } from '@/components/evidence/AutonomyBadge';

function useOffersQuery(propertyId: number | null) {
  return trpc.offers.byProperty.useQuery(
    { propertyId: propertyId ?? 0 },
    { enabled: propertyId != null, retry: 1 },
  );
}
type OffersData = NonNullable<ReturnType<typeof useOffersQuery>['data']>;
type OfferRow = OffersData[number]['offer'];
type TermRow = OffersData[number]['terms'][number];

/* ── Helpers ───────────────────────────────────────────────────────── */

function cite(term: TermRow): string | null {
  if (term.sourcePage == null) return null;
  return `p.${term.sourcePage} §${term.sourceSection ?? ''}`.trim();
}

function quoteFor(offer: OfferRow, term: TermRow): string {
  const text = offer.documentText ?? '';
  if (term.sourcePage != null && term.sourceSection) {
    const marker = `[p.${term.sourcePage} §${term.sourceSection}]`;
    const line = text.split(/\r?\n/).find((l) => l.startsWith(marker));
    if (line) return line;
  }
  return term.flagNote ?? term.value ?? '';
}

function termEvidence(term: TermRow): EvidenceState {
  if (term.verifiedBy) return 'verified';
  if (term.flag === 'contradiction') return 'conflict';
  if (term.flag === 'missing') return 'missing';
  if (term.flag === 'unusual') return 'conflict';
  if ((term.confidence ?? 0) < 60) return 'estimate';
  return 'external';
}

function parseMoney(v: string | null): number | null {
  if (!v) return null;
  const m = v.replace(/[^\d]/g, '');
  return m ? Number(m) : null;
}

/** Live-ticking clock for countdown chips. */
function useNow(intervalMs = 1000): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

function CountdownChip({ until }: { until: Date }) {
  const { t, dfLocale } = useOps();
  const now = useNow();
  const ms = until.getTime() - now.getTime();
  if (ms <= 0) {
    return <StatusPill label={t('offer.expired')} tone="neutral" className="opacity-70" />;
  }
  const urgent = ms < 2 * 3600_000;
  const soon = ms < 6 * 3600_000;
  const label = formatDistanceToNowStrict(until, { locale: dfLocale, addSuffix: true });
  return (
    <span
      className={cn(
        'tnum inline-flex h-5 items-center gap-1 rounded-full border px-2 text-[11px] font-medium',
        urgent
          ? 'border-ev-conflict/40 bg-[#C2492B]/10 text-ev-conflict motion-safe:animate-pulse'
          : soon
            ? 'border-ev-estimate/40 bg-[#9A6A1B]/10 text-ev-estimate'
            : 'border-line bg-surface text-ink-2',
      )}
    >
      <Clock size={11} aria-hidden /> {label}
    </span>
  );
}

/* ── Term grid row spec ────────────────────────────────────────────── */

interface RowSpec {
  key: OpsKey;
  fields: string[];
  derived?: 'financing' | 'inspection';
}

const ROWS: RowSpec[] = [
  { key: 'offer.row.price', fields: ['price'] },
  { key: 'offer.row.deposit', fields: ['deposit'] },
  { key: 'offer.row.scheduleADeposit', fields: ['scheduleADeposit'] },
  { key: 'offer.row.completionDate', fields: ['completionDate'] },
  { key: 'offer.row.possession', fields: ['possession'] },
  { key: 'offer.row.irrevocability', fields: ['irrevocability'] },
  { key: 'offer.row.conditions', fields: ['conditions'] },
  { key: 'offer.row.financing', fields: ['conditions'], derived: 'financing' },
  { key: 'offer.row.inspection', fields: ['conditions'], derived: 'inspection' },
  { key: 'offer.row.saleOfPropertyCondition', fields: ['saleOfPropertyCondition'] },
  { key: 'offer.row.inclusions', fields: ['inclusions'] },
  { key: 'offer.row.exclusions', fields: ['exclusions'] },
  { key: 'offer.row.rentalItems', fields: ['rentalItems'] },
  { key: 'offer.row.warranties', fields: ['warranties'] },
  { key: 'offer.row.adjustments', fields: ['adjustments'] },
  { key: 'offer.row.schedules', fields: ['schedules'] },
  { key: 'offer.row.unusual', fields: ['escalationClause'] },
  { key: 'offer.row.signatures', fields: ['signatures'] },
];

function derivedValue(conditions: string | null, kind: 'financing' | 'inspection'): string | null {
  if (!conditions) return null;
  const parts = conditions.split(/[;]/).map((p) => p.trim()).filter(Boolean);
  const hit = parts.find((p) => p.toLowerCase().includes(kind === 'financing' ? 'financ' : 'inspect'));
  return hit ?? null;
}

/* ── Page ──────────────────────────────────────────────────────────── */

export default function OfferRoom() {
  const { t } = useOps();
  const [propertyId, setPropertyId] = useState<number | null>(null);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [decisionOpen, setDecisionOpen] = useState(false);
  const [briefQueued, setBriefQueued] = useState(false);

  const props = trpc.properties.list.useQuery(undefined, { retry: 1 });
  const utils = trpc.useUtils();

  // Default to the DEMO-ON-PROPERTY-001 property (seeded offer demo) when available.
  // propertyId is the user's explicit override; the selection is derived
  // during render instead of synced via setState-in-effect.
  const selectedPropertyId = propertyId ?? (props.data?.length
    ? (props.data.find((p) => /DEMO-ON-PROPERTY-001/i.test(p.addressLine1)) ?? props.data[0]).id
    : null);

  const offersQ = useOffersQuery(selectedPropertyId);
  const bundles = offersQ.data ?? [];
  const property = props.data?.find((p) => p.id === selectedPropertyId);

  const verify = trpc.offers.verifyTerm.useMutation({
    onSuccess: () => utils.offers.byProperty.invalidate(),
  });

  const priceDelta = useMemo(() => {
    if (bundles.length < 2) return null;
    const prices = bundles.map((b) => parseMoney(b.terms.find((x) => x.field === 'price')?.value ?? null));
    if (prices[0] != null && prices[1] != null) return prices[0]! - prices[1]!;
    return null;
  }, [bundles]);

  return (
    <div className="p-6">
      {/* Permanent A4 escalation banner — non-dismissible, first to mount */}
      <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }}>
        <Banner variant="escalation" title="A4 — human-only" className="mb-4">
          {t('offer.banner')}
        </Banner>
      </motion.div>

      {/* Header */}
      <header className="mb-4 flex flex-wrap items-center gap-3">
        <h1 className="text-[22px] font-semibold leading-7 tracking-[-0.01em] text-ink">
          {t('offer.title')}{property ? ` — ${property.addressLine1}` : ''}
        </h1>
        <span className="tnum text-[12px] text-ink-3">
          {t('offer.meta.count', { n: bundles.length })} · {t('offer.meta.irrevLive')}
        </span>
        <label className="sr-only" htmlFor="offer-prop">{t('offer.property')}</label>
        <select
          id="offer-prop"
          value={selectedPropertyId ?? ''}
          onChange={(e) => setPropertyId(Number(e.target.value))}
          className="h-8 rounded-lg border border-line bg-surface px-2 text-[12px] text-ink-2 focus:outline-none focus:ring-2 focus:ring-accent"
        >
          {(props.data ?? []).map((p) => (
            <option key={p.id} value={p.id}>{p.addressLine1}, {p.city}</option>
          ))}
        </select>
        <div className="flex-1" />
        <button
          type="button" onClick={() => setUploadOpen((v) => !v)}
          className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-accent px-3 text-[13px] font-medium text-white hover:bg-accent-hover"
        >
          <Upload size={14} aria-hidden /> {t('offer.uploadCta')}
        </button>
      </header>

      {/* Upload / paste affordance */}
      <AnimatePresence>
        {uploadOpen && selectedPropertyId != null && (
          <UploadPanel propertyId={selectedPropertyId} onDone={() => { setUploadOpen(false); utils.offers.byProperty.invalidate(); }} />
        )}
      </AnimatePresence>

      {/* Body: grid + right rail */}
      {offersQ.isLoading && <GridSkeleton />}
      {offersQ.isError && (
        <div className="rounded-xl border border-ev-conflict/40 bg-surface p-4">
          <p className="flex items-center gap-2 text-[14px] font-semibold text-ev-conflict"><FileWarning size={15} aria-hidden /> {t('ops.errorTitle')}</p>
          <p className="mt-1 text-[13px] text-ink-2">{t('ops.errorBody')}</p>
          <button type="button" onClick={() => offersQ.refetch()} className="mt-2 rounded-lg border border-line px-3 py-1 text-[12px] font-medium text-accent hover:bg-accent-tint">
            {t('ops.retry')}
          </button>
        </div>
      )}

      {!offersQ.isLoading && !offersQ.isError && bundles.length === 0 && (
        <div className="rounded-xl border border-dashed border-line-strong bg-surface shadow-card">
          <EmptyState
            title={t('offer.empty.title')}
            description={t('offer.empty.body')}
            action={
              <button type="button" onClick={() => setUploadOpen(true)}
                className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-accent px-3 text-[13px] font-medium text-white hover:bg-accent-hover">
                <Upload size={14} aria-hidden /> {t('offer.uploadCta')}
              </button>
            }
          />
        </div>
      )}

      {bundles.length > 0 && (
        <div className="flex items-start gap-4">
          {/* Comparison grid */}
          <div className="min-w-0 flex-1 overflow-x-auto rounded-xl border border-line bg-surface shadow-card">
            <table className="w-full border-collapse text-[13px]">
              <thead>
                <tr className="border-b border-line">
                  <th scope="col" className="sticky left-0 z-10 w-[220px] min-w-[220px] bg-surface px-3 py-2.5 text-left text-[11px] font-medium uppercase tracking-[0.04em] text-ink-3">
                    {t('offer.row.price') === 'Price' ? 'Term' : 'Terme'}
                  </th>
                  {bundles.map((b, i) => (
                    <motion.th
                      key={b.offer.id} scope="col"
                      initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.08 * (i + 1) }}
                      className="min-w-[240px] bg-surface px-3 py-2.5 text-left align-top"
                    >
                      <p className="flex items-center gap-1.5 text-[13px] font-semibold text-ink">
                        <FileText size={13} className="text-accent" aria-hidden />
                        Offer {String.fromCharCode(65 + i)} — {b.offer.buyerLabel}
                      </p>
                      <p className="tnum mt-0.5 text-[11px] text-ink-3">
                        {t('offer.col.received')} {format(new Date(b.offer.receivedAt), 'MMM d, HH:mm')}
                      </p>
                      <div className="mt-1 flex flex-wrap items-center gap-1.5">
                        {b.offer.irrevocableUntil && <CountdownChip until={new Date(b.offer.irrevocableUntil)} />}
                        <ConfidenceBar value={b.offer.extractionConfidence ?? 0} basis={t('offer.col.confidence')} />
                      </div>
                    </motion.th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {ROWS.map((row, ri) => (
                  <tr key={row.key} className="border-b border-line/70 transition-colors hover:bg-surface-2/60">
                    <th scope="row" className="sticky left-0 z-10 bg-surface px-3 py-2 text-left text-[12px] font-medium text-ink-2">
                      {t(row.key)}
                    </th>
                    {bundles.map((b, i) => (
                      <motion.td
                        key={b.offer.id}
                        initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.15 + ri * 0.015 }}
                        className="px-3 py-2 align-top"
                      >
                        <TermCell
                          bundle={b}
                          row={row}
                          deltaChip={row.fields[0] === 'price' && priceDelta != null && priceDelta !== 0
                            ? { amount: i === 0 ? priceDelta : -priceDelta, positive: i === 0 ? priceDelta > 0 : priceDelta < 0 }
                            : null}
                        />
                      </motion.td>
                    ))}
                  </tr>
                ))}
                {/* Flags row */}
                <tr className="hover:bg-surface-2/60">
                  <th scope="row" className="sticky left-0 z-10 bg-surface px-3 py-2 text-left text-[12px] font-medium text-ink-2">
                    {t('offer.row.flags')}
                  </th>
                  {bundles.map((b) => (
                    <td key={b.offer.id} className="px-3 py-2 align-top">
                      <FlagCell bundle={b} />
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
            <p className="border-t border-line px-3 py-2 text-[11px] text-ink-3">{t('offer.sourceLangNote')}</p>
          </div>

          {/* Right rail */}
          <aside className="hidden w-[360px] shrink-0 space-y-3 xl:block">
            <QuestionsCard bundles={bundles} />
            <QaCard
              bundles={bundles}
              onVerify={(termId) => verify.mutate({ termId })}
              verifying={verify.isPending}
            />
            <ActionsCard onRecord={() => setDecisionOpen(true)} />
            <div className="rounded-xl border border-line bg-surface p-3 shadow-card">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-[13px] font-semibold text-ink">{t('offer.brief')}</h3>
                <AutonomyBadge level="A1" />
              </div>
              <p className="mt-1 text-[12px] text-ink-3">{t('offer.brief.note')}</p>
              <button
                type="button" onClick={() => setBriefQueued(true)} disabled={briefQueued}
                className="mt-2 rounded-lg border border-accent/40 bg-accent-tint px-2.5 py-1 text-[12px] font-medium text-accent disabled:opacity-60"
              >
                {t('offer.brief')}
              </button>
              {briefQueued && (
                <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mt-2 flex items-start gap-1.5 rounded-lg border border-dashed border-line-strong bg-surface-2 p-2 text-[12px] text-ink-2">
                  <EvidenceChip state="generated" animate={false} /> {t('offer.brief.placeholder')}
                </motion.p>
              )}
            </div>
          </aside>
        </div>
      )}

      <AnimatePresence>
        {decisionOpen && bundles.length > 0 && (
          <DecisionSheet bundles={bundles} onClose={() => setDecisionOpen(false)} />
        )}
      </AnimatePresence>
    </div>
  );
}

/* ── Cells ─────────────────────────────────────────────────────────── */

function TermCell({ bundle, row, deltaChip }: {
  bundle: OffersData[number];
  row: RowSpec;
  deltaChip: { amount: number; positive: boolean } | null;
}) {
  const { t, lang } = useOps();
  const term = bundle.terms.find((x) => row.fields.includes(x.field));
  const missing = !term || term.value == null || term.value === '';

  if (row.derived) {
    const v = derivedValue(term?.value ?? null, row.derived);
    if (!v) return <span className="text-[12px] text-ink-3">{t('offer.none')}</span>;
    return (
      <div>
        <p className="text-[13px] text-ink">
          {v}
          {term && cite(term) && (
            <> <CitationRef ref={cite(term)!} quote={quoteFor(bundle.offer, term)} documentName={bundle.offer.fileName} /></>
          )}
        </p>
        <p className="mt-0.5 text-[10.5px] italic text-ink-3">{t('offer.derived')}</p>
      </div>
    );
  }

  if (missing) {
    return <MissingSlot fieldLabel={t(row.key)} />;
  }

  const evState = termEvidence(term);
  const lowConf = !term.verifiedBy && (term.confidence ?? 100) < 60;
  return (
    <div className={cn(term.flag === 'contradiction' && 'border-l-2 border-ev-conflict pl-2')}>
      <p className={cn('text-[13px] text-ink', lowConf && 'underline decoration-ev-estimate decoration-2 underline-offset-2')} title={lowConf ? t('offer.lowConfidence') : undefined}>
        {term.value}
        {cite(term) && (
          <> <CitationRef ref={cite(term)!} quote={quoteFor(bundle.offer, term)} documentName={bundle.offer.fileName} /></>
        )}
      </p>
      <div className="mt-1 flex flex-wrap items-center gap-1.5">
        <EvidenceChip state={evState} animate={false} />
        {deltaChip && (
          <span className={cn('tnum rounded-md px-1.5 py-0.5 text-[11px] font-semibold',
            deltaChip.positive ? 'bg-ev-verified/10 text-ev-verified' : 'bg-surface-2 text-ink-3')}>
            {deltaChip.positive ? '+' : '−'}{formatCAD(Math.abs(deltaChip.amount / 1000), lang).replace(/\$/, '')}k
          </span>
        )}
      </div>
      {term.flagNote && term.flag !== 'missing' && (
        <p className="mt-0.5 text-[11px] text-ev-conflict">{term.flagNote}</p>
      )}
    </div>
  );
}

function FlagCell({ bundle }: { bundle: OffersData[number] }) {
  const { t, lang } = useOps();
  const flagged = bundle.terms.filter((x) => x.flag);
  // Cross-term truth: deposit vs Schedule A mismatch.
  const deposit = parseMoney(bundle.terms.find((x) => x.field === 'deposit')?.value ?? null);
  const schedA = parseMoney(bundle.terms.find((x) => x.field === 'scheduleADeposit')?.value ?? null);
  const mismatch = deposit != null && schedA != null && deposit !== schedA;

  if (flagged.length === 0 && !mismatch) {
    return <EvidenceChip state="verified" animate={false} />;
  }
  return (
    <div className="space-y-1.5">
      {mismatch && (
        <p className="flex items-start gap-1.5 text-[12px] text-ev-conflict">
          <Scale size={12} className="mt-0.5 shrink-0" aria-hidden />
          {t('offer.contradiction.deposit')} ({formatCAD(deposit!, lang)} vs {formatCAD(schedA!, lang)})
        </p>
      )}
      {flagged.map((x) => (
        <p key={x.id} className="flex items-start gap-1.5 text-[12px] text-ev-conflict">
          <FileWarning size={12} className="mt-0.5 shrink-0" aria-hidden />
          {x.flagNote ?? x.flag}
          {cite(x) && <CitationRef ref={cite(x)!} quote={quoteFor(bundle.offer, x)} documentName={bundle.offer.fileName} />}
        </p>
      ))}
    </div>
  );
}

function GridSkeleton() {
  return (
    <div className="rounded-xl border border-line bg-surface p-4 shadow-card" aria-busy="true">
      <div className="mb-3 flex gap-3">
        <div className="h-16 w-[220px] animate-pulse rounded-lg bg-surface-2" />
        <div className="h-16 flex-1 animate-pulse rounded-lg bg-surface-2" />
        <div className="h-16 flex-1 animate-pulse rounded-lg bg-surface-2" />
      </div>
      {Array.from({ length: 8 }, (_, i) => (
        <div key={i} className="mb-2 h-8 animate-pulse rounded bg-surface-2" style={{ opacity: 1 - i * 0.09 }} />
      ))}
    </div>
  );
}

/* ── Upload / paste panel ──────────────────────────────────────────── */

function UploadPanel({ propertyId, onDone }: { propertyId: number; onDone: () => void }) {
  const { t } = useOps();
  const [buyerLabel, setBuyerLabel] = useState('');
  const [fileName, setFileName] = useState('pasted_offer.txt');
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);

  const upload = trpc.offers.upload.useMutation({
    onSuccess: () => onDone(),
    onError: (e) => setError(e.message),
  });

  const canRun = buyerLabel.trim().length > 0 && fileName.trim().length > 0 && text.trim().length >= 10 && !upload.isPending;

  return (
    <motion.div
      initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
      transition={{ duration: 0.2 }}
      className="mb-4 overflow-hidden"
    >
      <div className="rounded-xl border border-dashed border-line-strong bg-surface p-4 shadow-card">
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <Upload size={15} className="text-accent" aria-hidden />
          <p className="text-[14px] font-semibold text-ink">{t('offer.dropzone.title')}</p>
        </div>
        <p className="mb-1 text-[12px] text-ink-3">{t('offer.dropzone.note')}</p>
        <div className="mb-3 flex flex-wrap gap-1.5">
          <EvidenceChip state="external" label="rules-based parser" animate={false} />
          <EvidenceChip state="verified" label="[p.N §X.Y] citations" animate={false} />
          <span className="text-[11px] text-ink-3">{t('offer.extractionTruth')}</span>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label htmlFor="up-buyer" className="mb-1 block text-[12px] font-medium text-ink-2">{t('offer.paste.buyerLabel')}</label>
            <input id="up-buyer" value={buyerLabel} onChange={(e) => setBuyerLabel(e.target.value)} placeholder={t('offer.paste.buyerPlaceholder')}
              className="h-9 w-full rounded-lg border border-line bg-surface px-2 text-[13px] text-ink focus:outline-none focus:ring-2 focus:ring-accent" />
          </div>
          <div>
            <label htmlFor="up-file" className="mb-1 block text-[12px] font-medium text-ink-2">{t('offer.paste.fileName')}</label>
            <input id="up-file" value={fileName} onChange={(e) => setFileName(e.target.value)}
              className="h-9 w-full rounded-lg border border-line bg-surface px-2 font-mono text-[12.5px] text-ink focus:outline-none focus:ring-2 focus:ring-accent" />
          </div>
        </div>
        <div className="mt-3">
          <label htmlFor="up-text" className="mb-1 block text-[12px] font-medium text-ink-2">{t('offer.paste.textLabel')}</label>
          <textarea
            id="up-text" value={text} onChange={(e) => setText(e.target.value)} rows={8}
            placeholder={t('offer.paste.textPlaceholder')}
            className="w-full rounded-lg border border-line bg-surface-2 px-2.5 py-2 font-mono text-[12px] leading-5 text-ink focus:outline-none focus:ring-2 focus:ring-accent"
          />
          {text.trim().length > 0 && text.trim().length < 10 && (
            <p className="mt-1 text-[11px] text-ev-estimate">{t('offer.paste.minChars')}</p>
          )}
        </div>

        {error && (
          <div className="mt-3 rounded-lg border border-ev-conflict/40 bg-[#C2492B]/5 p-3">
            <p className="text-[13px] font-semibold text-ev-conflict">{t('offer.extractionFailed')}</p>
            <p className="mt-0.5 text-[12px] text-ink-2">{t('offer.extractionFailedBody')}</p>
            <p className="mt-1 font-mono text-[11px] text-ink-3">{error}</p>
          </div>
        )}

        <div className="mt-3 flex justify-end">
          <button
            type="button" disabled={!canRun}
            onClick={() => { setError(null); upload.mutate({ propertyId, buyerLabel: buyerLabel.trim(), fileName: fileName.trim(), documentText: text }); }}
            className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-accent px-3 text-[13px] font-medium text-white hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50"
          >
            {upload.isPending ? t('offer.paste.running') : t('offer.paste.run')}
          </button>
        </div>
      </div>
    </motion.div>
  );
}

/* ── Questions for your licensed agent ─────────────────────────────── */

function QuestionsCard({ bundles }: { bundles: OffersData }) {
  const { t } = useOps();
  const all = bundles.flatMap((b) => b.terms.map((x) => ({ ...x, fileName: b.offer.fileName, documentText: b.offer.documentText })));
  const find = (field: string, flag?: string) => all.find((x) => x.field === field && (flag ? x.flag === flag : true));

  const questions: { key: OpsKey; term?: (typeof all)[number] }[] = [];
  const esc = find('escalationClause');
  if (esc) questions.push({ key: 'offer.q.escalation', term: esc });
  if (find('deposit')) questions.push({ key: 'offer.q.depositTiming', term: find('deposit') });
  const prices = bundles.map((b) => parseMoney(b.terms.find((x) => x.field === 'price')?.value ?? null)).filter((v) => v != null);
  if (prices.length >= 2) questions.push({ key: 'offer.q.tradeoff' });
  const wit = find('signatures', 'missing');
  if (wit) questions.push({ key: 'offer.q.witness', term: wit });
  const depA = all.find((x) => x.field === 'scheduleADeposit');
  if (depA) questions.push({ key: 'offer.q.depositMismatch', term: depA });

  return (
    <div className="rounded-xl border border-accent/40 bg-surface p-3 shadow-card">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h3 className="flex items-center gap-1.5 text-[13px] font-semibold text-ink">
          <MessageCircleQuestion size={14} className="text-accent" aria-hidden />
          {t('offer.questions.title')}
        </h3>
        <EvidenceChip state="generated" animate={false} />
      </div>
      <p className="mb-2 text-[11px] text-ink-3">{t('offer.questions.note')}</p>
      <ul className="space-y-2">
        {questions.map((q) => (
          <li key={q.key} className="rounded-lg border border-line bg-surface-2/60 px-2.5 py-2 text-[12.5px] leading-5 text-ink-2">
            {t(q.key)}
            {q.term && cite(q.term) && (
              <> <CitationRef ref={cite(q.term)!} quote={q.term.flagNote ?? q.term.value ?? ''} documentName={q.term.fileName} /></>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ── Extraction QA ─────────────────────────────────────────────────── */

function QaCard({ bundles, onVerify, verifying }: {
  bundles: OffersData;
  onVerify: (termId: number) => void;
  verifying: boolean;
}) {
  const { t } = useOps();
  const needs = bundles.flatMap((b) =>
    b.terms.filter((x) => !x.verifiedBy && (x.flag != null || (x.confidence ?? 100) < 80))
      .map((x) => ({ term: x, offer: b.offer })),
  );
  const verifiedCount = bundles.flatMap((b) => b.terms).filter((x) => x.verifiedBy).length;

  return (
    <div className="rounded-xl border border-line bg-surface p-3 shadow-card">
      <div className="mb-1 flex items-center justify-between gap-2">
        <h3 className="text-[13px] font-semibold text-ink">{t('offer.qa.title')}</h3>
        <StatusPill label={`${verifiedCount} ${t('offer.qa.verified').toLowerCase()}`} tone="emerald" />
      </div>
      {bundles.map((b) => (
        <div key={b.offer.id} className="mb-2">
          <p className="mb-0.5 text-[11px] font-medium text-ink-3">{b.offer.buyerLabel}</p>
          <ConfidenceBar value={b.offer.extractionConfidence ?? 0} />
        </div>
      ))}
      <p className="mt-2 text-[11px] font-medium uppercase tracking-[0.04em] text-ink-3">{t('offer.qa.needsVerification')}</p>
      {needs.length === 0 ? (
        <p className="mt-1 flex items-center gap-1.5 text-[12px] text-ev-verified">
          <EvidenceChip state="verified" animate={false} /> {t('offer.qa.allClear')}
        </p>
      ) : (
        <ul className="mt-1 space-y-1.5">
          {needs.slice(0, 6).map(({ term, offer }) => (
            <li key={term.id} className="flex items-start justify-between gap-2 rounded-lg border border-line px-2 py-1.5">
              <span className="min-w-0">
                <span className="block truncate text-[12px] font-medium text-ink">{term.field} — {offer.buyerLabel}</span>
                <span className="block truncate text-[11px] text-ink-3">{term.flagNote ?? `${term.confidence}%`}</span>
              </span>
              <label className="flex shrink-0 cursor-pointer items-center gap-1 text-[11px] font-medium text-accent">
                <input
                  type="checkbox" disabled={verifying} onChange={() => onVerify(term.id)}
                  className="h-3.5 w-3.5 accent-[#0E5A50]"
                />
                {t('offer.qa.markVerified')}
              </label>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/* ── Actions (deliberately austere) ────────────────────────────────── */

function ActionsCard({ onRecord }: { onRecord: () => void }) {
  const { t } = useOps();
  return (
    <div className="rounded-xl border border-line bg-surface p-3 shadow-card">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h3 className="flex items-center gap-1.5 text-[13px] font-semibold text-ink">
          <ShieldAlert size={14} className="text-ev-conflict" aria-hidden /> {t('offer.actions.title')}
        </h3>
        <AutonomyBadge level="A4" />
      </div>
      <button
        type="button" onClick={onRecord}
        className="w-full rounded-lg border border-accent/40 bg-accent-tint px-3 py-2 text-left text-[13px] font-medium text-accent hover:bg-accent-tint/70"
      >
        {t('offer.actions.record')}
        <span className="mt-0.5 block text-[11px] font-normal text-ink-2">{t('offer.actions.a4note')}</span>
      </button>
      <div className="mt-2 flex flex-wrap gap-1.5">
        <BlockedAction label={t('offer.blocked.submit')} reason={t('offer.blocked.reason')} />
        <BlockedAction label={t('offer.blocked.accept')} reason={t('offer.blocked.reason')} />
        <BlockedAction label={t('offer.blocked.reject')} reason={t('offer.blocked.reason')} />
        <BlockedAction label={t('offer.blocked.counter')} reason={t('offer.blocked.reason')} />
      </div>
    </div>
  );
}

/* ── Record seller decision (A4 exact-authorization sheet) ─────────── */

function DecisionSheet({ bundles, onClose }: {
  bundles: OffersData;
  onClose: () => void;
}) {
  const { t } = useOps();
  const [decisionType, setDecisionType] = useState<'accept' | 'counter' | 'decline' | 'note'>('note');
  const [offerId, setOfferId] = useState<number>(bundles[0].offer.id);
  const [instruction, setInstruction] = useState('');
  const [countersign, setCountersign] = useState('');
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);

  const record = trpc.offers.recordDecision.useMutation({
    onSuccess: (r) => setResult({ ok: true, message: t('offer.decision.recorded', { hash: r.auditHash }) }),
    onError: (e) => setResult({
      ok: false,
      message: e.data?.code === 'FORBIDDEN' ? t('offer.decision.forbidden') : e.message,
    }),
  });

  const canSubmit = instruction.trim().length >= 3 && countersign.trim().length > 0 && !record.isPending;

  return (
    <motion.div
      className="fixed inset-0 z-50 flex items-start justify-center bg-ink/20 p-4 pt-16"
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      onClick={onClose} role="dialog" aria-modal="true" aria-label={t('offer.decision.title')}
    >
      <motion.div
        className="w-full max-w-[560px] rounded-2xl border border-line bg-surface p-5 shadow-lift"
        initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 12 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-start justify-between gap-2">
          <h3 className="text-[15px] font-semibold text-ink">{t('offer.decision.title')}</h3>
          <button type="button" onClick={onClose} aria-label="Close" className="rounded-md p-1 text-ink-3 hover:bg-surface-2"><X size={15} /></button>
        </div>

        <Banner variant="escalation" className="mb-3">{t('offer.decision.noGuarantee')}</Banner>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label htmlFor="dc-type" className="mb-1 block text-[12px] font-medium text-ink-2">{t('offer.decision.type')}</label>
            <select id="dc-type" value={decisionType} onChange={(e) => setDecisionType(e.target.value as typeof decisionType)}
              className="h-9 w-full rounded-lg border border-line bg-surface px-2 text-[13px] text-ink focus:outline-none focus:ring-2 focus:ring-accent">
              <option value="note">{t('offer.decision.note')}</option>
              <option value="accept">{t('offer.decision.accept')}</option>
              <option value="counter">{t('offer.decision.counter')}</option>
              <option value="decline">{t('offer.decision.decline')}</option>
            </select>
          </div>
          <div>
            <label htmlFor="dc-offer" className="mb-1 block text-[12px] font-medium text-ink-2">{t('offer.decision.offer')}</label>
            <select id="dc-offer" value={offerId} onChange={(e) => setOfferId(Number(e.target.value))}
              className="h-9 w-full rounded-lg border border-line bg-surface px-2 text-[13px] text-ink focus:outline-none focus:ring-2 focus:ring-accent">
              {bundles.map((b, i) => (
                <option key={b.offer.id} value={b.offer.id}>Offer {String.fromCharCode(65 + i)} — {b.offer.buyerLabel}</option>
              ))}
            </select>
          </div>
        </div>
        <div className="mt-3">
          <label htmlFor="dc-instr" className="mb-1 block text-[12px] font-medium text-ink-2">{t('offer.decision.instruction')}</label>
          <textarea id="dc-instr" value={instruction} onChange={(e) => setInstruction(e.target.value)} rows={3}
            placeholder={t('offer.decision.instructionPlaceholder')}
            className="w-full rounded-lg border border-line bg-surface px-2.5 py-2 text-[13px] text-ink focus:outline-none focus:ring-2 focus:ring-accent" />
        </div>
        <div className="mt-3">
          <label htmlFor="dc-cs" className="mb-1 block text-[12px] font-medium text-ink-2">{t('offer.decision.countersign')}</label>
          <input id="dc-cs" type="number" min={1} value={countersign} onChange={(e) => setCountersign(e.target.value)}
            className="h-9 w-40 rounded-lg border border-line bg-surface px-2 font-mono text-[13px] text-ink focus:outline-none focus:ring-2 focus:ring-accent" />
        </div>

        {result && (
          <p className={cn('mt-3 rounded-lg border px-3 py-2 text-[12px]',
            result.ok ? 'border-ev-verified/40 bg-ev-verified/5 text-ev-verified' : 'border-ev-blocked/40 bg-surface-2 text-ink-2')}>
            {result.message}
          </p>
        )}

        <div className="mt-4 flex justify-end">
          <button
            type="button" disabled={!canSubmit}
            onClick={() => record.mutate({ offerId, decisionType, instruction: instruction.trim(), countersignUserId: Number(countersign) })}
            className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-pine px-3 text-[13px] font-medium text-white hover:bg-pine-2 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Lock size={13} aria-hidden /> {t('offer.decision.submit')}
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}
