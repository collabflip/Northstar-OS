import { useMemo, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router';
import { AnimatePresence, motion } from 'framer-motion';
import {
  ChevronRight, ChevronDown, RefreshCw, CalendarClock, Phone, Mail, Languages,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useNow } from '@/lib/useNow';
import { trpc } from '@/providers/trpc';
import { useJourney, formatCadCompact, formatDate, relativeAge } from '@/lib/i18n/journey';
import type { JourneyKey } from '@/lib/i18n/journey';
import { EvidenceChip } from '@/components/evidence/EvidenceChip';
import type { EvidenceState } from '@/components/evidence/EvidenceChip';
import { EvidenceDrawer } from '@/components/evidence/EvidenceDrawer';
import type { EvidenceDetail } from '@/components/evidence/EvidenceDrawer';
import { ConfidenceBar } from '@/components/evidence/ConfidenceBar';
import { FreshnessIndicator, freshnessFromAge } from '@/components/evidence/FreshnessIndicator';
import { StatusPill } from '@/components/evidence/StatusPill';
import { MissingSlot } from '@/components/evidence/MissingSlot';
import { AutonomyBadge } from '@/components/evidence/AutonomyBadge';
import { BlockedAction } from '@/components/evidence/BlockedAction';
import { Banner } from '@/components/evidence/Banner';
import { TimelineItem } from '@/components/evidence/TimelineItem';
import type { ActorKind } from '@/components/evidence/TimelineItem';
import { EmptyState } from '@/components/evidence/EmptyState';
import { STAGE_KEY, STAGE_TONE, propertyPhoto } from './pipelineMeta';
import type { Stage } from './pipelineMeta';

const TABS = ['overview', 'consent', 'timeline', 'property', 'briefing'] as const;
type Tab = (typeof TABS)[number];
const TAB_KEY: Record<Tab, JourneyKey> = {
  overview: 's3.tab.overview', consent: 's3.tab.consent', timeline: 's3.tab.timeline',
  property: 's3.tab.property', briefing: 's3.tab.briefing',
};

const CHANNELS = ['email', 'sms', 'voice', 'dm'] as const;

function actorKindFor(action: string, actorRole: string | null, modelVersion: string | null): ActorKind {
  if (modelVersion) return 'agent';
  if (!actorRole) return 'system';
  if (actorRole.includes('agent') || action.includes('agent') || action.includes('resolver')) return 'agent';
  return 'human';
}

/** Allocate the score across the four canonical explanation factors. */
function scoreFactors(score: number, t: (k: JourneyKey) => string) {
  const spec: [JourneyKey, number][] = [
    ['s3.scoreFactor.motivation', 30],
    ['s3.scoreFactor.timing', 25],
    ['s3.scoreFactor.engagement', 25],
    ['s3.scoreFactor.fit', 20],
  ];
  return spec.map(([key, max]) => ({
    label: t(key),
    max,
    value: Math.round((score * max) / 100),
  }));
}

export default function Seller360() {
  const { t, lang } = useJourney();
  const { id } = useParams<{ id: string }>();
  const contactId = Number(id);
  const [params, setParams] = useSearchParams();
  const tab = (TABS.includes(params.get('tab') as Tab) ? params.get('tab') : 'overview') as Tab;
  const actorFilter = params.get('actor') ?? 'all';
  const now = useNow();

  const detail = trpc.contacts.byId.useQuery({ id: contactId }, { enabled: Number.isFinite(contactId) });
  const audit = trpc.audit.list.useQuery({ subjectType: 'contact' });

  const contact = detail.data?.contact;
  const consents = detail.data?.consents ?? [];
  const suppressions = detail.data?.suppressions ?? [];
  const properties = detail.data?.properties ?? [];
  const property = properties[0];

  const dossier = trpc.dossiers.byProperty.useQuery(
    { propertyId: property?.id ?? 0 },
    { enabled: Boolean(property?.id), retry: false },
  );
  const valuation = trpc.valuations.byProperty.useQuery(
    { propertyId: property?.id ?? 0 },
    { enabled: Boolean(property?.id) },
  );

  const [drawer, setDrawer] = useState<EvidenceDetail | null>(null);
  const [rationaleOpen, setRationaleOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const showToast = (msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast(null), 3600);
  };

  const events = useMemo(() => {
    const rows = (audit.data ?? []).filter((r) => r.subjectId === String(contactId));
    return rows;
  }, [audit.data, contactId]);

  const filteredEvents = useMemo(() => {
    if (actorFilter === 'all') return events;
    return events.filter((e) => actorKindFor(e.action, e.actorRole, e.modelVersion) === actorFilter);
  }, [events, actorFilter]);

  const setTab = (next: Tab) => {
    const p = new URLSearchParams(params);
    p.set('tab', next);
    setParams(p, { replace: true });
  };

  const hasExpiredConsent = consents.some((c) => c.status === 'expired');
  const score = contact?.leadScore ?? 0;
  const reasons = Array.isArray(contact?.leadScoreReasons) ? (contact!.leadScoreReasons as string[]) : [];
  const missingInfo: string[] = Array.isArray(dossier.data?.dossier.missingInfo)
    ? (dossier.data!.dossier.missingInfo as string[])
    : [];

  /* ── Loading / error ── */
  if (detail.isLoading) {
    return (
      <div className="space-y-4 p-6">
        <div className="h-5 w-48 animate-pulse rounded bg-line/60" />
        <div className="ns-card h-40 animate-pulse bg-surface-2/60" />
        <div className="grid grid-cols-12 gap-4">
          <div className="col-span-7 h-72 animate-pulse rounded-xl bg-line/40" />
          <div className="col-span-5 h-72 animate-pulse rounded-xl bg-line/40" />
        </div>
      </div>
    );
  }
  if (detail.isError || !contact) {
    return (
      <div className="p-6">
        <div className="ns-card">
          <EmptyState
            title={t('s3.error')}
            description={t('s3.notFound')}
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

  const displayName = contact.preferredName ?? `${contact.firstName} ${contact.lastName}`;
  const ageH = (now - new Date(contact.updatedAt ?? contact.createdAt).getTime()) / 3_600_000;
  const photo = propertyPhoto(property ? `${property.addressLine1}, ${property.city}` : null);
  const avatar = displayName.includes('Pelletier') ? '/avatar-pelletier.png' : null;

  const scoreEvidence: EvidenceDetail = {
    statement: `${t('s3.scoreTitle')} ${score}/100 — ${displayName}`,
    state: 'ai',
    sourceName: 'lead-score agent',
    freshnessLabel: relativeAge(contact.updatedAt ?? contact.createdAt, lang),
    freshnessLevel: freshnessFromAge(ageH),
    confidence: score,
    confidenceBasis: reasons.join(' · ') || undefined,
    lineage: [{ kind: 'agent', label: 'SellerDiscovery', ref: 'agt-seldis' }],
    policies: [{ id: 'pol-rec-04', label: 'Recommendations require rationale' }],
  };

  return (
    <div className="space-y-4 p-6">
      {/* Breadcrumb */}
      <nav aria-label="breadcrumb" className="flex items-center gap-1 text-[12px] text-ink-3">
        <Link to="/sellers" className="hover:text-accent hover:underline">{t('s3.breadcrumb')}</Link>
        <ChevronRight size={12} aria-hidden />
        <span className="text-ink-2">{displayName}</span>
      </nav>

      {hasExpiredConsent && (
        <Banner
          variant="warning"
          title={t('s3.consentExpired.banner')}
          action={
            <Link to="/compliance" className="inline-flex h-7 items-center rounded-lg border border-ev-estimate/40 bg-surface px-2.5 text-[12px] font-medium text-ev-estimate hover:bg-[#9A6A1B]/10">
              {t('s3.consentExpired.cta')}
            </Link>
          }
        >
          {null}
        </Banner>
      )}

      {/* Header card */}
      <motion.section
        initial={{ y: 8, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.2 }}
        className="ns-card flex flex-wrap items-start gap-4 p-4"
      >
        {avatar ? (
          <img src={avatar} alt="" className="h-16 w-16 rounded-full border border-line object-cover" />
        ) : (
          <span className="flex h-16 w-16 items-center justify-center rounded-full border border-line bg-surface-2 text-[20px] font-semibold text-ink-2">
            {contact.firstName[0]}{contact.lastName[0]}
          </span>
        )}
        <div className="min-w-0 flex-1">
          <h1 className="text-[22px] font-semibold leading-7 tracking-[-0.01em] text-ink">{displayName}</h1>
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            <span className="inline-flex h-5 items-center gap-1 rounded-md border border-accent/30 bg-accent-tint px-1.5 text-[11px] font-medium text-accent">
              <Languages size={11} aria-hidden />
              {contact.language === 'fr-CA' ? t('s3.langPreferred') : t('s3.langEn')}
            </span>
            {contact.relationshipToProperty && (
              <EvidenceChip state="verified" label={contact.relationshipToProperty} />
            )}
            {contact.leadSource && <EvidenceChip state="external" label={contact.leadSource} />}
            <StatusPill label={t(STAGE_KEY[contact.stage as Stage])} tone={STAGE_TONE[contact.stage as Stage]} />
          </div>
          <div className="mt-2">
            <FreshnessIndicator
              label={relativeAge(contact.updatedAt ?? contact.createdAt, lang)}
              level={freshnessFromAge(ageH)}
              exact={new Date(contact.updatedAt ?? contact.createdAt).toLocaleString(lang === 'fr' ? 'fr-CA' : 'en-CA')}
            />
          </div>
        </div>

        {/* Score + next action */}
        <div className="flex items-stretch gap-4">
          <div className="rounded-xl border border-line bg-paper px-4 py-3 text-center">
            <p className="ns-meta mb-1">{t('s3.scoreTitle')}</p>
            <motion.p
              className="tnum font-serif text-[34px] font-semibold leading-9 text-ink"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.7 }}
            >
              {score}
              <span className="text-[16px] font-normal text-ink-3">{t('s3.score.outOf')}</span>
            </motion.p>
            <div className="mt-1.5 flex items-center justify-center gap-2">
              <ConfidenceBar value={score} color="#0E5A50" showLabel={false} />
              <EvidenceChip state="ai" animate={false} />
            </div>
            <button type="button" onClick={() => setDrawer(scoreEvidence)} className="mt-1.5 text-[12px] font-medium text-accent hover:underline">
              {t('s3.whyScore')}
            </button>
          </div>
          <div className="w-64 rounded-xl border border-accent/30 bg-accent-tint p-3">
            <p className="mb-1 flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-[0.04em] text-accent">
              {t('s3.recommended')}
              <AutonomyBadge level="A2" showLabel={false} />
            </p>
            <p className="text-[13px] font-semibold leading-4 text-ink">{t('s3.bookConsultation')}</p>
            <button
              type="button"
              onClick={() => setRationaleOpen((v) => !v)}
              aria-expanded={rationaleOpen}
              className="mt-1 inline-flex items-center gap-0.5 text-[12px] font-medium text-accent hover:underline"
            >
              {t('s3.rationale')}
              <motion.span animate={{ rotate: rationaleOpen ? 180 : 0 }} transition={{ duration: 0.16 }} className="inline-flex">
                <ChevronDown size={11} aria-hidden />
              </motion.span>
            </button>
            <AnimatePresence initial={false}>
              {rationaleOpen && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ type: 'spring', stiffness: 380, damping: 34 }}
                  className="overflow-hidden"
                >
                  <ul className="mt-1 list-disc space-y-0.5 pl-4 text-[12px] leading-4 text-ink-2">
                    {reasons.slice(0, 4).map((r) => <li key={r}>{r}</li>)}
                  </ul>
                </motion.div>
              )}
            </AnimatePresence>
            <button
              type="button"
              onClick={() => showToast(t('s3.requestSent'))}
              className="mt-2 inline-flex h-8 items-center gap-1.5 rounded-lg bg-accent px-3 text-[13px] font-medium text-white hover:bg-accent-hover"
            >
              <CalendarClock size={13} aria-hidden />
              {t('s3.schedule')}
            </button>
          </div>
        </div>
      </motion.section>

      {/* Tab bar */}
      <div role="tablist" aria-label={displayName} className="flex gap-1 border-b border-line">
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
              <motion.span layoutId="s3-tab-underline" className="absolute inset-x-0 -bottom-px h-0.5 bg-accent" transition={{ type: 'spring', stiffness: 320, damping: 30 }} />
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
          {tab === 'overview' && (
            <OverviewTab
              t={t} lang={lang}
              contact={contact}
              consents={consents}
              reasons={reasons}
              missingInfo={missingInfo}
              events={events.slice(0, 5)}
              onDrawer={setDrawer}
              onRequest={() => showToast(t('s3.requestSent'))}
            />
          )}
          {tab === 'consent' && (
            <ConsentTab t={t} lang={lang} consents={consents} suppressions={suppressions} commPrefs={contact.commPrefs} onDrawer={setDrawer} />
          )}
          {tab === 'timeline' && (
            <div className="ns-card p-4">
              <div className="mb-3 flex gap-1.5" role="group" aria-label={t('s3.filter.all')}>
                {(['all', 'human', 'agent', 'system'] as const).map((f) => (
                  <button
                    key={f}
                    type="button"
                    aria-pressed={actorFilter === f}
                    onClick={() => {
                      const p = new URLSearchParams(params);
                      p.set('actor', f);
                      setParams(p, { replace: true });
                    }}
                    className={cn(
                      'inline-flex h-6 items-center rounded-full border px-2.5 text-[12px] font-medium',
                      actorFilter === f ? 'border-accent/30 bg-accent-tint text-accent' : 'border-line bg-surface text-ink-2 hover:border-line-strong',
                    )}
                  >
                    {t(`s3.filter.${f}` as JourneyKey)}
                  </button>
                ))}
              </div>
              {filteredEvents.length === 0 ? (
                <EmptyState title={t('s3.timeline.empty')} description={t('s3.timeline.starter')} />
              ) : (
                <ul>
                  {filteredEvents.map((e, i) => (
                    <TimelineItem
                      key={e.id}
                      title={e.action}
                      actor={{ kind: actorKindFor(e.action, e.actorRole, e.modelVersion), name: e.actorRole ?? 'system' }}
                      timestamp={formatDate(e.createdAt, lang)}
                      evidenceState="verified"
                      detail={`hash ${e.hash.slice(0, 16)}… · /audit?ref=${e.hash.slice(0, 12)}`}
                      isLast={i === filteredEvents.length - 1}
                    />
                  ))}
                </ul>
              )}
            </div>
          )}
          {tab === 'property' && (
            <div className="ns-card max-w-xl p-4">
              <p className="ns-meta mb-2">{t('s3.property.linked')}</p>
              {property ? (
                <div className="flex items-start gap-3">
                  {photo && <img src={photo} alt="" className="h-20 w-28 rounded-lg border border-line object-cover" />}
                  <div className="min-w-0 flex-1">
                    <p className="text-[14px] font-semibold text-ink">{property.addressLine1}</p>
                    <p className="text-[12px] text-ink-3">{property.city}, {property.province} {property.postalCode}</p>
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                      <StatusPill label={t(STAGE_KEY[contact.stage as Stage])} tone={STAGE_TONE[contact.stage as Stage]} />
                      {valuation.data && (
                        <EvidenceChip
                          state="estimate"
                          label={`${formatCadCompact(valuation.data.low, lang)}–${formatCadCompact(valuation.data.high, lang)}`}
                        />
                      )}
                    </div>
                    <Link to={`/properties/${property.id}`} className="mt-2 inline-block text-[13px] font-medium text-accent hover:underline">
                      {t('s3.openDossier')}
                    </Link>
                  </div>
                </div>
              ) : (
                <EmptyState title={t('common.na')} />
              )}
            </div>
          )}
          {tab === 'briefing' && (
            <BriefingTab t={t} contact={contact} reasons={reasons} onRegenerate={() => showToast(t('s3.briefing.regenerated'))} />
          )}
        </motion.div>
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

