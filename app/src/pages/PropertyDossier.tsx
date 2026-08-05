import { useMemo, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router';
import { AnimatePresence, motion } from 'framer-motion';
import { ChevronRight, RefreshCw, X, CheckSquare, Square } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useNow } from '@/lib/useNow';
import { useT } from '@/lib/i18n';
import { trpc } from '@/providers/trpc';
import { useJourney, formatCad, formatCadCompact, formatDate, relativeAge } from '@/lib/i18n/journey';
import type { JourneyKey } from '@/lib/i18n/journey';
import type { Lang } from '@/lib/i18n';
import { EvidenceChip } from '@/components/evidence/EvidenceChip';
import type { EvidenceState } from '@/components/evidence/EvidenceChip';
import { EvidenceDrawer } from '@/components/evidence/EvidenceDrawer';
import type { EvidenceDetail } from '@/components/evidence/EvidenceDrawer';
import { ConfidenceBar } from '@/components/evidence/ConfidenceBar';
import { FreshnessIndicator, freshnessFromAge } from '@/components/evidence/FreshnessIndicator';
import { StatusPill } from '@/components/evidence/StatusPill';
import { MissingSlot } from '@/components/evidence/MissingSlot';
import { Banner } from '@/components/evidence/Banner';
import { EmptyState } from '@/components/evidence/EmptyState';
import { AgentRunCard } from '@/components/evidence/AgentRunCard';
import { TimelineItem } from '@/components/evidence/TimelineItem';
import { propertyPhoto } from './pipelineMeta';

/* ── Types matching router payloads ─────────────────────────────── */

type EvidenceRow = {
  id: number;
  kind: 'verified' | 'third_party' | 'estimate' | 'generated' | 'assumption';
  statement: string;
  sourceName: string | null;
  sourceRef: string | null;
  pageRef: string | null;
  freshness: Date | null;
  confidence: number | null;
  lineage: unknown;
};

type CompRow = {
  id: number;
  address: string;
  soldPrice: number;
  soldDate: Date;
  beds: number | null;
  baths: number | null;
  sqft: number | null;
  distanceKm: string | null;
  relevanceScore: number | null;
  selected: boolean;
  exclusionReason: string | null;
  selectionReasoning: string | null;
  adjustments: unknown;
};

type DossierRow = {
  id: number;
  propertyId: number | null;
  status: 'draft' | 'ready' | 'stale';
  profile: unknown;
  timeline: unknown;
  marketContext: unknown;
  contradictions: unknown;
  missingInfo: unknown;
  agentQuestions: unknown;
  createdAt: Date;
  updatedAt: Date;
};

type MarketContext = {
  area?: string;
  medianDetached?: number;
  domMedian?: number;
  monthsInventory?: number;
  trend?: string;
  sources?: string[];
};

type Contradiction = { field: string; values: string[] };
type Adjustment = { factor: string; amountCad: number };

const KIND_TO_STATE: Record<EvidenceRow['kind'], EvidenceState> = {
  verified: 'verified', third_party: 'external', estimate: 'estimate',
  generated: 'generated', assumption: 'assumption',
};

const TABS = ['profile', 'market', 'comps', 'valuation', 'evidence', 'timeline'] as const;
type Tab = (typeof TABS)[number];
const TAB_KEY: Record<Tab, JourneyKey> = {
  profile: 'pd.tab.profile', market: 'pd.tab.market', comps: 'pd.tab.comps',
  valuation: 'pd.tab.valuation', evidence: 'pd.tab.evidence', timeline: 'pd.tab.timeline',
};

const fmtKm = (km: string | null, lang: Lang) => {
  if (!km) return '—';
  const n = Number(km);
  if (!Number.isFinite(n)) return km;
  return n < 1 ? `${Math.round(n * 1000)}\u00A0m` : `${n.toLocaleString(lang === 'fr' ? 'fr-CA' : 'en-CA')}\u00A0km`;
};

const adjustmentSum = (adj: unknown): number =>
  Array.isArray(adj) ? (adj as Adjustment[]).reduce((s, a) => s + (a.amountCad ?? 0), 0) : 0;

const signedCad = (v: number, lang: Lang) => `${v >= 0 ? '+' : '−'}${formatCad(Math.abs(v), lang)}`;

/** Deterministic mini sparkline points for the 90-day trend. */
const TREND_POINTS = [42, 45, 44, 47, 50, 49, 53, 56, 55, 58, 61, 63];

/* ── Page ───────────────────────────────────────────────────────── */

