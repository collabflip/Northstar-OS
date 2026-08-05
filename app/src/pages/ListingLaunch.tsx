import { useState } from 'react';
import { Link, useParams } from 'react-router';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Check, ChevronDown, ChevronRight, Clock, CloudRain, Lock, CalendarDays,
  Mail, Share2, Megaphone, Home, Camera, Download, Sparkles, Route,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { trpc } from '@/providers/trpc';
import { useActionsT } from '@/lib/i18n/actions';
import type { ActionsKey } from '@/lib/i18n/actions';
import { EvidenceChip } from '@/components/evidence/EvidenceChip';
import { AutonomyBadge } from '@/components/evidence/AutonomyBadge';
import { StatusPill } from '@/components/evidence/StatusPill';
import type { StatusTone } from '@/components/evidence/StatusPill';
import { BlockedAction } from '@/components/evidence/BlockedAction';
import { MissingSlot } from '@/components/evidence/MissingSlot';
import { CitationRef } from '@/components/evidence/CitationRef';
import { Banner } from '@/components/evidence/Banner';

/* ── seeded workspace content (per listing-launch.md) ─────────────── */

interface CheckItem { id: string; label: string; assignee?: string; done: boolean; missing?: boolean; generated?: boolean }

const INITIAL_CHECKLIST: { group: ActionsKey; items: CheckItem[] }[] = [
  {
    group: 'll.prep.interior',
    items: [
      { id: 'declutter', label: 'Declutter main floor', assignee: 'Maya', done: true },
      { id: 'deep-clean', label: 'Deep clean — kitchen + baths', assignee: 'Maya', done: true },
      { id: 'staging-walkthrough', label: 'Staging walkthrough with seller', done: true },
      { id: 'bulbs', label: 'Replace burnt-out bulbs, test all fixtures', done: false },
    ],
  },
  {
    group: 'll.prep.exterior',
    items: [
      { id: 'paint', label: 'Touch-up paint, front door', done: true },
      { id: 'garden', label: 'Front garden tidy + mulch', done: true },
      { id: 'eaves', label: 'Clear eaves, straighten downspouts', done: false },
      { id: 'signage', label: 'Order “coming soon” rider', done: true },
    ],
  },
  {
    group: 'll.prep.paperwork',
    items: [
      { id: 'utility', label: 'Utility costs to seller — requested, waiting', done: false, missing: true },
      { id: 'spis', label: 'Seller property information statement — draft ready', done: true, generated: true },
      { id: 'survey', label: 'Confirm survey + permits on file', done: true },
      { id: 'mls-forms', label: 'MLS-mock listing agreement — signed', done: true },
    ],
  },
];

interface Shot { name: string; status: 'captured' | 'scheduled' | 'weather' }

const SHOTS: Shot[] = [
  { name: 'Front elevation', status: 'captured' },
  { name: 'Kitchen island', status: 'captured' },
  { name: 'Living room (wide)', status: 'captured' },
  { name: 'Dining room', status: 'captured' },
  { name: 'Primary bedroom', status: 'captured' },
  { name: 'Bedroom 2', status: 'scheduled' },
  { name: 'Bedroom 3', status: 'scheduled' },
  { name: 'Ensuite bath', status: 'captured' },
  { name: 'Finished basement', status: 'scheduled' },
  { name: 'Backyard / deck', status: 'weather' },
  { name: 'Rear elevation', status: 'weather' },
  { name: 'Twilight exterior', status: 'scheduled' },
];

interface MediaPhoto {
  src: string; label: string; qa: ('exposure' | 'verticals' | 'resolution')[]; flagged?: boolean;
}

const PHOTOS: MediaPhoto[] = [
  { src: '/property-demo-001-exterior.jpg', label: 'Front elevation', qa: ['exposure', 'verticals', 'resolution'] },
  { src: '/property-demo-001-living.jpg', label: 'Living room', qa: ['exposure', 'verticals', 'resolution'] },
  { src: '/property-demo-001-kitchen.jpg', label: 'Kitchen', qa: ['exposure', 'verticals', 'resolution'] },
];

interface Variant { text: string; channel: string; status: 'draft' | 'approved' | 'needs'; budget?: string }