/* ── Sub-views ──────────────────────────────────────────────────── */

import type { Contact, ConsentRecord } from '@contracts/types';

/** Structural shape of an audit_log row (schema exports no named alias). */
type AuditLog = {
  id: number;
  action: string;
  subjectId: string;
  actorRole: string | null;
  modelVersion: string | null;
  hash: string;
  createdAt: Date;
};

type Suppression = { id: number; channel: string; reason: string };

function consentChipFor(c: ConsentRecord | undefined, suppressed: boolean, t: (k: JourneyKey) => string): { state: EvidenceState; label: string } {
  if (suppressed) return { state: 'blocked', label: t('consent.suppressed') };
  if (!c) return { state: 'missing', label: t('consent.missing') };
  if (c.status === 'expired') return { state: 'blocked', label: t('consent.expired') };
  if (c.status === 'withdrawn') return { state: 'blocked', label: t('consent.withdrawn') };
  if (c.basis === 'implied') return { state: 'estimate', label: t('consent.implied') };
  return { state: 'verified', label: t('consent.express') };
}

function OverviewTab({
  t, lang, contact, consents, reasons, missingInfo, events, onDrawer, onRequest,
}: {
  t: (k: JourneyKey) => string;
  lang: 'en' | 'fr';
  contact: Contact;
  consents: ConsentRecord[];
  reasons: string[];
  missingInfo: string[];
  events: AuditLog[];
  onDrawer: (d: EvidenceDetail) => void;
  onRequest: () => void;
}) {
  const emailConsent = consents.find((c) => c.channel === 'email');
  const smsConsent = consents.find((c) => c.channel === 'sms');
  const renovations: { item?: string; name?: string; year?: number | string }[] = Array.isArray(contact.renovations)
    ? (contact.renovations as { item?: string; name?: string; year?: number | string }[])
    : [];
  const factors = scoreFactors(contact.leadScore ?? 0, t);

  return (
    <div className="grid grid-cols-12 gap-4">
      {/* Left (7) */}
      <div className="col-span-12 space-y-4 xl:col-span-7">
        {/* Contact card */}
        <section className="ns-card p-4">
          <h3 className="mb-3 text-[14px] font-semibold text-ink">{t('s3.contact')}</h3>
          <dl className="space-y-2.5 text-[13px]">
            <div className="flex flex-wrap items-center gap-2">
              <dt className="flex w-32 shrink-0 items-center gap-1.5 text-ink-3"><Phone size={12} aria-hidden />{t('s3.phone')}</dt>
              <dd className="tnum text-ink">{contact.phone ?? t('s3.noPhone')}</dd>
              {smsConsent && <EvidenceChip state={consentChipFor(smsConsent, false, t).state} label={`sms · ${consentChipFor(smsConsent, false, t).label}`} animate={false} />}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <dt className="flex w-32 shrink-0 items-center gap-1.5 text-ink-3"><Mail size={12} aria-hidden />{t('s3.email')}</dt>
              <dd className="text-ink">{contact.email ?? t('s3.noEmail')}</dd>
              {emailConsent && <EvidenceChip state={consentChipFor(emailConsent, false, t).state} label={`email · ${consentChipFor(emailConsent, false, t).label}`} animate={false} />}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <dt className="w-32 shrink-0 text-ink-3">{t('s3.preferredName')}</dt>
              <dd className="text-ink">{contact.preferredName ?? contact.firstName}</dd>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <dt className="w-32 shrink-0 text-ink-3">{t('sl.col.language')}</dt>
              <dd className="text-ink">{contact.language === 'fr-CA' ? 'fr-CA' : 'EN'}</dd>
            </div>
          </dl>
        </section>

        {/* Motivation & timing */}
        <section className="ns-card p-4">
          <h3 className="mb-3 text-[14px] font-semibold text-ink">{t('s3.motivation')}</h3>
          <dl className="space-y-2.5 text-[13px]">
            <div className="flex flex-wrap items-center gap-2">
              <dt className="w-32 shrink-0 text-ink-3">{t('s3.motivation.label')}</dt>
              <dd className="text-ink">{contact.motivation ?? t('common.na')}</dd>
              {contact.motivation && <EvidenceChip state="verified" animate={false} />}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <dt className="w-32 shrink-0 text-ink-3">{t('s3.timing')}</dt>
              <dd className="text-ink">{contact.timing ?? t('common.na')}</dd>
              {contact.timing && <EvidenceChip state="verified" animate={false} />}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <dt className="w-32 shrink-0 text-ink-3">{t('s3.occupancy')}</dt>
              <dd className="text-ink">{contact.occupancy ?? t('common.na')}</dd>
              {contact.occupancy && <EvidenceChip state="external" animate={false} />}
            </div>
            {renovations.length > 0 && (
              <div className="flex flex-wrap items-center gap-2">
                <dt className="w-32 shrink-0 text-ink-3">{t('s3.renovations')}</dt>
                <dd className="flex flex-wrap items-center gap-1.5">
                  {renovations.map((r, i) => (
                    <EvidenceChip key={i} state="verified" label={`${r.item ?? r.name ?? ''}${r.year ? ` ${r.year}` : ''}`} animate={false} />
                  ))}
                </dd>
              </div>
            )}
            {contact.mortgageContextNote && (
              <div className="rounded-lg border border-dashed border-ev-assumption/50 p-2.5">
                <p className="flex flex-wrap items-center gap-2 text-ink-2">
                  <span className="font-medium text-ink-3">{t('s3.mortgageNote')}</span>
                  <EvidenceChip state="assumption" animate={false} />
                </p>
                <p className="mt-1 text-ink">{contact.mortgageContextNote}</p>
                <p className="mt-1 text-[12px] italic text-ink-3">{t('s3.mortgageDisclaimer')}</p>
              </div>
            )}
          </dl>
        </section>

        {/* Open items */}
        {missingInfo.length > 0 && (
          <section className="ns-card p-4">
            <h3 className="mb-3 text-[14px] font-semibold text-ink">{t('s3.openItems')}</h3>
            <ul className="space-y-2">
              {missingInfo.map((m) => (
                <li key={m}><MissingSlot fieldLabel={m} onRequest={onRequest} /></li>
              ))}
            </ul>
          </section>
        )}
      </div>

      {/* Right (5) */}
      <div className="col-span-12 space-y-4 xl:col-span-5">
        {/* Agent briefing */}
        <section className="ns-card border-l-4 border-l-ev-generated p-4">
          <div className="mb-2 flex items-center justify-between gap-2">
            <h3 className="text-[14px] font-semibold text-ink">{t('s3.briefing')}</h3>
            <EvidenceChip state="generated" animate={false} />
          </div>
          <ul className="list-disc space-y-1.5 pl-4 text-[13px] leading-[18px] text-ink-2">
            <li>{contact.motivation ?? t('common.na')}{contact.timing ? ` — ${contact.timing}` : ''}</li>
            {contact.language === 'fr-CA' && <li>{t('s3.langPreferred')}</li>}
            {reasons.slice(0, 3).map((r) => <li key={r}>{r}</li>)}
          </ul>
          <div className="mt-3 flex items-center justify-between gap-2 border-t border-line pt-2">
            <code className="font-mono text-[11px] text-ink-3">k3-sellerbrief@1.4.2</code>
            <button
              type="button"
              onClick={() =>
                onDrawer({
                  statement: t('s3.briefing'),
                  state: 'generated',
                  sourceName: 'SellerDiscovery agent',
                  confidence: contact.leadScore ?? undefined,
                  confidenceBasis: factors.map((f) => `${f.label} ${f.value}/${f.max}`).join(' · '),
                  lineage: [{ kind: 'agent', label: 'SellerDiscovery', ref: 'agt-seldis' }],
                })
              }
              className="text-[12px] font-medium text-accent hover:underline"
            >
              {t('s3.whyThis')}
            </button>
          </div>
        </section>

        {/* Activity snapshot */}
        <section className="ns-card p-4">
          <h3 className="mb-2 text-[14px] font-semibold text-ink">{t('s3.activitySnapshot')}</h3>
          {events.length === 0 ? (
            <p className="text-[12px] text-ink-3">{t('s3.timeline.empty')}</p>
          ) : (
            <ul>
              {events.map((e, i) => (
                <TimelineItem
                  key={e.id}
                  title={e.action}
                  actor={{ kind: actorKindFor(e.action, e.actorRole, e.modelVersion), name: e.actorRole ?? 'system' }}
                  timestamp={relativeAge(e.createdAt, lang)}
                  isLast={i === events.length - 1}
                />
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}

function ConsentTab({
  t, lang, consents, suppressions, commPrefs, onDrawer,
}: {
  t: (k: JourneyKey) => string;
  lang: 'en' | 'fr';
  consents: ConsentRecord[];
  suppressions: Suppression[];
  commPrefs: unknown;
  onDrawer: (d: EvidenceDetail) => void;
}) {
  const prefs = (commPrefs ?? {}) as Record<string, unknown>;
  const prefNotes = Object.entries(prefs).filter(([, v]) => Boolean(v));

  return (
    <div className="space-y-4">
      {/* Channel consent matrix */}
      <section className="ns-card overflow-x-auto p-4">
        <h3 className="mb-3 text-[14px] font-semibold text-ink">{t('s3.consentMatrix')}</h3>
        <table className="w-full min-w-[720px] text-left text-[13px]">
          <thead>
            <tr className="border-b border-line">
              {[t('s3.channel'), t('s3.status'), t('s3.evidence'), t('s3.caslBasis'), t('s3.expiry'), ''].map((h, i) => (
                <th key={i} scope="col" className="px-2 py-2 text-[11px] font-medium uppercase tracking-[0.04em] text-ink-3">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {CHANNELS.map((ch) => {
              const c = consents.find((x) => x.channel === ch);
              const sup = suppressions.find((s) => s.channel === ch);
              const chip = consentChipFor(c, Boolean(sup), t);
              return (
                <tr key={ch} className="group border-b border-line/60 last:border-0">
                  <td className="px-2 py-2.5 font-medium uppercase text-ink">{ch}</td>
                  <td className="px-2 py-2.5"><EvidenceChip state={chip.state} label={chip.label} animate={false} /></td>
                  <td className="max-w-xs px-2 py-2.5 text-[12px] leading-4 text-ink-2">
                    {sup ? sup.reason : (c?.evidenceText ?? t('common.na'))}
                  </td>
                  <td className="px-2 py-2.5 text-[12px] text-ink-2">{c?.basis ?? t('common.na')}</td>
                  <td className="tnum px-2 py-2.5 text-[12px] text-ink-2">
                    {c?.expiresAt ? `${t('consent.expires')} ${formatDate(c.expiresAt, lang)}` : t('common.na')}
                  </td>
                  <td className="px-2 py-2.5">
                    {c && (
                      <button
                        type="button"
                        onClick={() =>
                          onDrawer({
                            statement: c.evidenceText ?? `${ch} consent`,
                            state: chip.state,
                            sourceName: c.source ?? undefined,
                            freshnessLabel: relativeAge(c.capturedAt, lang),
                            freshnessLevel: freshnessFromAge((Date.now() - new Date(c.capturedAt).getTime()) / 3_600_000),
                            policies: [{ id: 'CASL-03', label: 'Implied consent expiry (inquiry: 6 months)' }],
                          })
                        }
                        className="text-[12px] font-medium text-accent opacity-0 transition-opacity hover:underline group-hover:opacity-100 focus-visible:opacity-100"
                      >
                        {t('s3.viewEvidence')}
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>

      {/* Suppression & preferences */}
      <section className="ns-card p-4">
        <h3 className="mb-3 text-[14px] font-semibold text-ink">{t('s3.suppression')}</h3>
        <div className="flex flex-wrap items-center gap-1.5">
          {suppressions.length === 0 ? (
            <EvidenceChip state="verified" label={t('consent.notSuppressed')} animate={false} />
          ) : (
            suppressions.map((s) => (
              <EvidenceChip key={s.id} state="blocked" label={`${s.channel} · ${t('consent.suppressed')}`} animate={false} />
            ))
          )}
          {prefNotes.map(([k, v]) => (
            <EvidenceChip key={k} state="external" label={String(v)} animate={false} />
          ))}
        </div>
      </section>

      {/* Communication log */}
      <section className="ns-card p-4">
        <h3 className="mb-3 text-[14px] font-semibold text-ink">{t('s3.commLog')}</h3>
        {consents.length === 0 ? (
          <p className="text-[12px] text-ink-3">{t('s3.timeline.empty')}</p>
        ) : (
          <table className="w-full text-left text-[13px]">
            <thead>
              <tr className="border-b border-line">
                {[t('s3.channel'), t('s3.lastContact'), t('s3.template')].map((h) => (
                  <th key={h} scope="col" className="px-2 py-2 text-[11px] font-medium uppercase tracking-[0.04em] text-ink-3">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {consents.map((c) => (
                <tr key={c.id} className="border-b border-line/60 last:border-0">
                  <td className="px-2 py-2 font-medium uppercase text-ink">{c.channel}</td>
                  <td className="tnum px-2 py-2 text-ink-2">{formatDate(c.capturedAt, lang)}</td>
                  <td className="px-2 py-2"><code className="font-mono text-[11px] text-ink-3">{c.source ?? 'n/a'}</code></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}

function BriefingTab({
  t, contact, reasons, onRegenerate,
}: {
  t: (k: JourneyKey) => string;
  contact: Contact;
  reasons: string[];
  onRegenerate: () => void;
}) {
  const sections: { key: JourneyKey; body: string; chips: EvidenceState[] }[] = [
    {
      key: 's3.briefing.situation',
      body: [contact.motivation, contact.timing].filter(Boolean).join(' — ') || '—',
      chips: ['verified'],
    },
    {
      key: 's3.briefing.priorities',
      body: reasons.join(' · ') || '—',
      chips: ['ai'],
    },
    {
      key: 's3.briefing.risks',
      body: contact.mortgageContextNote ?? '—',
      chips: ['assumption'],
    },
    {
      key: 's3.briefing.approach',
      body: contact.language === 'fr-CA' ? 'Communication en français (fr-CA) — gabarits bilingues.' : 'Bilingual templates available; seller prefers English.',
      chips: ['generated'],
    },
  ];
  return (
    <div className="ns-card max-w-3xl p-5">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 className="text-[16px] font-semibold text-ink">{t('s3.briefing')}</h3>
        <EvidenceChip state="generated" />
      </div>
      <div className="space-y-4">
        {sections.map((s) => (
          <section key={s.key}>
            <h4 className="mb-1 flex items-center gap-2 text-[13px] font-semibold text-ink">
              {t(s.key)}
              {s.chips.map((c) => <EvidenceChip key={c} state={c} animate={false} />)}
            </h4>
            <p className="text-[13px] leading-[19px] text-ink-2">{s.body}</p>
          </section>
        ))}
      </div>
      <div className="mt-5 flex items-center justify-between gap-3 border-t border-line pt-3">
        <code className="font-mono text-[11px] text-ink-3">k3-sellerbrief@1.4.2</code>
        <div className="flex items-center gap-2">
          <span className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={onRegenerate}
              className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-line bg-surface px-3 text-[13px] font-medium text-ink-2 hover:bg-surface-2"
            >
              <RefreshCw size={13} aria-hidden />
              {t('s3.briefing.regenerate')}
            </button>
            <AutonomyBadge level="A1" showLabel={false} />
          </span>
          <BlockedAction label={t('s3.briefing.send')} reason={t('s3.briefing.sendBlocked')} />
        </div>
      </div>
    </div>
  );
}
