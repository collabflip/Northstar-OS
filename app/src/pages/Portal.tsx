import { useCallback, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Check, MessageSquare, X, Sparkles, TrendingUp, Clock, Home as HomeIcon,
  Upload, Mail, CalendarDays, Camera, Users,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { trpc } from '@/providers/trpc';
import { TRPCProvider } from '@/providers/trpc';
import type { Lang } from '@/lib/i18n';
import { formatCAD } from '@/lib/i18n';
import { translateGovernance } from '@/lib/i18n/governance';
import type { GovernanceKey, GovernanceVars } from '@/lib/i18n/governance';

/**
 * Seller Portal — renders OUTSIDE the app shell with its own minimal portal
 * chrome (warm maple accent; never the pine app chrome). FR-CA first:
 * Nadia's default, with an EN toggle that re-renders everything instantly.
 * The portal mounts its own TRPCProvider because it lives outside the app
 * shell (the shell provider is wired with route integration).
 */

type TFn = (key: GovernanceKey, vars?: GovernanceVars) => string;

const STEPS: GovernanceKey[] = [
  'por.step.meeting', 'por.step.dossier', 'por.step.strategy',
  'por.step.preparation', 'por.step.launch', 'por.step.offers',
];
const CURRENT_STEP = 2; // strategy — in progress

const reveal = (delay = 0) => ({
  initial: { opacity: 0, y: 24 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, amount: 0.2 },
  transition: { duration: 0.35, delay, ease: 'easeOut' as const },
});

export default function Portal() {
  return (
    <TRPCProvider>
      <PortalInner />
    </TRPCProvider>
  );
}

function PortalInner() {
  const [lang, setLang] = useState<Lang>('fr');
  const t = useCallback<TFn>((key, vars) => translateGovernance(lang, key, vars), [lang]);

  const contacts = trpc.contacts.list.useQuery({ kind: 'seller' }, { retry: 1 });
  const seller = useMemo(
    () => contacts.data?.find((c) => (c.preferredName ?? '').includes('Pelletier') || c.lastName === 'Pelletier') ?? contacts.data?.[0],
    [contacts.data],
  );
  const property = trpc.portal.myProperty.useQuery(
    { contactId: seller?.id ?? 0 },
    { enabled: seller?.id != null, retry: 1 },
  );

  const [composer, setComposer] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const pushToast = useCallback((msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast(null), 5000);
  }, []);

  return (
    <div className="min-h-[100dvh] bg-paper text-ink">
      {/* portal chrome */}
      <header className="relative overflow-hidden border-b border-line">
        <img src="/portal-hero-texture.png" alt="" className="absolute inset-0 h-full w-full object-cover opacity-60" />
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.6 }}
          className="relative mx-auto flex h-16 max-w-4xl items-center justify-between gap-3 px-6">
          <div className="flex items-center gap-2.5">
            <img src="/logo.svg" alt="" className="h-8 w-8" />
            <p className="text-[14px] font-semibold leading-4 text-ink">{t('por.chrome')}</p>
          </div>
          <div className="flex items-center gap-2.5">
            <div className="inline-flex rounded-lg border border-line bg-surface/80 p-0.5" role="group" aria-label="FR | EN">
              {(['fr', 'en'] as Lang[]).map((l) => (
                <button key={l} type="button" aria-pressed={lang === l} onClick={() => setLang(l)}
                  className={cn('h-7 rounded-md px-2 text-[12px] font-semibold uppercase transition-colors',
                    lang === l ? 'bg-accent text-white' : 'text-ink-2 hover:text-ink')}>
                  {l}
                </button>
              ))}
            </div>
            <button type="button" onClick={() => setComposer(true)}
              className="flex h-8 items-center gap-1.5 rounded-lg bg-accent px-3 text-[12px] font-medium text-white hover:bg-accent-hover">
              <MessageSquare size={13} aria-hidden /> {t('por.messageMaya')}
            </button>
            <img src="/avatar-pelletier.png" alt="Nadia & Marc Pelletier" className="h-8 w-8 rounded-full border border-line" />
          </div>
        </motion.div>
      </header>

      <main className="mx-auto w-full max-w-4xl px-6 pb-16">
        {/* § 1 — welcome */}
        <section className="py-12 text-center">
          <h1 className="font-serif text-[34px] font-medium leading-[42px] tracking-[-0.01em] text-ink">
            {t('por.welcome').split(' ').map((w, i) => (
              <motion.span key={`${lang}-${i}`} className="inline-block whitespace-pre"
                initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: 0.1 + i * 0.06, ease: 'easeOut' }}>
                {w}{' '}
              </motion.span>
            ))}
          </h1>
          <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.7, duration: 0.4 }}
            className="mx-auto mt-3 max-w-xl text-[15px] leading-6 text-ink-2">
            <span className="border-b-2 border-accent/60 pb-0.5">{t('por.status')}</span>
          </motion.p>

          {/* progress path */}
          <ol className="mx-auto mt-10 flex max-w-2xl items-start justify-between">
            {STEPS.map((k, i) => {
              const done = i < CURRENT_STEP;
              const current = i === CURRENT_STEP;
              return (
                <motion.li key={k} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.9 + i * 0.15, duration: 0.3 }}
                  className="relative flex flex-1 flex-col items-center gap-2">
                  {i > 0 && <span className={cn('absolute left-[-50%] right-[50%] top-3 h-px', done || current ? 'bg-ev-verified/60' : 'bg-line')} aria-hidden />}
                  <span className={cn('relative flex h-6 w-6 items-center justify-center rounded-full border-2',
                    done ? 'border-ev-verified bg-ev-verified text-white' : current ? 'border-accent bg-accent-tint text-accent' : 'border-line bg-surface text-ink-3')}>
                    {done ? <Check size={13} aria-hidden /> : current ? (
                      <motion.span className="h-2 w-2 rounded-full bg-accent" animate={{ scale: [1, 1.4, 1] }} transition={{ duration: 1.6, repeat: Infinity }} />
                    ) : <span className="h-1.5 w-1.5 rounded-full bg-line-strong" />}
                  </span>
                  <span className={cn('text-[11px] font-medium leading-3', done ? 'text-ev-verified' : current ? 'text-accent' : 'text-ink-3')}>
                    {t(k)}
                  </span>
                </motion.li>
              );
            })}
          </ol>
        </section>

        {(property.isError || contacts.isError) && (
          <motion.section {...reveal()} className="mb-10 rounded-2xl border border-ev-estimate/40 bg-surface p-6 text-center">
            <p className="font-serif text-[20px] text-ink">{t('por.error.title')}</p>
            <p className="mt-1 text-[13px] text-ink-2">{t('por.error.body')}</p>
            <button type="button" onClick={() => { contacts.refetch(); property.refetch(); }}
              className="mt-3 rounded-lg border border-line px-4 py-1.5 text-[13px] font-medium text-accent hover:bg-accent-tint">
              {t('gov.retry')}
            </button>
          </motion.section>
        )}

        {/* § 2 — your property */}
        <motion.section {...reveal()} className="mb-12 grid grid-cols-12 gap-6">
          <div className="col-span-12 overflow-hidden rounded-2xl border border-line shadow-card md:col-span-7">
            <motion.img src="/property-demo-001-exterior.jpg" alt={t('por.property.address')}
              className="h-full max-h-80 w-full object-cover"
              whileHover={{ scale: 1.03 }} transition={{ duration: 0.5 }} />
          </div>
          <div className="col-span-12 flex flex-col justify-center md:col-span-5">
            <p className="ns-meta mb-1">{t('por.property.title')}</p>
            <h2 className="font-serif text-[24px] font-medium leading-8 text-ink">
              {property.data?.property
                ? `${property.data.property.addressLine1} — ${property.data.property.city}`
                : t('por.property.address')}
            </h2>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {t('por.property.specs').split('·').map((s) => (
                <span key={s} className="rounded-full border border-line bg-surface px-2.5 py-1 text-[12px] text-ink-2">{s.trim()}</span>
              ))}
            </div>
            <EstimateCard t={t} lang={lang}
              low={property.data?.valuation?.low ?? 1180000}
              high={property.data?.valuation?.high ?? 1310000}
              confidence={property.data?.valuation?.confidenceInterval ?? 87} />
          </div>
        </motion.section>

        {/* § 3 — market snapshot */}
        <motion.section {...reveal()} className="mb-12">
          <h2 className="mb-4 font-serif text-[22px] font-medium text-ink">{t('por.market.title')}</h2>
          <div className="grid gap-4 sm:grid-cols-3">
            <MarketCard icon={<TrendingUp size={15} className="text-accent" aria-hidden />}
              label={t('por.market.median')} value={formatCAD(1620000, lang)} source={t('por.market.source')}
              spark={[12, 14, 13, 15, 16, 15, 17]} />
            <MarketCard icon={<Clock size={15} className="text-accent" aria-hidden />}
              label={t('por.market.dom')} value={t('por.market.domValue')} source={t('por.market.source')}
              spark={[18, 17, 16, 16, 15, 14, 14]} />
            <MarketCard icon={<HomeIcon size={15} className="text-accent" aria-hidden />}
              label={t('por.market.trend')} value={t('por.market.trendValue')} source={t('por.market.source')}
              spark={[10, 11, 10, 12, 11, 12, 12]} />
          </div>
        </motion.section>

        {/* § 4 — positioning options */}
        <PositioningSection t={t} pushToast={pushToast} />

        {/* § 5 — preparation plan */}
        <PrepSection t={t} pushToast={pushToast} />

        {/* § 6 — timeline & communication */}
        <motion.section {...reveal()} className="mb-12">
          <h2 className="mb-4 font-serif text-[22px] font-medium text-ink">{t('por.timeline.title')}</h2>
          <ol className="mb-3 flex flex-wrap items-center gap-x-2 gap-y-2">
            {(['por.timeline.photo', 'por.timeline.launch', 'por.timeline.openHouse', 'por.timeline.review'] as GovernanceKey[]).map((k, i) => (
              <li key={k} className="flex items-center gap-2">
                {i > 0 && <span className="text-ink-3" aria-hidden>→</span>}
                <span className="rounded-full border border-line bg-surface px-3 py-1.5 text-[12px] font-medium text-ink-2">{t(k)}</span>
              </li>
            ))}
          </ol>
          <p className="mb-6 text-[12px] text-ink-3">{t('por.timeline.disclaimer')}</p>
          <div className="rounded-2xl border border-line bg-surface p-5">
            <p className="flex items-start gap-2.5 text-[14px] leading-6 text-ink">
              <Mail size={16} className="mt-1 shrink-0 text-accent" aria-hidden />
              {t('por.comms.body')}
            </p>
            <p className="mt-2 flex items-start gap-2.5 text-[12px] text-ink-3">
              <Check size={14} className="mt-0.5 shrink-0 text-ev-verified" aria-hidden />
              {t('por.comms.consent')}
            </p>
          </div>
        </motion.section>

        {/* § 7 — team & footer */}
        <motion.section {...reveal()} className="mb-10">
          <h2 className="mb-4 flex items-center gap-2 font-serif text-[22px] font-medium text-ink">
            <Users size={18} className="text-accent" aria-hidden /> {t('por.team.title')}
          </h2>
          <div className="grid gap-4 sm:grid-cols-3">
            {([
              ['/avatar-maya.png', 'Maya Chen', 'por.team.maya'],
              ['/avatar-sofia.png', 'Sofia Tremblay', 'por.team.sofia'],
              ['/avatar-daniel.png', 'Daniel Okafor', 'por.team.daniel'],
            ] as [string, string, GovernanceKey][]).map(([img, name, role]) => (
              <div key={name} className="rounded-2xl border border-line bg-surface p-4 text-center">
                <img src={img} alt={name} className="mx-auto h-14 w-14 rounded-full border border-line" />
                <p className="mt-2 text-[14px] font-semibold text-ink">{name}</p>
                <p className="text-[12px] text-ink-2">{t(role)}</p>
                <button type="button" onClick={() => setComposer(true)}
                  className="mt-3 w-full rounded-lg border border-line px-3 py-1.5 text-[12px] font-medium text-accent hover:bg-accent-tint">
                  {t('por.team.message')}
                </button>
              </div>
            ))}
          </div>
        </motion.section>

        <footer className="border-t border-line pt-6 text-center">
          <p className="text-[12px] text-ink-3">{t('por.footer.brokerage')} · {t('por.footer.privacy')}</p>
          <p className="mx-auto mt-2 flex max-w-lg items-start justify-center gap-2 text-[12px] leading-5 text-ink-2">
            <Sparkles size={13} className="mt-0.5 shrink-0 text-accent" aria-hidden />
            {t('por.footer.ai')}
          </p>
        </footer>
      </main>

      {/* message composer */}
      <Composer open={composer} onClose={() => setComposer(false)} t={t} pushToast={pushToast} />

      {/* toast */}
      <AnimatePresence>
        {toast && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            className="fixed bottom-6 left-1/2 z-50 flex -translate-x-1/2 items-center gap-2 rounded-full border border-line bg-surface px-4 py-2 text-[13px] font-medium text-ink shadow-lift" role="status">
            <Check size={14} className="text-ev-verified" aria-hidden /> {toast}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ── estimate card + friendly evidence drawer ────────────────────── */

function EstimateCard({ t, lang, low, high, confidence }: {
  t: TFn; lang: Lang; low: number; high: number; confidence: number;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="mt-4 rounded-2xl border border-line bg-surface p-4">
      <p className="ns-meta">{t('por.estimate.title')}</p>
      <p className="mt-1 font-serif text-[24px] font-medium leading-8 text-ink">
        {formatCAD(low, lang)} – {formatCAD(high, lang)}
      </p>
      <p className="mt-1.5 text-[12px] leading-5 text-ink-2">{t('por.estimate.explain')}</p>
      <button type="button" onClick={() => setOpen(true)}
        className="mt-2 text-[12px] font-medium text-accent hover:underline">
        {t('por.estimate.why')}
      </button>

      <AnimatePresence>
        {open && (
          <>
            <motion.div className="fixed inset-0 z-40 bg-ink/20" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setOpen(false)} />
            <motion.aside role="dialog" aria-modal="true" aria-label={t('por.estimate.drawer.title')}
              className="fixed right-0 top-0 z-50 flex h-full w-full max-w-[400px] flex-col border-l border-line bg-surface shadow-lift"
              initial={{ x: 400 }} animate={{ x: 0 }} exit={{ x: 400 }}
              transition={{ type: 'spring', stiffness: 300, damping: 32 }}>
              <div className="flex items-center justify-between border-b border-line px-4 py-3">
                <p className="font-serif text-[17px] font-medium text-ink">{t('por.estimate.drawer.title')}</p>
                <button type="button" onClick={() => setOpen(false)} aria-label={t('gov.close')}
                  className="rounded-lg p-1.5 text-ink-3 hover:bg-surface-2 hover:text-ink"><X size={16} /></button>
              </div>
              <div className="flex-1 space-y-4 overflow-y-auto p-4">
                <section>
                  <h3 className="ns-meta mb-1.5">{t('por.estimate.drawer.source')}</h3>
                  <ul className="space-y-1.5 text-[13px] leading-5 text-ink">
                    {(['por.estimate.drawer.line1', 'por.estimate.drawer.line2', 'por.estimate.drawer.line3'] as GovernanceKey[]).map((k, i) => (
                      <motion.li key={k} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.08 }}
                        className="flex items-start gap-2">
                        <Check size={13} className="mt-1 shrink-0 text-ev-verified" aria-hidden /> {t(k)}
                      </motion.li>
                    ))}
                  </ul>
                </section>
                <section>
                  <h3 className="ns-meta mb-1.5">{t('por.estimate.drawer.freshness')}</h3>
                  <p className="text-[13px] text-ink-2">{t('por.market.source')}</p>
                </section>
                <section className="rounded-xl border border-ev-verified/40 bg-ev-verified/5 p-3">
                  <p className="text-[13px] font-medium text-ev-verified">{t('por.estimate.drawer.confidence', { pct: Math.round(confidence) })}</p>
                </section>
              </div>
            </motion.aside>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ── market card with sparkline ──────────────────────────────────── */

function MarketCard({ icon, label, value, source, spark }: {
  icon: React.ReactNode; label: string; value: string; source: string; spark: number[];
}) {
  const max = Math.max(...spark);
  const min = Math.min(...spark);
  const pts = spark.map((v, i) => `${(i / (spark.length - 1)) * 96},${28 - ((v - min) / Math.max(1, max - min)) * 24}`).join(' ');
  return (
    <div className="rounded-2xl border border-line bg-surface p-4">
      <p className="flex items-center gap-1.5 text-[12px] text-ink-2">{icon}{label}</p>
      <p className="mt-1 font-serif text-[22px] font-medium text-ink">{value}</p>
      <svg viewBox="0 0 96 28" className="mt-2 h-7 w-full" aria-hidden>
        <motion.polyline points={pts} fill="none" stroke="#0E5A50" strokeWidth="1.5" strokeLinecap="round"
          initial={{ pathLength: 0 }} whileInView={{ pathLength: 1 }} viewport={{ once: true }} transition={{ duration: 0.6 }} />
      </svg>
      <p className="mt-1 text-[11px] text-ink-3">{source}</p>
    </div>
  );
}

/* ── positioning options ─────────────────────────────────────────── */

type Position = 'aggressive' | 'market' | 'premium';

function PositioningSection({ t, pushToast }: { t: TFn; pushToast: (m: string) => void }) {
  const [choice, setChoice] = useState<Position>('market');
  const options: { id: Position; title: GovernanceKey; desc: GovernanceKey; trade: GovernanceKey }[] = [
    { id: 'aggressive', title: 'por.position.aggressive', desc: 'por.position.aggressiveDesc', trade: 'por.position.aggressiveTrade' },
    { id: 'market', title: 'por.position.market', desc: 'por.position.marketDesc', trade: 'por.position.marketTrade' },
    { id: 'premium', title: 'por.position.premium', desc: 'por.position.premiumDesc', trade: 'por.position.premiumTrade' },
  ];
  return (
    <motion.section {...reveal()} className="mb-12">
      <h2 className="mb-1.5 font-serif text-[22px] font-medium text-ink">{t('por.position.title')}</h2>
      <p className="mb-4 text-[13px] text-ink-2">{t('por.position.note')}</p>
      <div className="grid gap-4 sm:grid-cols-3" role="radiogroup" aria-label={t('por.position.title')}>
        {options.map((o) => {
          const active = choice === o.id;
          return (
            <motion.button key={o.id} type="button" role="radio" aria-checked={active}
              onClick={() => { setChoice(o.id); pushToast(t('por.position.saved')); }}
              whileHover={{ y: -2 }}
              className={cn('relative rounded-2xl border bg-surface p-4 text-left transition-colors',
                active ? 'border-accent ring-2 ring-accent/40' : 'border-line hover:border-line-strong')}>
              {o.id === 'market' && (
                <span className="absolute -top-2.5 left-3 rounded-full bg-accent px-2 py-0.5 text-[10.5px] font-semibold text-white">
                  {t('por.position.recommended')}
                </span>
              )}
              <span className="flex items-center justify-between">
                <span className="text-[14px] font-semibold text-ink">{t(o.title)}</span>
                <span className={cn('flex h-[18px] w-[18px] items-center justify-center rounded-full border-2',
                  active ? 'border-accent bg-accent text-white' : 'border-line-strong text-transparent')}>
                  <Check size={11} aria-hidden />
                </span>
              </span>
              <span className="mt-1.5 block text-[12.5px] leading-5 text-ink-2">{t(o.desc)}</span>
              <span className="mt-2 block border-t border-line pt-2 text-[11.5px] text-ink-3">{t(o.trade)}</span>
            </motion.button>
          );
        })}
      </div>
    </motion.section>
  );
}

/* ── preparation plan ────────────────────────────────────────────── */

function PrepSection({ t, pushToast }: { t: TFn; pushToast: (m: string) => void }) {
  const [uploaded, setUploaded] = useState(false);
  const items: { icon: React.ReactNode; text: GovernanceKey; state: 'done' | 'scheduled' | 'seller' }[] = [
    { icon: <Check size={14} className="text-ev-verified" aria-hidden />, text: 'por.prep.paint', state: 'done' },
    { icon: <Camera size={14} className="text-accent" aria-hidden />, text: 'por.prep.photo', state: 'scheduled' },
    { icon: <CalendarDays size={14} className="text-accent" aria-hidden />, text: 'por.prep.openHouse', state: 'scheduled' },
    { icon: <Upload size={14} className="text-ev-estimate" aria-hidden />, text: 'por.prep.invoices', state: 'seller' },
  ];
  return (
    <motion.section {...reveal()} className="mb-12">
      <h2 className="mb-4 font-serif text-[22px] font-medium text-ink">{t('por.prep.title')}</h2>
      <ol className="space-y-2">
        {items.map((item, i) => {
          const done = item.state === 'done' || (item.state === 'seller' && uploaded);
          return (
            <motion.li key={item.text} {...reveal(i * 0.05)}
              className="flex items-center justify-between gap-3 rounded-xl border border-line bg-surface px-4 py-3">
              <span className="flex items-center gap-2.5 text-[13.5px] text-ink">
                {item.icon}
                <span className={cn(done && item.state !== 'seller' && 'text-ink-2')}>{t(item.text)}</span>
                {item.state === 'done' && (
                  <span className="rounded-full bg-ev-verified/10 px-2 py-0.5 text-[11px] font-medium text-ev-verified">{t('por.prep.paintDate')}</span>
                )}
              </span>
              {item.state === 'seller' && !uploaded && (
                <button type="button" onClick={() => { setUploaded(true); pushToast(t('por.prep.thanks')); }}
                  className="shrink-0 rounded-lg bg-accent px-3 py-1.5 text-[12px] font-medium text-white hover:bg-accent-hover">
                  {t('por.prep.gotIt')}
                </button>
              )}
              {item.state === 'seller' && uploaded && (
                <motion.span initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
                  className="flex shrink-0 items-center gap-1 text-[12px] font-medium text-ev-verified">
                  <Check size={13} aria-hidden /> {t('por.prep.paintDate')}
                </motion.span>
              )}
            </motion.li>
          );
        })}
      </ol>
    </motion.section>
  );
}

/* ── message composer ────────────────────────────────────────────── */

function Composer({ open, onClose, t, pushToast }: {
  open: boolean; onClose: () => void; t: TFn; pushToast: (m: string) => void;
}) {
  const [body, setBody] = useState('');
  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div className="fixed inset-0 z-40 bg-ink/25" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} />
          <motion.div role="dialog" aria-modal="true" aria-label={t('por.composer.title')}
            className="fixed left-1/2 top-1/2 z-50 w-[min(92vw,440px)] -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-line bg-surface p-5 shadow-lift"
            initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.96 }}
            transition={{ duration: 0.18 }}>
            <div className="mb-3 flex items-center justify-between">
              <p className="flex items-center gap-2 font-serif text-[17px] font-medium text-ink">
                <img src="/avatar-maya.png" alt="" className="h-7 w-7 rounded-full" />
                {t('por.composer.title')}
              </p>
              <button type="button" onClick={onClose} aria-label={t('gov.close')}
                className="rounded-lg p-1.5 text-ink-3 hover:bg-surface-2 hover:text-ink"><X size={15} /></button>
            </div>
            <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={4}
              placeholder={t('por.composer.placeholder')}
              className="w-full resize-none rounded-xl border border-line bg-paper p-3 text-[13.5px] leading-5 text-ink placeholder:text-ink-3 focus:border-accent focus:outline-none" />
            <div className="mt-3 flex justify-end">
              <button type="button" disabled={body.trim().length === 0}
                onClick={() => { onClose(); setBody(''); pushToast(t('por.composer.sent')); }}
                className="rounded-lg bg-accent px-4 py-2 text-[13px] font-medium text-white hover:bg-accent-hover disabled:opacity-50">
                {t('por.composer.send')}
              </button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