const VARIANTS: { id: string; key: ActionsKey; items: Variant[] }[] = [
  {
    id: 'social', key: 'll.variants.social',
    items: [
      { text: 'Sun-filled Davisville detached — 33 × 122 ft lot, steps to Demo Park. Open house Sat 2–4.', channel: 'Instagram', status: 'needs' },
      { text: 'New in Davisville Village: 4 bd, renovated kitchen, finished basement. $1,245,000.', channel: 'Facebook', status: 'draft' },
      { text: 'Just listed — DEMO-ON-PROPERTY-001. Book a private showing this week.', channel: 'LinkedIn', status: 'draft' },
    ],
  },
  {
    id: 'email', key: 'll.variants.email',
    items: [
      { text: 'Listing announcement — EN/fr — “DEMO-ON-PROPERTY-001 is live”', channel: 'Email', status: 'approved' },
      { text: 'Open-house invite — Sat Jun 14, 2–4 pm — EN/fr', channel: 'Email', status: 'approved' },
    ],
  },
  {
    id: 'ads', key: 'll.variants.ads',
    items: [
      { text: 'Search ad — “Davisville detached for sale”', channel: 'Ads', status: 'needs', budget: '$400' },
      { text: 'Social retargeting — open-house reminder', channel: 'Ads', status: 'draft', budget: '$250' },
    ],
  },
];

interface CalDay { day: number; label: string; items: { icon: LucideIcon; name: string }[] }

const CALENDAR: CalDay[] = [
  { day: 10, label: 'Tue', items: [{ icon: Mail, name: 'Coming-soon email' }] },
  { day: 11, label: 'Wed', items: [{ icon: Camera, name: 'Photo session' }] },
  { day: 12, label: 'Thu', items: [{ icon: Share2, name: 'Social teaser' }] },
  { day: 13, label: 'Fri', items: [{ icon: Megaphone, name: 'MLS-mock live' }, { icon: Mail, name: 'Announcement' }] },
  { day: 14, label: 'Sat', items: [{ icon: Home, name: 'Open house 2–4' }] },
  { day: 15, label: 'Sun', items: [] },
  { day: 16, label: 'Mon', items: [{ icon: Share2, name: 'Social recap' }] },
  { day: 17, label: 'Tue', items: [{ icon: Mail, name: 'Buyer follow-up' }] },
  { day: 18, label: 'Wed', items: [] },
  { day: 19, label: 'Thu', items: [{ icon: Megaphone, name: 'Ad refresh' }] },
  { day: 20, label: 'Fri', items: [{ icon: Mail, name: 'Week-2 digest' }] },
  { day: 21, label: 'Sat', items: [{ icon: Home, name: 'Open house 2–4' }] },
  { day: 22, label: 'Sun', items: [] },
  { day: 23, label: 'Mon', items: [{ icon: Share2, name: 'Offer-date reminder' }] },
];

/* ── page ────────────────────────────────────────────────────────── */