export default function PropertyDossier() {
  const { t, lang } = useJourney();
  const { t: ts } = useT();
  const { id } = useParams<{ id: string }>();
  const propertyId = Number(id);
  const [params, setParams] = useSearchParams();
  const tab = (TABS.includes(params.get('tab') as Tab) ? params.get('tab') : 'profile') as Tab;
  const now = useNow();

  const detail = trpc.properties.byId.useQuery({ id: propertyId }, { enabled: Number.isFinite(propertyId) });
  const dossierQ = trpc.dossiers.byProperty.useQuery(
    { propertyId },
    { enabled: Number.isFinite(propertyId), retry: false },
  );
  const utils = trpc.useUtils();

  const [drawer, setDrawer] = useState<EvidenceDetail | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [resolveFor, setResolveFor] = useState<Contradiction | null>(null);
  const [resolveChoice, setResolveChoice] = useState('');
  const [resolveRationale, setResolveRationale] = useState('');
  const [checkedQuestions, setCheckedQuestions] = useState<Set<number>>(new Set());
  const [kindFilter, setKindFilter] = useState<Set<EvidenceRow['kind']>>(new Set());
  const [hoverComp, setHoverComp] = useState<number | null>(null);

  const showToast = (msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast(null), 3600);
  };

  const resolveMut = trpc.dossiers.resolveContradiction.useMutation({
    onSuccess: async () => {
      await utils.dossiers.byProperty.invalidate();
      await utils.properties.byId.invalidate();
      setResolveFor(null);
      setResolveChoice('');
      setResolveRationale('');
      showToast(t('pd.contradictions.resolved'));
    },
  });

  const property = detail.data?.property;
  const owner = detail.data?.owner ?? null;
  const propertyEvidence = (detail.data?.evidence ?? []) as EvidenceRow[];
  const dossier = (dossierQ.data?.dossier ?? detail.data?.dossier ?? null) as DossierRow | null;
  const comps = (dossierQ.data?.comparables ?? []) as CompRow[];
  const valuation = dossierQ.data?.valuation ?? null;
  const dossierEvidence = (dossierQ.data?.evidence ?? []) as EvidenceRow[];

  const allEvidence = useMemo(() => {
    const merged = [...dossierEvidence, ...propertyEvidence];
    if (kindFilter.size === 0) return merged;
    return merged.filter((e) => kindFilter.has(e.kind));
  }, [dossierEvidence, propertyEvidence, kindFilter]);

  const profile = (dossier?.profile ?? {}) as Record<string, unknown>;
  const market = (dossier?.marketContext ?? {}) as MarketContext;
  const contradictions = Array.isArray(dossier?.contradictions) ? (dossier!.contradictions as Contradiction[]) : [];
  const missingInfo = Array.isArray(dossier?.missingInfo) ? (dossier!.missingInfo as string[]) : [];
  const agentQuestions = Array.isArray(dossier?.agentQuestions) ? (dossier!.agentQuestions as string[]) : [];
  const timelineRows = Array.isArray(dossier?.timeline)
    ? (dossier!.timeline as { date: string; event: string; kind?: string }[])
    : [];
  const assumptions = Array.isArray(valuation?.assumptions) ? (valuation!.assumptions as string[]) : [];

  const setTab = (next: Tab) => {
    const p = new URLSearchParams(params);
    p.set('tab', next);
    setParams(p, { replace: true });
  };

  /* ── Loading / error ── */
  if (detail.isLoading || (dossierQ.isLoading && !dossierQ.isError)) {
    return (
      <div className="space-y-4 p-6">
        <div className="h-10 animate-pulse rounded-lg bg-line/50" />
        <div className="ns-card h-44 animate-pulse bg-surface-2/60" />
        <div className="grid grid-cols-12 gap-4">
          <div className="col-span-8 h-80 animate-pulse rounded-xl bg-line/40" />
          <div className="col-span-4 h-80 animate-pulse rounded-xl bg-line/40" />
        </div>
      </div>
    );
  }
  if (detail.isError || !property) {
    return (
      <div className="p-6">
        <div className="ns-card">
          <EmptyState
            title={t('pd.error')}
            description={t('pd.notFound')}
            action={
              <button type="button" onClick={() => detail.refetch()} className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-accent px-3 text-[13px] font-medium text-white hover:bg-accent-hover">
                <RefreshCw size={13} aria-hidden />
                {t('common.retry')}
              </button>
            }
          />
        </div>
      </div>
    );
  }

  const photo = propertyPhoto(property.addressLine1);
  const ownerName = owner ? (owner.preferredName ?? `${owner.firstName} ${owner.lastName}`) : null;
  const address = `${property.addressLine1}, ${property.city}`;
  const freshnessH = (now - new Date(dossier?.updatedAt ?? property.updatedAt).getTime()) / 3_600_000;

  const valuationEvidence: EvidenceDetail | null = valuation
    ? {
        statement: `${formatCad(valuation.low, lang)} – ${formatCad(valuation.high, lang)} · ${t('pd.pointEstimate')} ${formatCad(valuation.mid, lang)}`,
        state: 'estimate',
        sourceName: valuation.modelVersion ?? 'valuation model',
        freshnessLabel: relativeAge(valuation.createdAt, lang),
        freshnessLevel: freshnessFromAge((now - new Date(valuation.createdAt).getTime()) / 3_600_000),
        confidence: valuation.confidenceInterval ?? undefined,
        confidenceBasis: `${comps.filter((c) => c.selected).length} comparables, ${comps.filter((c) => !c.selected).length} excluded — see reasoning`,
        assumptions,
        lineage: [
          { kind: 'agent', label: 'ComparableSelection', ref: 'agt-compsel' },
          { kind: 'tool', label: 'mock-listing-data', ref: 'tool-mld' },
          { kind: 'source', label: 'mock board feed', ref: 'src-board' },
        ],
        policies: [{ id: 'pol-val-01', label: 'Decision support — not an appraisal' }],
      }
    : null;

  return (
    <div className="space-y-4 p-6">
      {/* Breadcrumb */}
      <nav aria-label="breadcrumb" className="flex items-center gap-1 text-[12px] text-ink-3">
        <Link to="/pipeline" className="hover:text-accent hover:underline">{t('pd.breadcrumb.pipeline')}</Link>
        {ownerName && (
          <>
            <ChevronRight size={12} aria-hidden />
            {owner ? <Link to={`/sellers/${owner.id}`} className="hover:text-accent hover:underline">{ownerName}</Link> : <span>{ownerName}</span>}
          </>
        )}
        <ChevronRight size={12} aria-hidden />
        <span className="text-ink-2">{t('pd.breadcrumb.dossier')}</span>
      </nav>

      {/* Permanent decision-support banner */}
      <Banner variant="info">{t('pd.banner')}</Banner>

      {dossier?.status === 'stale' && (
        <Banner
          variant="warning"
          title={t('pd.stale.banner')}
          action={
            <button
              type="button"
              onClick={() => showToast(t('pd.stale.refreshed'))}
              className="inline-flex h-7 items-center gap-1 rounded-lg border border-ev-estimate/40 bg-surface px-2.5 text-[12px] font-medium text-ev-estimate hover:bg-[#9A6A1B]/10"
            >
              <RefreshCw size={12} aria-hidden />
              {t('pd.stale.refresh')}
            </button>
          }
        >
          {null}
        </Banner>
      )}

      {/* Header block */}
      <motion.section
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.5 }}
        className="flex flex-wrap items-start gap-4"
      >
        {photo ? (
          <motion.img
            src={photo}
            alt={address}
            className="h-[140px] w-[210px] rounded-xl border border-line object-cover"
            initial={{ scale: 1.03, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ duration: 0.5 }}
          />
        ) : (
          <div className="flex h-[140px] w-[210px] items-center justify-center rounded-xl border border-dashed border-line-strong bg-surface-2 text-[12px] text-ink-3">
            {ts('misc.notProvided')}
          </div>
        )}
        <div className="min-w-0 flex-1">
          <h1 className="text-[22px] font-semibold leading-7 tracking-[-0.01em] text-ink">{property.addressLine1}</h1>
          <p className="mt-0.5 text-[13px] text-ink-2">
            {market.area ?? property.city}, {property.city} · {property.propertyType ?? '—'}
            {property.externalListingRef ? ` · MLS mock listing ${property.externalListingRef}` : ''}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            {dossier && <StatusPill label={dossier.status === 'ready' ? t('stage.dossier_ready') : dossier.status === 'stale' ? ts('freshness.stale') : t('pd.tab.profile')} tone={dossier.status === 'ready' ? 'accent' : dossier.status === 'stale' ? 'amber' : 'neutral'} />}
            {property.ownershipConfirmed && <EvidenceChip state="verified" label={t('pd.owner')} />}
            {ownerName && owner && (
              <Link to={`/sellers/${owner.id}`} className="text-[12px] font-medium text-accent hover:underline">{ownerName}</Link>
            )}
          </div>
        </div>

        {/* Valuation headline card */}
        {valuation && (
          <div className="rounded-xl border border-line bg-paper px-5 py-4">
            <motion.p
              className="tnum font-serif text-[28px] font-semibold leading-8 text-ink"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8 }}
            >
              {formatCad(valuation.low, lang)} – {formatCad(valuation.high, lang)}
            </motion.p>
            <p className="tnum mt-0.5 text-[13px] text-ink-2">
              {t('pd.pointEstimate')} <span className="font-serif font-semibold text-ink">{formatCad(valuation.mid, lang)}</span>
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <ConfidenceBar
                value={valuation.confidenceInterval ?? 0}
                basis={`${comps.filter((c) => c.selected).length} comparables, ${comps.filter((c) => !c.selected).length} excluded — see reasoning`}
              />
              <EvidenceChip state="estimate" />
            </div>
            <div className="mt-2 flex items-center gap-3">
              <FreshnessIndicator
                label={relativeAge(valuation.createdAt, lang)}
                level={freshnessFromAge((now - new Date(valuation.createdAt).getTime()) / 3_600_000)}
                exact={new Date(valuation.createdAt).toLocaleString(lang === 'fr' ? 'fr-CA' : 'en-CA')}
              />
              <button type="button" onClick={() => valuationEvidence && setDrawer(valuationEvidence)} className="text-[12px] font-medium text-accent hover:underline">
                {t('s3.whyThis')}
              </button>
            </div>
          </div>
        )}
      </motion.section>

      {/* No dossier yet */}
      {!dossier && (
        <div className="ns-card">
          <EmptyState title={t('pd.noDossier')} />
        </div>
      )}

      {dossier && (
        <>
          {/* Tab bar */}
          <div role="tablist" aria-label={t('pd.breadcrumb.dossier')} className="flex flex-wrap gap-1 border-b border-line">
            {TABS.map((tb) => (
              <button
                key={tb}
                role="tab"
                aria-selected={tab === tb}
                onClick={() => setTab(tb)}
                className={cn(
                  'relative px-3 pb-2 pt-1 text-[13px] font-medium',
                  tab === tb ? 'text-accent' : 'text-ink-3 hover:text-ink-2',
                )}
              >
                {t(TAB_KEY[tb])}
                {tab === tb && (
                  <motion.span layoutId="pd-tab-underline" className="absolute inset-x-0 -bottom-px h-0.5 bg-accent" transition={{ type: 'spring', stiffness: 320, damping: 30 }} />
                )}
              </button>
            ))}
          </div>

          <AnimatePresence mode="wait">
            <motion.div
              key={tab}
              initial={{ y: 8, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.16 }}
              role="tabpanel"
            >
              {tab === 'profile' && (
                <ProfileTab
                  t={t} lang={lang}
                  profile={profile}
                  propertyEvidence={propertyEvidence}
                  missingInfo={missingInfo}
                  contradictions={contradictions}
                  dossierEvidenceCount={dossierEvidence.length + propertyEvidence.length}
                  onDrawer={setDrawer}
                  onResolve={(c) => { setResolveFor(c); setResolveChoice(c.values[0] ?? ''); setResolveRationale(''); }}
                  onRequest={() => showToast(t('s3.requestSent'))}
                />
              )}
              {tab === 'market' && (
                <MarketTab t={t} lang={lang} market={market} onDrawer={setDrawer} />
              )}
              {tab === 'comps' && (
                <CompsTab t={t} lang={lang} comps={comps} hoverComp={hoverComp} setHoverComp={setHoverComp} />
              )}
              {tab === 'valuation' && valuation && (
                <ValuationTab t={t} lang={lang} valuation={valuation} comps={comps} assumptions={assumptions} />
              )}
              {tab === 'evidence' && (
                <EvidenceTab
                  t={t} lang={lang}
                  evidence={allEvidence}
                  kindFilter={kindFilter}
                  setKindFilter={setKindFilter}
                  agentQuestions={agentQuestions}
                  checkedQuestions={checkedQuestions}
                  onCheck={(i) => {
                    setCheckedQuestions((prev) => {
                      const next = new Set(prev);
                      if (next.has(i)) next.delete(i);
                      else next.add(i);
                      return next;
                    });
                    showToast(t('pd.questions.created'));
                  }}
                  onDrawer={setDrawer}
                />
              )}
              {tab === 'timeline' && (
                <div className="ns-card max-w-2xl p-4">
                  <h3 className="mb-3 text-[14px] font-semibold text-ink">{t('pd.timeline.title')}</h3>
                  {timelineRows.length === 0 ? (
                    <EmptyState title={t('s3.timeline.empty')} />
                  ) : (
                    <ul>
                      {timelineRows.map((r, i) => (
                        <TimelineItem
                          key={`${r.date}-${r.event}`}
                          title={r.event}
                          actor={{ kind: r.kind === 'assumption' ? 'agent' : 'system', name: r.kind === 'assumption' ? 'SellerDiscovery' : 'mock board feed' }}
                          timestamp={r.date}
                          evidenceState={r.kind === 'assumption' ? 'assumption' : 'external'}
                          isLast={i === timelineRows.length - 1}
                        />
                      ))}
                    </ul>
                  )}
                  <p className="mt-2 border-t border-line pt-2 text-[12px] text-ink-3">
                    <FreshnessIndicator label={relativeAge(dossier.updatedAt, lang)} level={freshnessFromAge(freshnessH)} />
                  </p>
                </div>
              )}
            </motion.div>
          </AnimatePresence>
        </>
      )}

      {/* Resolve contradiction dialog */}
      <AnimatePresence>
        {resolveFor && dossier && (
          <>
            <motion.div className="fixed inset-0 z-40 bg-ink/20" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setResolveFor(null)} aria-hidden />
            <motion.div
              role="dialog"
              aria-modal="true"
              aria-label={t('pd.contradictions.resolve')}
              className="fixed left-1/2 top-1/2 z-50 w-[440px] max-w-[92vw] rounded-2xl border border-line bg-surface p-4 shadow-lift"
              initial={{ opacity: 0, scale: 0.96, x: '-50%', y: '-50%' }}
              animate={{ opacity: 1, scale: 1, x: '-50%', y: '-50%' }}
              exit={{ opacity: 0, scale: 0.96, x: '-50%', y: '-50%' }}
              transition={{ type: 'spring', stiffness: 380, damping: 34 }}
            >
              <div className="mb-3 flex items-start justify-between">
                <h2 className="text-[16px] font-semibold text-ink">{t('pd.contradictions.resolve')} — <code className="font-mono text-[13px]">{resolveFor.field}</code></h2>
                <button type="button" onClick={() => setResolveFor(null)} aria-label={ts('action.close')} className="rounded-md p-1 text-ink-3 hover:bg-surface-2 hover:text-ink">
                  <X size={15} />
                </button>
              </div>
              <p className="ns-meta mb-1.5">{t('pd.contradictions.choose')}</p>
              <div className="space-y-1.5">
                {resolveFor.values.map((v) => (
                  <label key={v} className={cn('flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-[13px]', resolveChoice === v ? 'border-accent bg-accent-tint text-ink' : 'border-line text-ink-2 hover:border-line-strong')}>
                    <input type="radio" name="resolve" checked={resolveChoice === v} onChange={() => setResolveChoice(v)} className="accent-[#0E5A50]" />
                    {v}
                  </label>
                ))}
              </div>
              <label className="mt-3 block">
                <span className="ns-meta mb-1.5 block">{t('pd.contradictions.rationale')}</span>
                <textarea
                  value={resolveRationale}
                  onChange={(e) => setResolveRationale(e.target.value)}
                  rows={3}
                  className="w-full rounded-lg border border-line bg-surface p-2 text-[13px] text-ink focus:border-accent focus:outline-none"
                />
              </label>
              <div className="mt-3 flex justify-end gap-2">
                <button type="button" onClick={() => setResolveFor(null)} className="h-8 rounded-lg border border-line px-3 text-[13px] font-medium text-ink-2 hover:bg-surface-2">
                  {t('pl.gate.cancel')}
                </button>
                <button
                  type="button"
                  disabled={resolveMut.isPending || resolveRationale.trim().length < 3 || !resolveChoice}
                  onClick={() => resolveMut.mutate({ dossierId: dossier.id, field: resolveFor.field, chosenValue: resolveChoice, rationale: resolveRationale.trim() })}
                  className="h-8 rounded-lg bg-accent px-3 text-[13px] font-medium text-white hover:bg-accent-hover disabled:opacity-50"
                >
                  {resolveMut.isPending ? '…' : t('pd.contradictions.submit')}
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      <EvidenceDrawer open={drawer !== null} onClose={() => setDrawer(null)} evidence={drawer} />

      {/* Toast */}
      <div aria-live="polite" className="pointer-events-none fixed bottom-6 left-1/2 z-[60] -translate-x-1/2">
        <AnimatePresence>
          {toast && (
            <motion.p
              initial={{ y: 16, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 16, opacity: 0 }} transition={{ duration: 0.22 }}
              className="rounded-lg border border-line bg-pine px-3.5 py-2 text-[13px] font-medium text-[#FAF8F4] shadow-lift"
            >
              {toast}
            </motion.p>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

/* ── Tab sub-views ──────────────────────────────────────────────── */

function evidenceForField(haystack: string, rows: EvidenceRow[]): EvidenceRow | undefined {
  const h = haystack.toLowerCase();
  return rows.find((r) => r.statement.toLowerCase().includes(h));
}

function ProfileTab({
  t, lang, profile, propertyEvidence, missingInfo, contradictions, dossierEvidenceCount, onDrawer, onResolve, onRequest,
}: {
  t: (k: JourneyKey) => string;
  lang: Lang;
  profile: Record<string, unknown>;
  propertyEvidence: EvidenceRow[];
  missingInfo: string[];
  contradictions: Contradiction[];
  dossierEvidenceCount: number;
  onDrawer: (d: EvidenceDetail) => void;
  onResolve: (c: Contradiction) => void;
  onRequest: () => void;
}) {
  const now = useNow();
  const rows: { key: JourneyKey; field: string; match: string; state: EvidenceState }[] = [
    { key: 'pd.profile.lot', field: 'lot', match: 'lot', state: 'external' },
    { key: 'pd.profile.beds', field: 'beds', match: 'bedroom', state: 'verified' },
    { key: 'pd.profile.baths', field: 'baths', match: 'bathroom', state: 'verified' },
    { key: 'pd.profile.sqft', field: 'sqft', match: 'bedroom', state: 'verified' },
    { key: 'pd.profile.basement', field: 'basement', match: 'basement', state: 'assumption' },
    { key: 'pd.profile.parking', field: 'parking', match: 'parking', state: 'verified' },
    { key: 'pd.profile.taxes', field: 'taxes', match: 'tax', state: 'external' },
    { key: 'pd.profile.yearBuilt', field: 'yearBuilt', match: 'lot', state: 'external' },
  ];

  const openWhy = (row: (typeof rows)[number], value: unknown) => {
    const ev = evidenceForField(row.match, propertyEvidence);
    onDrawer({
      statement: ev?.statement ?? `${t(row.key)}: ${String(value ?? '—')}`,
      state: ev ? KIND_TO_STATE[ev.kind] : row.state,
      sourceName: ev?.sourceName ?? undefined,
      sourceHref: undefined,
      freshnessLabel: ev?.freshness ? relativeAge(ev.freshness, lang) : undefined,
      freshnessLevel: ev?.freshness ? freshnessFromAge((now - new Date(ev.freshness).getTime()) / 3_600_000) : undefined,
      confidence: ev?.confidence ?? undefined,
      lineage: ev?.lineage && typeof ev.lineage === 'object'
        ? Object.entries(ev.lineage as Record<string, string>).map(([k, v]) => ({ kind: k as 'agent' | 'tool' | 'source' | 'policy', label: String(v), ref: String(ev.sourceRef ?? v) }))
        : undefined,
    });
  };

  return (
    <div className="grid grid-cols-12 gap-4">
      {/* Profile grid (8) */}
      <section className="ns-card col-span-12 p-4 xl:col-span-8">
        <h3 className="mb-3 text-[14px] font-semibold text-ink">{t('pd.profile.title')}</h3>
        <dl className="divide-y divide-line/70">
          {rows.filter((r) => profile[r.field] != null).map((r) => (
            <div key={r.field} className="group flex items-center gap-3 py-2">
              <dt className="w-40 shrink-0 text-[13px] text-ink-3">{t(r.key)}</dt>
              <dd className="tnum min-w-0 flex-1 text-[13px] font-medium text-ink">{String(profile[r.field])}</dd>
              <EvidenceChip state={r.state} animate={false} />
              <button
                type="button"
                onClick={() => openWhy(r, profile[r.field])}
                className="text-[12px] font-medium text-accent opacity-0 transition-opacity hover:underline group-hover:opacity-100 focus-visible:opacity-100"
              >
                {t('s3.whyThis')}
              </button>
            </div>
          ))}
        </dl>
      </section>

      {/* Side rail (4) */}
      <div className="col-span-12 space-y-4 xl:col-span-4">
        {/* Missing info */}
        {missingInfo.length > 0 && (
          <section className="ns-card p-4">
            <h3 className="mb-3 text-[14px] font-semibold text-ink">{t('pd.missing.title')}</h3>
            <ul className="space-y-2">
              {missingInfo.map((m) => (
                <li key={m} className="flex flex-wrap items-center gap-2">
                  <MissingSlot fieldLabel={m} onRequest={onRequest} />
                </li>
              ))}
            </ul>
            <button type="button" className="mt-2 text-[12px] font-medium text-accent hover:underline">
              {t('pd.addManually')}
            </button>
          </section>
        )}

        {/* Contradictions */}
        {contradictions.length > 0 && (
          <motion.section
            className="ns-card border-l-4 border-l-ev-conflict p-4"
            initial={{ boxShadow: '0 0 0 3px rgba(194,73,43,0.25)' }}
            animate={{ boxShadow: '0 0 0 0 rgba(194,73,43,0)' }}
            transition={{ duration: 1.2 }}
          >
            <h3 className="mb-3 text-[14px] font-semibold text-ink">{t('pd.contradictions.title')}</h3>
            {contradictions.map((c) => (
              <div key={c.field} className="mb-3 last:mb-0">
                <p className="mb-1.5 flex items-center gap-2 text-[13px] font-medium text-ink">
                  <code className="font-mono text-[12px]">{c.field}</code>
                  <EvidenceChip state="conflict" label={t('pd.contradictions.unresolved')} animate={false} />
                </p>
                <div className="grid grid-cols-2 gap-2">
                  {c.values.map((v) => (
                    <p key={v} className="rounded-lg border border-ev-conflict/25 bg-[#C2492B]/5 p-2 text-[12px] leading-4 text-ink-2">{v}</p>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={() => onResolve(c)}
                  className="mt-2 inline-flex h-7 items-center rounded-lg border border-ev-conflict/40 bg-surface px-2.5 text-[12px] font-medium text-ev-conflict hover:bg-[#C2492B]/10"
                >
                  {t('pd.contradictions.resolve')}
                </button>
              </div>
            ))}
          </motion.section>
        )}

        {/* Agent runs */}
        <section className="space-y-2">
          <h3 className="text-[14px] font-semibold text-ink">{t('pd.agentRuns.title')}</h3>
          <AgentRunCard agentName="Dossier Agent" modelVersion="mock-deterministic-1" promptVersion="dossier@2.1.0" duration="41 s" confidence={87} evidenceCount={dossierEvidenceCount} auditHref="/audit?subjectType=dossier" />
          <AgentRunCard agentName="Market Intelligence" modelVersion="mock-deterministic-1" promptVersion="market@1.3.2" duration="18 s" confidence={82} evidenceCount={3} auditHref="/audit?subjectType=dossier" />
          <AgentRunCard agentName="Comparable Selection" modelVersion="mock-deterministic-1" promptVersion="comps@1.1.4" duration="23 s" confidence={90} evidenceCount={7} auditHref="/audit?subjectType=dossier" />
        </section>
      </div>
    </div>
  );
}

function MarketTab({
  t, lang, market, onDrawer,
}: {
  t: (k: JourneyKey) => string;
  lang: Lang;
  market: MarketContext;
  onDrawer: (d: EvidenceDetail) => void;
}) {
  const stats: { key: JourneyKey; value: string; state: EvidenceState }[] = [
    { key: 'pd.market.median', value: market.medianDetached ? formatCadCompact(market.medianDetached, lang) : '—', state: 'external' },
    { key: 'pd.market.dom', value: market.domMedian != null ? String(market.domMedian) : '—', state: 'estimate' },
    { key: 'pd.market.inventory', value: market.monthsInventory != null ? String(market.monthsInventory) : '—', state: 'estimate' },
    { key: 'pd.market.trend', value: market.trend ?? '—', state: 'estimate' },
  ];
  return (
    <div className="grid grid-cols-12 gap-4">
      <section className="ns-card col-span-12 p-4 xl:col-span-7">
        <h3 className="mb-3 text-[14px] font-semibold text-ink">{t('pd.market.neighbourhood')}{market.area ? ` — ${market.area}` : ''}</h3>
        <img src="/comp-map.png" alt={market.area ?? ''} className="aspect-[16/10] w-full rounded-lg border border-line object-cover" />
        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {stats.map((s) => (
            <div key={s.key} className="rounded-lg bg-surface-2 p-2.5">
              <p className="text-[11px] font-medium uppercase tracking-[0.04em] text-ink-3">{t(s.key)}</p>
              <p className="tnum mt-1 font-serif text-[18px] font-semibold text-ink">{s.value}</p>
              <div className="mt-1"><EvidenceChip state={s.state} animate={false} /></div>
            </div>
          ))}
        </div>
      </section>
      <section className="ns-card col-span-12 p-4 xl:col-span-5">
        <div className="mb-2 flex items-center justify-between gap-2">
          <h3 className="text-[14px] font-semibold text-ink">{t('pd.market.narrative')}</h3>
          <EvidenceChip state="generated" animate={false} />
        </div>
        {/* 90-day trend sparkline */}
        <svg viewBox="0 0 240 64" className="mb-3 h-16 w-full" role="img" aria-label={t('pd.market.trend')}>
          <polyline
            fill="none"
            stroke="#0E5A50"
            strokeWidth="2"
            points={TREND_POINTS.map((v, i) => `${(i / (TREND_POINTS.length - 1)) * 240},${64 - v}`).join(' ')}
          />
        </svg>
        <p className="text-[13px] leading-[19px] text-ink-2">
          {market.area ?? '—'}: {t('pd.market.median').toLowerCase()} {market.medianDetached ? formatCadCompact(market.medianDetached, lang) : '—'} ·{' '}
          {t('pd.market.dom').toLowerCase()} {market.domMedian ?? '—'} · {t('pd.market.inventory').toLowerCase()} {market.monthsInventory ?? '—'}.{' '}
          {market.trend ?? ''}
        </p>
        <p className="mt-1 text-[12px] text-ink-3">{(market.sources ?? []).join(' · ')}</p>
        <button
          type="button"
          onClick={() =>
            onDrawer({
              statement: `${market.area ?? ''} — ${t('pd.market.narrative')}`,
              state: 'generated',
              sourceName: (market.sources ?? [])[0] ?? 'mock board feed',
              confidence: 82,
              confidenceBasis: t('pd.market.trend'),
              lineage: [
                { kind: 'agent', label: 'MarketIntelligence', ref: 'agt-mktint' },
                { kind: 'source', label: 'mock board feed', ref: 'src-board' },
              ],
            })
          }
          className="mt-2 text-[12px] font-medium text-accent hover:underline"
        >
          {t('s3.whyThis')}
        </button>
      </section>
    </div>
  );
}

function CompsTab({
  t, lang, comps, hoverComp, setHoverComp,
}: {
  t: (k: JourneyKey) => string;
  lang: Lang;
  comps: CompRow[];
  hoverComp: number | null;
  setHoverComp: (id: number | null) => void;
}) {
  const selected = comps.filter((c) => c.selected);
  const excluded = comps.filter((c) => !c.selected);
  const pinPositions = [
    { left: '38%', top: '30%' }, { left: '55%', top: '48%' }, { left: '30%', top: '58%' },
    { left: '66%', top: '34%' }, { left: '48%', top: '68%' },
  ];
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-12 gap-4">
        {/* Table */}
        <section className="ns-card col-span-12 overflow-x-auto p-4 xl:col-span-8">
          <h3 className="mb-3 text-[14px] font-semibold text-ink">{t('pd.comps.table')}</h3>
          <table className="w-full min-w-[720px] text-left text-[13px]">
            <thead>
              <tr className="border-b border-line">
                {[t('pd.comps.address'), t('pd.comps.soldPrice'), t('pd.comps.soldDate'), t('pd.comps.distance'), t('pd.comps.bedBa'), t('pd.comps.adjustment'), t('pd.comps.relevance'), ''].map((h, i) => (
                  <th key={i} scope="col" className="px-2 py-2 text-[11px] font-medium uppercase tracking-[0.04em] text-ink-3">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[...selected, ...excluded].map((c, i) => {
                const adj = adjustmentSum(c.adjustments);
                return (
                  <motion.tr
                    key={c.id}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.2, delay: i * 0.03 }}
                    onMouseEnter={() => setHoverComp(c.id)}
                    onMouseLeave={() => setHoverComp(null)}
                    className={cn('border-b border-line/60 last:border-0', c.selected ? 'hover:bg-accent-tint/40' : 'opacity-60', hoverComp === c.id && 'bg-accent-tint/40')}
                  >
                    <td className="px-2 py-2.5 font-medium text-ink">{c.address}</td>
                    <td className="tnum px-2 py-2.5 text-ink">{formatCad(c.soldPrice, lang)}</td>
                    <td className="tnum px-2 py-2.5 text-ink-2">{formatDate(c.soldDate, lang)}</td>
                    <td className="tnum px-2 py-2.5 text-ink-2">{fmtKm(c.distanceKm, lang)}</td>
                    <td className="tnum px-2 py-2.5 text-ink-2">{c.beds ?? '—'}/{c.baths ?? '—'}</td>
                    <td className="tnum px-2 py-2.5 text-ink-2">{c.selected ? signedCad(adj, lang) : '—'}</td>
                    <td className="px-2 py-2.5">
                      {c.relevanceScore != null && <ConfidenceBar value={c.relevanceScore} color="#0E5A50" />}
                    </td>
                    <td className="px-2 py-2.5">
                      {c.selected ? (
                        <EvidenceChip state="external" animate={false} />
                      ) : (
                        <EvidenceChip state="assumption" label={c.exclusionReason ?? t('pd.comps.excluded')} animate={false} />
                      )}
                    </td>
                  </motion.tr>
                );
              })}
            </tbody>
          </table>
        </section>

        {/* Map */}
        <section className="ns-card col-span-12 p-4 xl:col-span-4">
          <h3 className="mb-3 text-[14px] font-semibold text-ink">{t('pd.comps.map')}</h3>
          <div className="relative">
            <img src="/comp-map.png" alt="" className="aspect-[16/10] w-full rounded-lg border border-line object-cover" />
            {selected.slice(0, 5).map((c, i) => (
              <motion.span
                key={c.id}
                className={cn(
                  'absolute flex h-6 w-6 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-2 border-surface text-[11px] font-semibold text-white shadow-card',
                  hoverComp === c.id ? 'bg-accent' : 'bg-accent/80',
                )}
                style={pinPositions[i] ?? { left: `${30 + i * 10}%`, top: '50%' }}
                animate={{ scale: hoverComp === c.id ? 1.2 : 1 }}
                transition={{ duration: 0.16 }}
                aria-label={c.address}
              >
                {i + 1}
              </motion.span>
            ))}
          </div>
        </section>
      </div>

      {/* Selection reasoning */}
      <section className="ns-card border-l-4 border-l-accent p-4">
        <div className="mb-2 flex items-center gap-2">
          <h3 className="text-[14px] font-semibold text-ink">{t('pd.comps.reasoning')}</h3>
          <EvidenceChip state="ai" animate={false} />
        </div>
        <ol className="list-decimal space-y-1 pl-5 text-[13px] leading-[18px] text-ink-2">
          {comps.filter((c) => c.selectionReasoning).map((c) => (
            <li key={c.id}>
              <span className="font-medium text-ink">{c.address}</span> — {c.selectionReasoning}
            </li>
          ))}
        </ol>

        {/* Adjustment rationale */}
        <h4 className="ns-meta mb-2 mt-4">{t('pd.comps.adjustments')}</h4>
        <table className="w-full text-left text-[13px]">
          <thead>
            <tr className="border-b border-line">
              {[t('pd.comps.address'), t('pd.comps.factor'), t('pd.comps.direction'), t('pd.comps.magnitude'), t('pd.comps.basis')].map((h) => (
                <th key={h} scope="col" className="px-2 py-1.5 text-[11px] font-medium uppercase tracking-[0.04em] text-ink-3">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {selected.flatMap((c) =>
              (Array.isArray(c.adjustments) ? (c.adjustments as Adjustment[]) : []).map((a, j) => (
                <tr key={`${c.id}-${j}`} className="border-b border-line/60 last:border-0">
                  <td className="px-2 py-1.5 text-ink-2">{c.address}</td>
                  <td className="px-2 py-1.5 text-ink">{a.factor}</td>
                  <td className="px-2 py-1.5 text-ink-2">{a.amountCad >= 0 ? '↑' : '↓'}</td>
                  <td className="tnum px-2 py-1.5 text-ink">{signedCad(a.amountCad, lang)}</td>
                  <td className="px-2 py-1.5"><EvidenceChip state="estimate" animate={false} /></td>
                </tr>
              )),
            )}
          </tbody>
        </table>
      </section>
    </div>
  );
}

function ValuationTab({
  t, lang, valuation, comps, assumptions,
}: {
  t: (k: JourneyKey) => string;
  lang: Lang;
  valuation: { low: number; mid: number; high: number; confidenceInterval: number | null; rationale: string | null; modelVersion: string | null };
  comps: CompRow[];
  assumptions: string[];
}) {
  const span = valuation.high - valuation.low || 1;
  const midPct = ((valuation.mid - valuation.low) / span) * 100;
  const sensitivity = assumptions.find((a) => a.startsWith('±') || a.startsWith('+-'));
  const selected = comps.filter((c) => c.selected);
  const compMedian = selected.length
    ? [...selected].sort((a, b) => a.soldPrice - b.soldPrice)[Math.floor(selected.length / 2)].soldPrice
    : 0;

  const basis: { label: string; contribution: string; state: EvidenceState }[] = [
    { label: t('pd.basis.compMedian'), contribution: compMedian ? formatCadCompact(compMedian, lang) : '—', state: 'external' },
    { label: t('pd.basis.adjustments'), contribution: signedCad(selected.reduce((s, c) => s + adjustmentSum(c.adjustments), 0), lang), state: 'estimate' },
    { label: t('pd.basis.marketTrend'), contribution: '+2.1%', state: 'estimate' },
    { label: t('pd.basis.conditionPremium'), contribution: '+1.4%', state: 'assumption' },
  ];

  return (
    <div className="space-y-4">
      {/* Range visualization */}
      <section className="ns-card p-5">
        <div className="mb-3 flex items-center justify-between gap-2">
          <h3 className="text-[14px] font-semibold text-ink">{t('pd.valuation.range')}</h3>
          <span className="flex items-center gap-2 text-[12px] text-ink-3">
            {t('pd.valuation.confidence')}
            <ConfidenceBar value={valuation.confidenceInterval ?? 0} />
          </span>
        </div>
        <div className="px-2 pt-6">
          <div className="relative h-2 rounded-full bg-surface-2">
            <motion.div
              className="absolute inset-y-0 left-0 rounded-full bg-ev-estimate/35"
              initial={{ width: 0 }}
              animate={{ width: '100%' }}
              transition={{ duration: 0.7, ease: 'easeOut' }}
            />
            <motion.span
              className="absolute top-1/2 h-4 w-1.5 -translate-y-1/2 rounded-full bg-accent"
              style={{ left: `${midPct}%` }}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.5 }}
              title={`${t('pd.pointEstimate')} ${formatCad(valuation.mid, lang)}`}
            />
            <span
              className="absolute -top-6 h-4 w-px bg-ink-3"
              style={{ left: `${midPct}%` }}
              title={`${t('pd.valuation.listTick')} ${formatCad(valuation.mid, lang)}`}
            />
          </div>
          <div className="mt-1.5 flex justify-between text-[12px]">
            <span className="tnum text-ink-2">{t('pd.valuation.low')} · <strong className="font-serif">{formatCad(valuation.low, lang)}</strong></span>
            <span className="tnum text-accent">{t('pd.pointEstimate')} · <strong className="font-serif">{formatCad(valuation.mid, lang)}</strong></span>
            <span className="tnum text-ink-2">{t('pd.valuation.high')} · <strong className="font-serif">{formatCad(valuation.high, lang)}</strong></span>
          </div>
        </div>
        {valuation.rationale && <p className="mt-3 text-[13px] leading-[19px] text-ink-2">{valuation.rationale}</p>}
        {valuation.modelVersion && <code className="mt-1 block font-mono text-[11px] text-ink-3">{t('pd.modelVersion')} {valuation.modelVersion}</code>}
      </section>

      <div className="grid grid-cols-12 gap-4">
        {/* Basis table */}
        <section className="ns-card col-span-12 p-4 xl:col-span-6">
          <h3 className="mb-3 text-[14px] font-semibold text-ink">{t('pd.valuation.basis')}</h3>
          <table className="w-full text-left text-[13px]">
            <tbody>
              {basis.map((b) => (
                <tr key={b.label} className="border-b border-line/60 last:border-0">
                  <td className="px-2 py-2 text-ink">{b.label}</td>
                  <td className="tnum px-2 py-2 font-medium text-ink">{b.contribution}</td>
                  <td className="px-2 py-2 text-right"><EvidenceChip state={b.state} animate={false} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        {/* Assumptions + sensitivity */}
        <section className="ns-card col-span-12 p-4 xl:col-span-6">
          <h3 className="mb-3 text-[14px] font-semibold text-ink">{t('pd.valuation.assumptions')}</h3>
          <ul className="space-y-1.5">
            {assumptions.filter((a) => a !== sensitivity).map((a) => (
              <li key={a} className="border-l-2 border-dashed border-ev-assumption pl-2 text-[13px] leading-[18px] text-ink-2">
                {a}
              </li>
            ))}
          </ul>
          {sensitivity && (
            <p className="mt-3 rounded-lg border border-ev-estimate/30 bg-[#9A6A1B]/5 p-2.5 text-[13px] text-ink-2">
              <span className="font-medium text-ev-estimate">{t('pd.valuation.sensitivity')}:</span> {sensitivity}
            </p>
          )}
        </section>
      </div>
    </div>
  );
}

function EvidenceTab({
  t, lang, evidence, kindFilter, setKindFilter, agentQuestions, checkedQuestions, onCheck, onDrawer,
}: {
  t: (k: JourneyKey) => string;
  lang: Lang;
  evidence: EvidenceRow[];
  kindFilter: Set<EvidenceRow['kind']>;
  setKindFilter: (s: Set<EvidenceRow['kind']>) => void;
  agentQuestions: string[];
  checkedQuestions: Set<number>;
  onCheck: (i: number) => void;
  onDrawer: (d: EvidenceDetail) => void;
}) {
  const kinds: EvidenceRow['kind'][] = ['verified', 'third_party', 'estimate', 'generated', 'assumption'];
  return (
    <div className="grid grid-cols-12 gap-4">
      {/* Ledger */}
      <section className="ns-card col-span-12 overflow-x-auto p-4 xl:col-span-8">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <h3 className="text-[14px] font-semibold text-ink">{t('pd.evidence.ledger')}</h3>
          <span className="ns-meta">{t('pd.evidence.filter')}:</span>
          {kinds.map((k) => (
            <button
              key={k}
              type="button"
              aria-pressed={kindFilter.has(k)}
              onClick={() => {
                const next = new Set(kindFilter);
                if (next.has(k)) next.delete(k);
                else next.add(k);
                setKindFilter(next);
              }}
              className={cn(
                'inline-flex h-5 items-center rounded-md border px-1.5 text-[11px] font-medium',
                kindFilter.has(k) ? 'border-accent/40 bg-accent-tint text-accent' : 'border-line bg-surface text-ink-2 hover:border-line-strong',
              )}
            >
              {k}
            </button>
          ))}
        </div>
        {evidence.length === 0 ? (
          <EmptyState title={t('sl.empty')} />
        ) : (
          <table className="w-full min-w-[680px] text-left text-[13px]">
            <thead>
              <tr className="border-b border-line">
                {[t('pd.evidence.statement'), t('pd.evidence.type'), t('pd.evidence.source'), t('pd.evidence.retrieved'), t('pd.evidence.confidence'), t('pd.evidence.lineage'), ''].map((h, i) => (
                  <th key={i} scope="col" className="px-2 py-2 text-[11px] font-medium uppercase tracking-[0.04em] text-ink-3">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {evidence.map((e) => (
                <tr key={`${e.kind}-${e.id}`} className="border-b border-line/60 last:border-0 hover:bg-accent-tint/30">
                  <td className="max-w-xs px-2 py-2.5 text-[12.5px] leading-4 text-ink">{e.statement}</td>
                  <td className="px-2 py-2.5"><EvidenceChip state={KIND_TO_STATE[e.kind]} animate={false} /></td>
                  <td className="px-2 py-2.5 text-[12px] text-ink-2">{e.sourceName ?? '—'}</td>
                  <td className="tnum px-2 py-2.5 text-[12px] text-ink-2">{e.freshness ? formatDate(e.freshness, lang) : '—'}</td>
                  <td className="px-2 py-2.5">{e.confidence != null ? <ConfidenceBar value={e.confidence} showLabel /> : '—'}</td>
                  <td className="px-2 py-2.5">
                    <code className="font-mono text-[11px] text-ink-3">
                      {e.lineage && typeof e.lineage === 'object'
                        ? Object.values(e.lineage as Record<string, string>).join(' → ')
                        : '—'}
                    </code>
                  </td>
                  <td className="px-2 py-2.5">
                    <button
                      type="button"
                      onClick={() =>
                        onDrawer({
                          statement: e.statement,
                          state: KIND_TO_STATE[e.kind],
                          sourceName: e.sourceName ?? undefined,
                          freshnessLabel: e.freshness ? relativeAge(e.freshness, lang) : undefined,
                          freshnessLevel: e.freshness ? freshnessFromAge((Date.now() - new Date(e.freshness).getTime()) / 3_600_000) : undefined,
                          confidence: e.confidence ?? undefined,
                          lineage: e.lineage && typeof e.lineage === 'object'
                            ? Object.entries(e.lineage as Record<string, string>).map(([k, v]) => ({ kind: k as 'agent' | 'tool' | 'source' | 'policy', label: String(v), ref: String(e.sourceRef ?? v) }))
                            : undefined,
                        })
                      }
                      className="text-[12px] font-medium text-accent hover:underline"
                    >
                      {t('s3.whyThis')}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {/* Open questions */}
      <section className="ns-card col-span-12 p-4 xl:col-span-4">
        <h3 className="mb-3 text-[14px] font-semibold text-ink">{t('pd.questions.title')}</h3>
        <ul className="space-y-2">
          {agentQuestions.map((qtext, i) => (
            <li key={qtext}>
              <button
                type="button"
                onClick={() => onCheck(i)}
                aria-pressed={checkedQuestions.has(i)}
                className={cn(
                  'flex w-full items-start gap-2 rounded-lg border p-2.5 text-left text-[13px] leading-[18px]',
                  checkedQuestions.has(i) ? 'border-ev-verified/40 bg-[#1E7A4F]/5 text-ink-3 line-through' : 'border-line text-ink hover:border-line-strong',
                )}
              >
                {checkedQuestions.has(i) ? <CheckSquare size={15} className="mt-0.5 shrink-0 text-ev-verified" aria-hidden /> : <Square size={15} className="mt-0.5 shrink-0 text-ink-3" aria-hidden />}
                {qtext}
              </button>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