export default function ListingLaunch() {
  const { t } = useActionsT();
  const { id } = useParams<{ id: string }>();
  const propertyId = Number(id) || 0;
  const propertyQ = trpc.properties.byId.useQuery({ id: propertyId }, { enabled: propertyId > 0, retry: false });
  const strategyQ = trpc.strategies.byProperty.useQuery({ propertyId }, { enabled: propertyId > 0, retry: false });

  const [checklist, setChecklist] = useState(INITIAL_CHECKLIST);
  const [copyTab, setCopyTab] = useState<'en' | 'fr'>('en');
  const [openVariant, setOpenVariant] = useState<string | null>('social');
  const [hoverPair, setHoverPair] = useState<'original' | 'staged' | null>(null);
  const [shakeDisclosure, setShakeDisclosure] = useState(0);
  const [selectedDay, setSelectedDay] = useState<number>(13);
  const [rulesOpen, setRulesOpen] = useState(false);

  const totalItems = checklist.reduce((n, g) => n + g.items.length, 0);
  const doneItems = checklist.reduce((n, g) => n + g.items.filter((i) => i.done).length, 0);
  const readiness = Math.round((doneItems / totalItems) * 100);

  const toggleItem = (groupIdx: number, itemId: string) => {
    setChecklist((prev) =>
      prev.map((g, gi) =>
        gi !== groupIdx ? g : { ...g, items: g.items.map((i) => (i.id === itemId ? { ...i, done: !i.done } : i)) },
      ),
    );
  };

  const strategyApproved = strategyQ.data?.status === 'approved';
  const gates: { key: ActionsKey; state: 'done' | 'pending' | 'waiting' | 'locked'; note?: string }[] = [
    { key: 'll.gate.strategy', state: strategyQ.data ? (strategyApproved ? 'done' : 'pending') : 'done' },
    { key: 'll.gate.media', state: 'pending', note: `${readiness}%` },
    { key: 'll.gate.copy', state: 'pending' },
    { key: 'll.gate.disclosures', state: 'done' },
    { key: 'll.gate.campaign', state: 'pending' },
    { key: 'll.gate.routing', state: 'done' },
    { key: 'll.gate.broker', state: 'waiting', note: t('ll.gate.waitingDaniel') },
    { key: 'll.gate.payload', state: 'locked', note: 'sha256:····' },
  ];

  const shotPill = (s: Shot['status']): { label: string; tone: StatusTone } =>
    s === 'captured'
      ? { label: t('ll.shots.captured'), tone: 'emerald' }
      : s === 'scheduled'
        ? { label: t('ll.shots.scheduled'), tone: 'neutral' }
        : { label: t('ll.shots.weatherHold'), tone: 'amber' };

  const variantPill = (s: Variant['status']): { label: string; tone: StatusTone } =>
    s === 'approved'
      ? { label: t('ll.variants.approved'), tone: 'emerald' }
      : s === 'needs'
        ? { label: t('ll.variants.needsApproval'), tone: 'amber' }
        : { label: t('ll.variants.draft'), tone: 'violet' };

  const selectedCal = CALENDAR.find((d) => d.day === selectedDay);

  return (
    <div className="px-6 pb-8 pt-5">
      {/* breadcrumb + header */}
      <nav aria-label="breadcrumb" className="flex items-center gap-1.5 text-[12px] text-ink-3">
        <Link to="/pipeline" className="hover:text-accent">{t('ll.crumb.pipeline')}</Link>
        <ChevronRight size={12} aria-hidden />
        <span>Pelletier</span>
        <ChevronRight size={12} aria-hidden />
        <span>DEMO-ON-PROPERTY-001</span>
        <ChevronRight size={12} aria-hidden />
        <span className="font-medium text-ink-2">{t('ll.crumb.launch')}</span>
      </nav>

      <motion.header
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2 }}
        className="mt-3 flex flex-wrap items-center gap-4"
      >
        <div className="min-w-0">
          <h1 className="text-[22px] font-semibold leading-7 tracking-[-0.01em] text-ink">{t('ll.title')}</h1>
          <div className="mt-1.5 flex flex-wrap items-center gap-2">
            <StatusPill label={t('ll.status.preparing')} tone="accent" />
            <span className="inline-flex h-5 items-center gap-1 rounded-full border border-line bg-surface px-2 text-[11px] font-medium text-ink-2">
              <CalendarDays size={11} aria-hidden />
              {t('ll.target')}
            </span>
            {propertyQ.data?.property?.addressLine1 && (
              <span className="text-[11px] text-ink-3">{String(propertyQ.data.property.addressLine1)}</span>
            )}
          </div>
        </div>
        <div className="ml-auto flex items-center gap-4">
          <div className="flex items-center gap-2.5">
            <ReadinessMeter value={readiness} />
            <div>
              <p className="ns-meta">{t('ll.readiness')}</p>
              <p className="tnum text-[18px] font-semibold leading-6 text-ink">{readiness}%</p>
            </div>
          </div>
          {readiness < 100 ? (
            <BlockedAction label={t('ll.request')} reason={t('ll.blocked.readiness')} />
          ) : (
            <button type="button" className="h-9 rounded-lg bg-accent px-4 text-[13px] font-medium text-white hover:bg-accent-hover">
              {t('ll.request')}
            </button>
          )}
        </div>
      </motion.header>

      {/* board grid */}
      <div className="mt-5 grid gap-4 xl:grid-cols-12">
        {/* ── left column ── */}
        <div className="space-y-4 xl:col-span-7">
          {/* preparation checklist */}
          <motion.section initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.24 }} className="ns-card p-5">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-[14px] font-semibold text-ink">{t('ll.prep.title')}</h2>
              <span className="tnum rounded-full bg-accent-tint px-2 py-0.5 text-[11px] font-medium text-accent">
                {doneItems}/{totalItems} {t('ll.prep.done')}
              </span>
            </div>
            <div className="space-y-4">
              {checklist.map((group, gi) => (
                <div key={group.group}>
                  <p className="ns-meta mb-1.5">{t(group.group)}</p>
                  <ul className="space-y-1">
                    {group.items.map((item) => (
                      <li key={item.id} className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 hover:bg-surface-2">
                        <button
                          type="button"
                          role="checkbox"
                          aria-checked={item.done}
                          onClick={() => toggleItem(gi, item.id)}
                          className={cn(
                            'flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded border transition-colors',
                            item.done ? 'border-accent bg-accent text-white' : 'border-line-strong bg-surface hover:border-accent',
                          )}
                        >
                          {item.done && (
                            <motion.span initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ duration: 0.2 }}>
                              <Check size={12} strokeWidth={3} aria-hidden />
                            </motion.span>
                          )}
                        </button>
                        <span className={cn('min-w-0 flex-1 text-[13px] transition-colors', item.done ? 'text-ink-3 line-through' : 'text-ink')}>
                          {item.label}
                        </span>
                        {item.missing && <MissingSlot fieldLabel="Utility costs" onRequest={() => undefined} />}
                        {item.generated && <EvidenceChip state="generated" animate={false} />}
                        {item.assignee && (
                          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-accent-tint text-[10px] font-semibold text-accent" title={item.assignee}>
                            {item.assignee[0]}
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </motion.section>

          {/* shot list */}
          <motion.section initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.24, delay: 0.045 }} className="ns-card p-5">
            <h2 className="mb-3 text-[14px] font-semibold text-ink">{t('ll.shots.title')}</h2>
            <Banner variant="warning" className="mb-3">
              <CloudRain size={13} className="mr-1 inline" aria-hidden />
              {t('ll.shots.weatherBanner')}
            </Banner>
            <table className="w-full text-left text-[13px]">
              <tbody>
                {SHOTS.map((shot) => {
                  const pill = shotPill(shot.status);
                  return (
                    <tr key={shot.name} className="border-b border-line last:border-0 hover:bg-surface-2">
                      <td className="py-1.5 pr-2 text-ink">{shot.name}</td>
                      <td className="py-1.5 text-right"><StatusPill label={pill.label} tone={pill.tone} /></td>
                    </tr>
                  );
                })}
                <tr>
                  <td className="py-2 pr-2 text-ink-2" colSpan={2}>
                    <span className="flex items-center justify-between gap-2">
                      <EvidenceChip state="external" label={t('ll.shots.photographer')} animate={false} />
                      <Camera size={13} className="text-ink-3" aria-hidden />
                    </span>
                  </td>
                </tr>
              </tbody>
            </table>
          </motion.section>

          {/* media QA */}
          <motion.section initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.24, delay: 0.09 }} className="ns-card p-5">
            <h2 className="mb-3 text-[14px] font-semibold text-ink">{t('ll.media.title')}</h2>
            <div className="grid grid-cols-3 gap-3">
              {PHOTOS.map((photo) => (
                <figure key={photo.src} className="group relative overflow-hidden rounded-lg border border-line">
                  <img
                    src={photo.src}
                    alt={photo.label}
                    className="aspect-[3/2] w-full object-cover transition-transform duration-200 group-hover:scale-[1.04]"
                    loading="lazy"
                  />
                  <figcaption className="absolute inset-x-0 bottom-0 flex flex-wrap items-center gap-1 bg-gradient-to-t from-ink/70 to-transparent p-2 pt-6 opacity-0 transition-opacity duration-140 group-hover:opacity-100">
                    {photo.qa.map((q) => (
                      <EvidenceChip key={q} state="verified" label={t(`ll.media.${q}` as ActionsKey)} animate={false} />
                    ))}
                  </figcaption>
                  <span className="absolute left-2 top-2 rounded bg-surface/90 px-1.5 py-0.5 text-[10.5px] font-medium text-ink">{photo.label}</span>
                </figure>
              ))}
            </div>
            <p className="mt-2 flex items-start gap-1.5 text-[12.5px] text-ev-conflict">
              <EvidenceChip state="conflict" animate={false} />
              {t('ll.media.flagged')}
            </p>

            {/* virtual-staging disclosure pair */}
            <p className="ns-meta mb-2 mt-5">{t('ll.media.stagingPair')}</p>
            <div className="grid grid-cols-2 gap-3">
              <figure
                className={cn('relative overflow-hidden rounded-lg border transition-shadow', hoverPair === 'staged' ? 'border-accent shadow-[0_0_0_2px_var(--accent-tint)]' : 'border-line')}
                onMouseEnter={() => setHoverPair('original')}
                onMouseLeave={() => setHoverPair(null)}
              >
                <img src="/property-demo-001-living.jpg" alt={t('ll.media.original')} className="aspect-[3/2] w-full object-cover" loading="lazy" />
                <span className="absolute left-2 top-2 rounded bg-surface/90 px-1.5 py-0.5 text-[10.5px] font-medium text-ink">{t('ll.media.original')}</span>
              </figure>
              <figure
                className={cn('relative overflow-hidden rounded-lg border transition-shadow', hoverPair === 'original' ? 'border-accent shadow-[0_0_0_2px_var(--accent-tint)]' : 'border-ev-generated/50')}
                onMouseEnter={() => setHoverPair('staged')}
                onMouseLeave={() => setHoverPair(null)}
              >
                <img src="/property-demo-001-staged.jpg" alt={t('ll.media.staged')} className="aspect-[3/2] w-full object-cover" loading="lazy" />
                <span className="absolute left-2 top-2"><EvidenceChip state="generated" label={t('ll.media.staged')} animate={false} /></span>
                <span className="absolute bottom-2 right-2 rounded bg-ink/70 px-1.5 py-0.5 text-[10.5px] font-medium text-white">
                  {t('ll.media.staged')}
                </span>
              </figure>
            </div>
            <motion.button
              type="button"
              key={shakeDisclosure}
              animate={shakeDisclosure ? { x: [0, -2, 2, -2, 2, 0] } : undefined}
              transition={{ duration: 0.3 }}
              onClick={() => setShakeDisclosure((n) => n + 1)}
              title={t('ll.media.disclosureLocked')}
              className="mt-3 flex w-full cursor-not-allowed items-center gap-2 rounded-lg border border-ev-generated/40 bg-[#6E6A86]/5 px-3 py-2 text-left"
            >
              <Lock size={13} className="shrink-0 text-ev-generated" aria-hidden />
              <span className="min-w-0 flex-1 text-[12.5px] text-ink-2">{t('ll.media.disclosure')}</span>
              <code className="shrink-0 font-mono text-[11px] text-ink-3">ON-ADV-007</code>
              <Check size={13} className="shrink-0 text-ev-verified" aria-hidden />
            </motion.button>
          </motion.section>

          {/* listing copy */}
          <motion.section initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.24, delay: 0.135 }} className="ns-card p-5">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <h2 className="text-[14px] font-semibold text-ink">{t('ll.copy.title')}</h2>
              <EvidenceChip state="generated" animate={false} />
              <div className="ml-auto flex items-center gap-1 rounded-lg border border-line bg-surface-2 p-0.5" role="group" aria-label="language">
                {(['en', 'fr'] as const).map((l) => (
                  <button
                    key={l}
                    type="button"
                    onClick={() => setCopyTab(l)}
                    aria-pressed={copyTab === l}
                    className={cn('h-6 rounded-md px-2 text-[11px] font-semibold uppercase', copyTab === l ? 'bg-surface text-ink shadow-card' : 'text-ink-3')}
                  >
                    {l === 'en' ? 'EN' : 'FR'}
                  </button>
                ))}
              </div>
            </div>
            {copyTab === 'en' ? (
              <div className="rounded-lg border border-line bg-surface-2 p-4">
                <p className="font-serif text-[17px] font-semibold leading-6 text-ink" style={{ fontFamily: '"Source Serif 4", Georgia, serif' }}>
                  Sun-filled Davisville detached on a 33 × 122 ft lot
                </p>
                <p className="mt-2 text-[13px] leading-5 text-ink-2">
                  4 bedrooms, 3 bathrooms, 2,380 sqft. Private drive, 2 parking. 2024 taxes $8,940.{' '}
                  <CitationRef ref="dossier §profile" quote="Lot dimensions 33 x 122 ft — municipal record (MPAC-mock)" documentName="Property dossier" documentHref="/properties/1" />{' '}
                  <CitationRef ref="MPAC-mock" quote="2024 property taxes $8,940 — municipal record (MPAC-mock)" documentName="Property dossier" documentHref="/properties/1" />
                </p>
              </div>
            ) : (
              <div className="rounded-lg border border-line bg-surface-2 p-4">
                <p className="text-[17px] font-semibold leading-6 text-ink" style={{ fontFamily: '"Source Serif 4", Georgia, serif' }}>
                  Maison unifamiliale ensoleillée à Davisville sur un terrain de 33 × 122 pi
                </p>
                <p className="mt-2 text-[13px] leading-5 text-ink-2">
                  4 chambres, 3 salles de bain, 2 380 pi². Entrée privée, 2 stationnements. Taxes 2024 : 8 940 $.{' '}
                  <CitationRef ref="dossier §profil" quote="Dimensions du terrain 33 x 122 pi — registre municipal (MPAC-mock)" documentName="Dossier de propriété" documentHref="/properties/1" />
                </p>
              </div>
            )}
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <button type="button" className="h-8 rounded-lg border border-line px-3 text-[12.5px] font-medium text-ink-2 hover:border-line-strong">
                {t('act.edit')}
              </button>
              <Link to="/approvals" className="inline-flex h-8 items-center rounded-lg bg-accent px-3 text-[12.5px] font-medium text-white hover:bg-accent-hover">
                {t('ll.copy.sendForApproval')}
              </Link>
              <span className="text-[11.5px] text-ink-3">{t('ll.copy.routed')}</span>
            </div>
          </motion.section>
        </div>

        {/* ── right column ── */}
        <div className="space-y-4 xl:col-span-5">
          {/* feature sheet */}
          <motion.section initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.24, delay: 0.18 }} className="ns-card p-5">
            <div className="mb-3 flex items-center gap-2">
              <h2 className="text-[14px] font-semibold text-ink">{t('ll.feature.title')}</h2>
              <EvidenceChip state="generated" animate={false} />
            </div>
            <div className="overflow-hidden rounded-lg border border-line">
              <img src="/property-demo-001-exterior.jpg" alt="DEMO-ON-PROPERTY-001" className="aspect-[16/8] w-full object-cover" loading="lazy" />
              <div className="bg-paper p-4">
                <p className="text-[18px] font-semibold leading-6 text-ink" style={{ fontFamily: '"Source Serif 4", Georgia, serif' }}>
                  DEMO-ON-PROPERTY-001
                </p>
                <p className="mt-0.5 text-[12px] text-ink-2">Davisville Village, Toronto</p>
                <p className="mt-2 text-[16px] font-semibold text-ink" style={{ fontFamily: '"Source Serif 4", Georgia, serif' }}>$1,245,000</p>
                <p className="tnum mt-1 text-[11.5px] text-ink-3">{t('ll.feature.specs')}</p>
              </div>
            </div>
            <div className="mt-3 flex gap-2">
              <button type="button" className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-line px-3 text-[12.5px] font-medium text-ink-2 hover:border-line-strong">
                <Download size={13} aria-hidden />
                {t('act.download')}
              </button>
              <button type="button" className="h-8 rounded-lg border border-line px-3 text-[12.5px] font-medium text-ink-2 hover:border-line-strong">
                {t('act.edit')}
              </button>
            </div>
          </motion.section>

          {/* variants accordion */}
          <motion.section initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.24, delay: 0.225 }} className="ns-card p-5">
            <h2 className="mb-3 text-[14px] font-semibold text-ink">{t('ll.variants.title')}</h2>
            <div className="divide-y divide-line rounded-lg border border-line">
              {VARIANTS.map((group) => {
                const open = openVariant === group.id;
                return (
                  <div key={group.id}>
                    <button
                      type="button"
                      onClick={() => setOpenVariant(open ? null : group.id)}
                      aria-expanded={open}
                      className="flex w-full items-center gap-2 px-3 py-2.5 text-left hover:bg-surface-2"
                    >
                      <ChevronDown size={14} className={cn('shrink-0 text-ink-3 transition-transform', !open && '-rotate-90')} aria-hidden />
                      <span className="flex-1 text-[13px] font-semibold text-ink">{t(group.key)}</span>
                      <span className="tnum text-[11px] text-ink-3">{group.items.length}</span>
                    </button>
                    <AnimatePresence initial={false}>
                      {open && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: 'auto', opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{ duration: 0.2 }}
                          className="overflow-hidden"
                        >
                          <ul className="space-y-2 px-3 pb-3">
                            {group.items.map((item) => {
                              const pill = variantPill(item.status);
                              return (
                                <li key={item.text} className="rounded-lg border border-line bg-surface-2 p-2.5">
                                  <p className="text-[12.5px] leading-[18px] text-ink">{item.text}</p>
                                  <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                                    <span className="rounded-md bg-surface px-1.5 py-0.5 text-[10.5px] font-medium text-ink-2">{item.channel}</span>
                                    <StatusPill label={pill.label} tone={pill.tone} />
                                    {item.budget && (
                                      <span className="tnum text-[10.5px] text-ink-3">{t('ll.variants.budgetCap')} {item.budget}</span>
                                    )}
                                    {item.status === 'draft' && <Sparkles size={11} className="text-ev-generated" aria-hidden />}
                                  </div>
                                </li>
                              );
                            })}
                          </ul>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                );
              })}
            </div>
          </motion.section>

          {/* open-house plan */}
          <motion.section initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.24, delay: 0.27 }} className="ns-card p-5">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-[14px] font-semibold text-ink">{t('ll.openHouse.title')}</h2>
              <StatusPill label={t('ll.openHouse.scheduled')} tone="accent" />
            </div>
            <ul className="space-y-2 text-[13px] text-ink-2">
              <li className="flex items-center gap-2"><CalendarDays size={13} className="shrink-0 text-ink-3" aria-hidden />{t('ll.openHouse.when')}</li>
              <li className="flex items-center gap-2"><Home size={13} className="shrink-0 text-ink-3" aria-hidden />{t('ll.openHouse.host')}</li>
              <li className="flex items-start gap-2">
                <Check size={13} className="mt-0.5 shrink-0 text-ev-verified" aria-hidden />
                <span>{t('ll.openHouse.signIn')} <EvidenceChip state="verified" animate={false} className="ml-1" /></span>
              </li>
              <li className="flex items-center gap-2"><Check size={13} className="shrink-0 text-ev-verified" aria-hidden />{t('ll.openHouse.feedback')}</li>
            </ul>
          </motion.section>

          {/* campaign calendar */}
          <motion.section initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.24, delay: 0.315 }} className="ns-card p-5">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-[14px] font-semibold text-ink">{t('ll.calendar.title')}</h2>
              <span className="inline-flex items-center gap-1 rounded-md bg-[#9A6A1B]/10 px-1.5 py-0.5 text-[10.5px] font-medium text-ev-estimate">
                <Clock size={10} aria-hidden />
                {t('ll.calendar.freqCap')}
              </span>
            </div>
            <div className="grid grid-cols-7 gap-1">
              {CALENDAR.map((d, i) => {
                const isToday = d.day === 10;
                const isSel = selectedDay === d.day;
                return (
                  <motion.button
                    key={d.day}
                    type="button"
                    onClick={() => setSelectedDay(d.day)}
                    aria-pressed={isSel}
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ duration: 0.18, delay: i * 0.02 }}
                    className={cn(
                      'flex min-h-[52px] flex-col items-center gap-1 rounded-lg border p-1.5 transition-colors',
                      isSel ? 'border-accent bg-accent-tint' : 'border-line bg-surface hover:border-line-strong',
                      isToday && 'relative',
                    )}
                  >
                    <span className={cn('text-[9.5px] font-medium uppercase', isToday ? 'text-accent' : 'text-ink-3')}>
                      {isToday ? t('ll.calendar.today') : d.label}
                    </span>
                    <span className="tnum text-[12px] font-semibold text-ink">{d.day}</span>
                    <span className="flex gap-0.5">
                      {d.items.slice(0, 3).map((item, ii) => (
                        <item.icon key={ii} size={10} className="text-accent" aria-hidden />
                      ))}
                    </span>
                    {isToday && <span className="absolute right-1 top-1 h-1.5 w-1.5 animate-pulse rounded-full bg-accent" aria-hidden />}
                  </motion.button>
                );
              })}
            </div>
            <AnimatePresence mode="wait">
              {selectedCal && (
                <motion.div
                  key={selectedCal.day}
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                  transition={{ duration: 0.16 }}
                  className="mt-2 rounded-lg border border-line bg-surface-2 p-2.5"
                >
                  <p className="ns-meta mb-1">Jun {selectedCal.day}</p>
                  {selectedCal.items.length === 0 ? (
                    <p className="text-[12px] text-ink-3">—</p>
                  ) : (
                    <ul className="space-y-1">
                      {selectedCal.items.map((item) => (
                        <li key={item.name} className="flex items-center gap-2 text-[12.5px] text-ink">
                          <item.icon size={12} className="text-accent" aria-hidden />
                          {item.name}
                        </li>
                      ))}
                    </ul>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </motion.section>

          {/* inquiry routing rules */}
          <motion.section initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.24, delay: 0.36 }} className="ns-card p-5">
            <div className="mb-3 flex items-center gap-2">
              <Route size={15} className="text-ink-2" aria-hidden />
              <h2 className="flex-1 text-[14px] font-semibold text-ink">{t('ll.routing.title')}</h2>
              <AutonomyBadge level="A2" />
            </div>
            <ul className="space-y-1.5 text-[13px] text-ink-2">
              <li className="rounded-lg bg-surface-2 px-3 py-2">{t('ll.routing.rule1')}</li>
              <li className="rounded-lg bg-surface-2 px-3 py-2">{t('ll.routing.rule2')}</li>
            </ul>
            <button
              type="button"
              onClick={() => setRulesOpen((v) => !v)}
              aria-expanded={rulesOpen}
              className="mt-3 h-8 rounded-lg border border-line px-3 text-[12.5px] font-medium text-ink-2 hover:border-line-strong"
            >
              {t('ll.routing.edit')}
            </button>
            <AnimatePresence>
              {rulesOpen && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  className="overflow-hidden"
                >
                  <div className="mt-2 space-y-2 rounded-lg border border-line bg-surface-2 p-3">
                    <label className="block">
                      <span className="ns-meta">SMS threshold</span>
                      <select className="mt-1 h-8 w-full rounded-lg border border-line bg-surface px-2 text-[12.5px] text-ink">
                        <option>High-intent ≥ 80</option>
                        <option>High-intent ≥ 90</option>
                        <option>All inquiries</option>
                      </select>
                    </label>
                    <label className="flex items-center gap-2 text-[12.5px] text-ink-2">
                      <input type="checkbox" defaultChecked className="h-3.5 w-3.5 accent-[#0E5A50]" />
                      AI draft before human review (A1)
                    </label>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.section>

          {/* restricted-access notice */}
          <motion.section initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.24, delay: 0.405 }} className="rounded-xl border border-line bg-surface-2 p-5">
            <div className="flex items-start gap-3">
              <Lock size={15} className="mt-0.5 shrink-0 text-ink-3" aria-hidden />
              <div>
                <p className="text-[13px] font-semibold text-ink-2">{t('ll.restricted.title')}</p>
                <p className="mt-1 text-[12.5px] leading-[18px] text-ink-3">{t('ll.restricted.body')}</p>
              </div>
            </div>
          </motion.section>
        </div>
      </div>

      {/* launch-readiness gates stepper */}
      <motion.section
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.24, delay: 0.45 }}
        className="mt-5 rounded-xl border border-line bg-surface-2 p-5"
      >
        <h2 className="mb-4 text-[14px] font-semibold text-ink">{t('ll.gates.title')}</h2>
        <ol className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-8">
          {gates.map((gate, i) => {
            const Icon = gate.state === 'done' ? Check : gate.state === 'locked' ? Lock : Clock;
            return (
              <li key={gate.key} className="relative">
                {i > 0 && (
                  <span
                    aria-hidden
                    className={cn('absolute -left-3 top-[13px] hidden h-px w-3 xl:block', gate.state === 'done' ? 'bg-accent' : 'bg-line-strong')}
                  />
                )}
                <div className="flex items-start gap-2">
                  <span
                    className={cn(
                      'flex h-7 w-7 shrink-0 items-center justify-center rounded-full border',
                      gate.state === 'done' && 'border-accent bg-accent text-white',
                      gate.state === 'pending' && 'border-ev-estimate/50 bg-[#9A6A1B]/10 text-ev-estimate',
                      gate.state === 'waiting' && 'border-line-strong bg-surface text-ink-3',
                      gate.state === 'locked' && 'border-line bg-surface text-ink-3',
                    )}
                  >
                    <Icon size={13} aria-hidden />
                  </span>
                  <div className="min-w-0">
                    <p className="text-[12px] font-medium leading-4 text-ink">{t(gate.key)}</p>
                    {gate.note && <p className="mt-0.5 truncate font-mono text-[10.5px] text-ink-3">{gate.note}</p>}
                    {(gate.state === 'pending' || gate.state === 'waiting') && !gate.note && (
                      <p className="mt-0.5 text-[10.5px] text-ink-3">{t('ll.gate.pending')}</p>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ol>
      </motion.section>
    </div>
  );
}

/* ── circular readiness meter ────────────────────────────────────── */

function ReadinessMeter({ value }: { value: number }) {
  const r = 22;
  const c = 2 * Math.PI * r;
  return (
    <svg width="56" height="56" viewBox="0 0 56 56" role="img" aria-label={`${value}%`}>
      <circle cx="28" cy="28" r={r} fill="none" stroke="var(--line, #E7E2D6)" strokeWidth="5" />
      <motion.circle
        cx="28"
        cy="28"
        r={r}
        fill="none"
        stroke="#0E5A50"
        strokeWidth="5"
        strokeLinecap="round"
        strokeDasharray={c}
        initial={{ strokeDashoffset: c }}
        animate={{ strokeDashoffset: c * (1 - value / 100) }}
        transition={{ duration: 0.9, ease: 'easeOut' }}
        transform="rotate(-90 28 28)"
      />
    </svg>
  );
}
