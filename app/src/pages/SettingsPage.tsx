import { useCallback, useMemo, useState } from 'react';
import { Link } from 'react-router';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Check, ChevronDown, Lock, ShieldCheck, FlaskConical, UserPlus,
  Landmark, Languages, Cpu, Plug, Users, Bell, Palette, MapPinned,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { trpc } from '@/providers/trpc';
import { useT } from '@/lib/i18n';
import type { Lang } from '@/lib/i18n';
import { useGovernanceT } from '@/lib/i18n/governance';
import type { GovernanceKey } from '@/lib/i18n/governance';
import { StatusPill } from '@/components/evidence/StatusPill';
import type { StatusTone } from '@/components/evidence/StatusPill';
import { AutonomyBadge } from '@/components/evidence/AutonomyBadge';
import type { AutonomyLevel } from '@/components/evidence/AutonomyBadge';
import { BlockedAction } from '@/components/evidence/BlockedAction';
import { Banner } from '@/components/evidence/Banner';
import { PolicyGatePanel } from '@/components/evidence/PolicyGatePanel';
import type { GateCheck } from '@/components/evidence/PolicyGatePanel';
import { EvidenceChip } from '@/components/evidence/EvidenceChip';
import type { EvidenceState } from '@/components/evidence/EvidenceChip';
import { EvidenceDrawer } from '@/components/evidence/EvidenceDrawer';
import type { EvidenceDetail } from '@/components/evidence/EvidenceDrawer';

/* ── motion ──────────────────────────────────────────────────────── */
const stagger = (i: number) => ({
  initial: { opacity: 0, y: 10 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.22, delay: i * 0.04, ease: 'easeOut' as const },
});

type SectionId =
  | 'jurisdiction' | 'brokerage' | 'language' | 'autonomy'
  | 'models' | 'integrations' | 'team' | 'notifications' | 'design';

const SECTIONS: { id: SectionId; icon: LucideIcon; key: GovernanceKey }[] = [
  { id: 'jurisdiction', icon: MapPinned, key: 'set.nav.jurisdiction' },
  { id: 'brokerage', icon: Landmark, key: 'set.nav.brokerage' },
  { id: 'language', icon: Languages, key: 'set.nav.language' },
  { id: 'autonomy', icon: ShieldCheck, key: 'set.nav.autonomy' },
  { id: 'models', icon: Cpu, key: 'set.nav.models' },
  { id: 'integrations', icon: Plug, key: 'set.nav.integrations' },
  { id: 'team', icon: Users, key: 'set.nav.team' },
  { id: 'notifications', icon: Bell, key: 'set.nav.notifications' },
  { id: 'design', icon: Palette, key: 'set.nav.design' },
];

const GATE_DEMO: GateCheck[] = [
  { id: 'consent', label: 'CASL consent', detail: 'CASL-01', status: 'pass' },
  { id: 'fresh', label: 'Approval freshness', detail: '26 h < 72 h', status: 'pass' },
  { id: 'payload', label: 'Payload↔destination binding', detail: 'sha256:9f2c…e41a', status: 'fail' },
];

const EVIDENCE_STATES: EvidenceState[] = [
  'verified', 'external', 'estimate', 'generated', 'assumption',
  'missing', 'conflict', 'ai', 'approved', 'blocked',
];

/* ── page ────────────────────────────────────────────────────────── */

export default function SettingsPage() {
  const { t } = useGovernanceT();
  const tenantQ = trpc.settings.tenant.useQuery(undefined, { retry: 1 });
  const [section, setSection] = useState<SectionId>(() => {
    const h = typeof window !== 'undefined' ? window.location.hash.slice(1) : '';
    return (SECTIONS.some((s) => s.id === h) ? h : 'jurisdiction') as SectionId;
  });

  const go = useCallback((id: SectionId) => {
    setSection(id);
    window.history.replaceState(null, '', `#${id}`);
  }, []);

  const tenantName = tenantQ.data?.tenant?.name ?? 'Harbourline Realty Inc., Brokerage';
  const me = tenantQ.data?.me;

  return (
    <div className="p-6">
      <header className="mb-5">
        <div className="flex flex-wrap items-center gap-2.5">
          <h1 className="text-[22px] font-semibold leading-7 tracking-[-0.01em] text-ink">{t('set.title')}</h1>
          <span className="inline-flex h-6 items-center gap-1.5 rounded-full border border-line bg-surface px-2.5 text-[11px] font-medium text-ink-2">
            {t('set.tenantChip', { name: tenantName })}
          </span>
        </div>
      </header>

      {tenantQ.isError && (
        <Banner variant="warning" title={t('set.error.title')} className="mb-4"
          action={<button type="button" onClick={() => tenantQ.refetch()} className="rounded-lg border border-line px-2.5 py-1 text-[12px] font-medium text-accent hover:bg-accent-tint">{t('gov.retry')}</button>}>
          {t('set.error.body')}
        </Banner>
      )}

      <div className="grid grid-cols-12 gap-6">
        {/* left nav */}
        <nav aria-label={t('set.title')} className="col-span-12 lg:col-span-3 xl:col-span-2">
          <ul className="sticky top-6 flex gap-1 overflow-x-auto lg:flex-col lg:overflow-visible">
            {SECTIONS.map((s) => {
              const Icon = s.icon;
              const active = section === s.id;
              return (
                <li key={s.id}>
                  <button type="button" onClick={() => go(s.id)} aria-current={active ? 'page' : undefined}
                    className={cn('relative flex w-full items-center gap-2 whitespace-nowrap rounded-lg px-3 py-2 text-left text-[13px] font-medium transition-colors',
                      active ? 'text-accent' : 'text-ink-2 hover:bg-surface-2 hover:text-ink')}>
                    {active && (
                      <motion.span layoutId="settings-nav" className="absolute inset-0 rounded-lg bg-accent-tint" transition={{ duration: 0.18 }} />
                    )}
                    <Icon size={14} className="relative shrink-0" aria-hidden />
                    <span className="relative">{t(s.key)}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </nav>

        {/* content column */}
        <div className="col-span-12 max-w-[760px] lg:col-span-9 xl:col-span-10">
          <AnimatePresence mode="wait">
            <motion.div key={section} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.18 }}>
              {section === 'jurisdiction' && <JurisdictionSection />}
              {section === 'brokerage' && <BrokerageSection tenantName={tenantName} />}
              {section === 'language' && <LanguageSection />}
              {section === 'autonomy' && <AutonomySection ceiling={(tenantQ.data?.tenant?.autonomyCeiling ?? 'A2') as AutonomyLevel} role={me?.role ?? ''} />}
              {section === 'models' && <ModelsSection />}
              {section === 'integrations' && <IntegrationsSection />}
              {section === 'team' && <TeamSection />}
              {section === 'notifications' && <NotificationsSection />}
              {section === 'design' && <DesignSection />}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}

/* ── § Jurisdiction & policy ─────────────────────────────────────── */

interface PackRow {
  jurisdiction: string; version: string; status: string; owner: string;
  effectiveDate: string; reviewDate: string | null; ruleCount: number; disclaimer: string | null;
}

const PROVINCE_NAME: Record<string, string> = { ON: 'Ontario', BC: 'British Columbia', AB: 'Alberta', QC: 'Québec' };

function JurisdictionSection() {
  const { t } = useGovernanceT();
  const packs = trpc.policy.packs.useQuery(undefined, { retry: 1 });
  const rules = trpc.policy.rules.useQuery({ jurisdiction: 'ON' }, { retry: 1 });
  const [sourceFilter, setSourceFilter] = useState('all');
  const [openRule, setOpenRule] = useState<string | null>(null);

  const sources = useMemo(() => {
    const set = new Set<string>();
    for (const r of rules.data ?? []) set.add(r.sourceName.split(' ')[0]);
    return Array.from(set).sort();
  }, [rules.data]);

  const shown = useMemo(() => (rules.data ?? []).filter((r) =>
    sourceFilter === 'all' || r.sourceName.startsWith(sourceFilter),
  ), [rules.data, sourceFilter]);

  return (
    <div className="space-y-4">
      {/* pack cards */}
      <div className="grid gap-3 sm:grid-cols-2">
        {(packs.data ?? []).map((p: PackRow, i: number) => {
          const active = p.status === 'production';
          return (
            <motion.div key={p.jurisdiction} {...stagger(i)}
              className={cn('ns-card p-4', active ? 'border-ev-verified/40' : 'opacity-80')}>
              <div className="flex items-start justify-between gap-2">
                <p className="text-[14px] font-semibold text-ink">
                  {active ? t('set.jur.production', { version: p.version }) : PROVINCE_NAME[p.jurisdiction] ?? p.jurisdiction}
                </p>
                {active
                  ? <StatusPill label={t('set.jur.active')} tone="emerald" />
                  : <Lock size={14} className="mt-0.5 text-ev-blocked" aria-hidden />}
              </div>
              <p className="mt-1 text-[12px] text-ink-2">
                {active
                  ? t('set.jur.meta', { rules: p.ruleCount, date: p.reviewDate ?? '—', owner: p.owner.split('(')[0].trim() })
                  : t('set.jur.notLicensed')}
              </p>
              {!active && (
                <div className="mt-2">
                  <BlockedAction label={PROVINCE_NAME[p.jurisdiction] ?? p.jurisdiction} reason={t('set.jur.notLicensed')} />
                </div>
              )}
            </motion.div>
          );
        })}
        {packs.isLoading && Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="ns-card h-24 animate-pulse p-4"><div className="h-4 w-32 rounded bg-surface-2" /></div>
        ))}
      </div>

      {/* rule browser */}
      <div className="ns-card p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-[16px] font-semibold leading-[22px] text-ink">{t('set.jur.rules')}</h2>
          <select value={sourceFilter} onChange={(e) => setSourceFilter(e.target.value)} aria-label={t('set.jur.col.name')}
            className="h-8 rounded-lg border border-line bg-surface px-2 text-[12px] font-medium text-ink-2">
            <option value="all">{t('set.jur.filter.all')}</option>
            {sources.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        {rules.isLoading && <div className="h-48 animate-pulse rounded-lg bg-surface-2" />}
        {rules.isSuccess && (
          <div className="overflow-hidden rounded-lg border border-line">
            <table className="w-full border-collapse text-[13px]">
              <thead>
                <tr className="border-b border-line bg-surface-2/60 text-left">
                  {(['set.jur.col.id', 'set.jur.col.name', 'set.jur.col.effective', 'set.jur.col.owner'] as GovernanceKey[]).map((k) => (
                    <th key={k} scope="col" className="px-3 py-2 text-[11px] font-medium uppercase tracking-[0.04em] text-ink-3">{t(k)}</th>
                  ))}
                  <th scope="col" className="w-8" />
                </tr>
              </thead>
              <tbody>
                {shown.map((r) => {
                  const open = openRule === r.ruleId;
                  const tests = r.testScenarios as { name: string; expect: string }[];
                  const control = r.control as { id: string; description: string; kind: string };
                  return [
                    <tr key={r.ruleId} onClick={() => setOpenRule(open ? null : r.ruleId)}
                      className="cursor-pointer border-b border-line/70 transition-colors hover:bg-surface-2/60"
                      aria-expanded={open}>
                      <td className="px-3 py-2"><code className="font-mono text-[12px] font-medium text-accent">{r.ruleId}</code></td>
                      <td className="max-w-56 truncate px-3 py-2 text-ink" title={r.sourceName}>{r.sourceName}</td>
                      <td className="tnum px-3 py-2 text-[12px] text-ink-2">{r.effectiveDate ?? '—'}</td>
                      <td className="max-w-40 truncate px-3 py-2 text-[12px] text-ink-2">{r.owner}</td>
                      <td className="px-2 py-2">
                        <ChevronDown size={14} className={cn('text-ink-3 transition-transform', open && 'rotate-180')} aria-hidden />
                      </td>
                    </tr>,
                    open && (
                      <tr key={`${r.ruleId}-detail`} className="border-b border-line/70 bg-surface-2/40">
                        <td colSpan={5} className="px-4 py-3">
                          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} transition={{ duration: 0.18 }}>
                            <p className="mb-2 text-[13px] leading-5 text-ink">{r.requirement}</p>
                            <p className="mb-1 text-[11px] font-medium uppercase tracking-[0.04em] text-ink-3">{t('set.jur.control')}</p>
                            <p className="mb-2 text-[12px] text-ink-2"><code className="mr-1.5 rounded bg-surface-2 px-1 font-mono text-[11px]">{control.id}</code>{control.description}</p>
                            <div className="mb-2 flex flex-wrap gap-1.5">
                              {tests.map((sc, i) => (
                                <motion.span key={sc.name} initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ delay: i * 0.02 }}
                                  className={cn('rounded-full border px-2 py-0.5 text-[11px]',
                                    sc.expect === 'allow' ? 'border-ev-verified/40 bg-ev-verified/10 text-ev-verified' : 'border-ev-conflict/40 bg-[#C2492B]/10 text-ev-conflict')}>
                                  {sc.name}
                                </motion.span>
                              ))}
                              <StatusPill label={t('set.jur.tests', { count: tests.length })} tone="emerald" />
                            </div>
                            <p className="text-[12px] text-ink-3">{t('set.jur.escalation')}: {r.escalationPath}</p>
                            {r.verifyNote && <p className="mt-1 flex items-start gap-1 text-[12px] text-ev-estimate"><FlaskConical size={12} className="mt-0.5 shrink-0" aria-hidden />{r.verifyNote}</p>}
                          </motion.div>
                        </td>
                      </tr>
                    ),
                  ];
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

/* ── § Brokerage profile ─────────────────────────────────────────── */

function BrokerageSection({ tenantName }: { tenantName: string }) {
  const { t } = useGovernanceT();
  const rows: [GovernanceKey, React.ReactNode][] = [
    ['set.brk.name', <span className="font-medium text-ink">{tenantName}</span>],
    ['set.brk.registration', <code className="font-mono text-[12px] text-ink-2">RECO-#4829107</code>],
    ['set.brk.address', 'DEMO-ON-STREET-005, Suite 400, Toronto ON M0M 0M0'],
    ['set.brk.brand', <span className="inline-flex items-center gap-2"><span className="h-3.5 w-3.5 rounded-full bg-accent" aria-hidden />pine</span>],
    ['set.brk.logo', <img src="/logo.svg" alt="" className="h-7 w-7" />],
    ['set.brk.bor', <span className="inline-flex items-center gap-2"><img src="/avatar-daniel.png" alt="" className="h-6 w-6 rounded-full" />Daniel Okafor</span>],
    ['set.brk.teamId', (
      <span className="flex flex-col gap-1">
        <code className="rounded bg-surface-2 px-1.5 py-0.5 font-mono text-[11px] text-ink-2">Harbourline Realty Inc., Brokerage</code>
        <code className="rounded bg-surface-2 px-1.5 py-0.5 font-mono text-[11px] text-ink-2">Harbourline Realty Inc., maison de courtage</code>
      </span>
    )],
  ];
  return (
    <div className="space-y-4">
      <div className="ns-card p-4">
        <h2 className="mb-3 text-[16px] font-semibold leading-[22px] text-ink">{t('set.brk.title')}</h2>
        <dl className="divide-y divide-line">
          {rows.map(([k, v], i) => (
            <motion.div key={k} {...stagger(i)} className="flex items-center justify-between gap-4 py-2.5 text-[13px]">
              <dt className="text-ink-2">{t(k)}</dt>
              <dd className="text-right text-ink">{v}</dd>
            </motion.div>
          ))}
        </dl>
      </div>
      <div className="ns-card p-4">
        <h3 className="ns-meta mb-2">{t('set.brk.forms')}</h3>
        <ul className="space-y-1.5">
          {['OREA Form 100 — Listing Agreement (mock)', 'OREA Form 801 — Listing Detail (mock)', 'FINTRAC receipt-of-funds record (template)'].map((f) => (
            <li key={f} className="flex items-center justify-between rounded-lg border border-line px-3 py-2 text-[13px] text-ink">
              {f}
              <StatusPill label={t('set.brk.form.ok')} tone="emerald" />
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

/* ── § Language ──────────────────────────────────────────────────── */

function LanguageSection() {
  const { t } = useGovernanceT();
  const { lang, setLang } = useT();
  return (
    <div className="space-y-4">
      <div className="ns-card p-4">
        <h2 className="mb-3 text-[16px] font-semibold leading-[22px] text-ink">{t('set.lang.title')}</h2>
        <p className="ns-meta mb-2">{t('set.lang.default')}</p>
        <div className="mb-2 inline-flex rounded-lg border border-line p-0.5" role="group" aria-label={t('set.lang.default')}>
          {(['en', 'fr'] as Lang[]).map((l) => (
            <button key={l} type="button" aria-pressed={lang === l} onClick={() => setLang(l)}
              className={cn('relative h-8 rounded-md px-3 text-[13px] font-medium transition-colors',
                lang === l ? 'text-white' : 'text-ink-2 hover:text-ink')}>
              {lang === l && <motion.span layoutId="lang-seg" className="absolute inset-0 rounded-md bg-accent" transition={{ duration: 0.18 }} />}
              <span className="relative">{l === 'en' ? 'English' : 'Français (Canada)'}</span>
            </button>
          ))}
        </div>
        <p className="text-[12px] text-ink-3">{t('set.lang.override')}</p>
      </div>
      <div className="ns-card p-4">
        <p className="ns-meta mb-2">{t('set.lang.preview')}</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-lg border border-line bg-surface-2/60 p-3">
            <p className="ns-meta mb-1">EN</p>
            <p className="text-[13px] text-ink">{t('set.lang.previewEn')}</p>
          </div>
          <div className="rounded-lg border border-line bg-surface-2/60 p-3">
            <p className="ns-meta mb-1">fr-CA</p>
            <p className="text-[13px] text-ink">{t('set.lang.previewFr')}</p>
          </div>
        </div>
        <div className="mt-3">
          <StatusPill label={t('set.lang.parity')} tone="emerald" />
        </div>
      </div>
    </div>
  );
}

/* ── § Autonomy ──────────────────────────────────────────────────── */

const LEVELS: { level: AutonomyLevel; descKey: GovernanceKey; exKey: GovernanceKey }[] = [
  { level: 'A0', descKey: 'set.auto.a0.desc', exKey: 'set.auto.a0.ex' },
  { level: 'A1', descKey: 'set.auto.a1.desc', exKey: 'set.auto.a1.ex' },
  { level: 'A2', descKey: 'set.auto.a2.desc', exKey: 'set.auto.a2.ex' },
  { level: 'A3', descKey: 'set.auto.a3.desc', exKey: 'set.auto.a3.ex' },
  { level: 'A4', descKey: 'set.auto.a4.desc', exKey: 'set.auto.a4.ex' },
];

function AutonomySection({ ceiling, role }: { ceiling: AutonomyLevel; role: string }) {
  const { t } = useGovernanceT();
  const utils = trpc.useUtils();
  const [pending, setPending] = useState<AutonomyLevel | null>(null);
  const [saved, setSaved] = useState(false);
  const canChange = role === 'broker_of_record';

  const mutation = trpc.settings.setAutonomyCeiling.useMutation({
    onSuccess: async () => {
      setSaved(true);
      setPending(null);
      await utils.settings.tenant.invalidate();
      window.setTimeout(() => setSaved(false), 5000);
    },
  });

  return (
    <div className="space-y-4">
      <div className="ns-card p-4">
        <h2 className="mb-3 text-[16px] font-semibold leading-[22px] text-ink">{t('set.auto.title')}</h2>
        <div className="space-y-2.5" role="radiogroup" aria-label={t('set.auto.title')}>
          {LEVELS.map(({ level, descKey, exKey }, i) => {
            const isCurrent = level === ceiling;
            const isPending = level === pending;
            const selectable = level !== 'A4';
            return (
              <motion.div key={level} {...stagger(i)}>
                <button type="button" role="radio" aria-checked={isCurrent} disabled={!selectable}
                  onClick={() => selectable && setPending(level === pending ? null : level)}
                  className={cn('w-full rounded-xl border p-3.5 text-left transition-all',
                    isCurrent ? 'border-accent bg-accent-tint/50' : isPending ? 'border-accent/60' : 'border-line bg-surface hover:border-line-strong',
                    !selectable && 'cursor-not-allowed opacity-80')}>
                  <div className="flex items-center justify-between gap-2">
                    <AutonomyBadge level={level} />
                    <span className="flex items-center gap-2">
                      {isCurrent && (
                        <span className="inline-flex items-center gap-1 text-[11px] font-medium text-accent">
                          <Check size={12} aria-hidden /> {t('set.auto.current')}
                        </span>
                      )}
                      {!selectable && <Lock size={13} className="text-ev-blocked" aria-hidden />}
                    </span>
                  </div>
                  <p className="mt-1.5 text-[13px] leading-5 text-ink">{t(descKey)}</p>
                  <p className="mt-0.5 text-[12px] text-ink-3">{t(exKey)}</p>
                  <p className="mt-1 text-[11px] text-ink-3">
                    {t('set.auto.approver')}: {selectable ? t('set.auto.approver.bor') : t('set.auto.approver.none')}
                  </p>
                </button>
              </motion.div>
            );
          })}
        </div>

        {/* change control */}
        <AnimatePresence>
          {pending && pending !== ceiling && (
            <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
              className="overflow-hidden">
              <div className="mt-3 rounded-xl border border-ev-estimate/40 bg-[#9A6A1B]/5 p-3.5">
                <p className="text-[13px] text-ink">{t('set.auto.change.affected', { level: pending })}</p>
                <div className="mt-2.5">
                  {canChange ? (
                    <motion.button type="button" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.16 }}
                      disabled={mutation.isPending}
                      onClick={() => mutation.mutate({ ceiling: pending })}
                      className="flex h-9 items-center gap-1.5 rounded-lg bg-accent px-3 text-[13px] font-medium text-white hover:bg-accent-hover disabled:opacity-60">
                      <ShieldCheck size={14} aria-hidden />
                      {mutation.isPending ? t('gov.loading') : t('set.auto.change.confirm')}
                    </motion.button>
                  ) : (
                    <BlockedAction label={t('set.auto.change.confirm')} reason={t('set.auto.change.blocked')} />
                  )}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
        {saved && (
          <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }}
            className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-ev-verified/40 bg-ev-verified/10 px-2.5 py-1.5 text-[12px] font-medium text-ev-verified" role="status">
            <Check size={12} aria-hidden /> {t('set.auto.change.saved')}{' '}
            <Link to="/audit" className="underline">{t('gov.loggedView')}</Link>
          </motion.p>
        )}
        {mutation.isError && (
          <Banner variant="warning" className="mt-3">{t('set.auto.change.blocked')}</Banner>
        )}
      </div>

      {/* fail-closed explainer */}
      <div className="ns-card p-4">
        <p className="mb-3 flex items-start gap-2 text-[13px] leading-5 text-ink">
          <ShieldCheck size={15} className="mt-0.5 shrink-0 text-ev-verified" aria-hidden />
          {t('set.auto.failClosed')}
        </p>
        <PolicyGatePanel checks={GATE_DEMO} />
      </div>
    </div>
  );
}

/* ── § Model routing & privacy ───────────────────────────────────── */

const ROUTING_ROWS: [string, string][] = [
  ['high — FINTRAC, PII', 'ca-central-1 · kimi-k3/ca'],
  ['medium — dossier summaries', 'ca-central-1 · kimi-k3/ca'],
  ['low — formatting, tags', 'ca-central-1 · kimi-k3/ca'],
];

const MODEL_REGISTRY: [string, string][] = [
  ['k3-sellerbrief@1.4.2', '96/100'],
  ['k3-content@2.1.0', '94/100'],
  ['k3-policy@1.2.0', '99/100'],
];

function ModelsSection() {
  const { t } = useGovernanceT();
  const [canada, setCanada] = useState(true);
  const [rerouting, setRerouting] = useState(false);

  const toggle = () => {
    setCanada((v) => !v);
    setRerouting(true);
    window.setTimeout(() => setRerouting(false), 900);
  };

  return (
    <div className="space-y-4">
      <div className="ns-card p-4">
        <h2 className="mb-3 text-[16px] font-semibold leading-[22px] text-ink">{t('set.model.title')}</h2>
        <div className="mb-3 flex items-center justify-between rounded-xl border border-line p-3">
          <div>
            <p className="text-[13px] font-medium text-ink">{t('set.model.canada')}</p>
            <p className="text-[12px] text-ink-2">{t('set.model.canadaNote')}</p>
          </div>
          <button type="button" role="switch" aria-checked={canada} onClick={toggle}
            className={cn('relative h-6 w-11 shrink-0 rounded-full transition-colors', canada ? 'bg-ev-verified' : 'bg-ink-3')}>
            <motion.span layout transition={{ type: 'spring', stiffness: 500, damping: 32 }}
              className={cn('absolute top-0.5 h-5 w-5 rounded-full bg-white shadow', canada ? 'right-0.5' : 'left-0.5')} />
          </button>
        </div>
        <table className="w-full border-collapse overflow-hidden rounded-lg border border-line text-[13px]" aria-busy={rerouting}>
          <thead>
            <tr className="border-b border-line bg-surface-2/60 text-left">
              <th scope="col" className="px-3 py-2 text-[11px] font-medium uppercase tracking-[0.04em] text-ink-3">{t('set.model.col.task')}</th>
              <th scope="col" className="px-3 py-2 text-[11px] font-medium uppercase tracking-[0.04em] text-ink-3">{t('set.model.col.provider')}</th>
            </tr>
          </thead>
          <tbody>
            {ROUTING_ROWS.map(([task, provider]) => (
              <tr key={task} className={cn('border-b border-line/70 last:border-b-0', rerouting && 'animate-pulse')}>
                <td className="px-3 py-2 text-ink">{task}</td>
                <td className="px-3 py-2"><code className="font-mono text-[11.5px] text-ink-2">{canada ? provider : 'us-east-1 · kimi-k3/us'}</code></td>
              </tr>
            ))}
          </tbody>
        </table>
        <ul className="mt-3 space-y-1.5 text-[13px]">
          <li className="flex items-center justify-between rounded-lg border border-line px-3 py-2"><span className="text-ink">{t('set.model.redaction')}</span><Check size={14} className="text-ev-verified" aria-hidden /></li>
          <li className="flex items-center justify-between rounded-lg border border-line px-3 py-2"><span className="text-ink">{t('set.model.tokenization')}</span><Check size={14} className="text-ev-verified" aria-hidden /></li>
          <li className="flex items-center justify-between rounded-lg border border-line bg-surface-2/60 px-3 py-2">
            <span className="text-ink">{t('set.model.training')}</span>
            <span className="inline-flex items-center gap-1.5 text-[12px] text-ev-blocked"><Lock size={12} aria-hidden />{t('set.model.trainingOff')}</span>
          </li>
        </ul>
      </div>

      <div className="ns-card p-4">
        <h3 className="ns-meta mb-2">{t('set.model.registry')}</h3>
        <table className="w-full border-collapse overflow-hidden rounded-lg border border-line text-[13px]">
          <thead>
            <tr className="border-b border-line bg-surface-2/60 text-left">
              <th scope="col" className="px-3 py-2 text-[11px] font-medium uppercase tracking-[0.04em] text-ink-3">{t('set.model.col.model')}</th>
              <th scope="col" className="px-3 py-2 text-[11px] font-medium uppercase tracking-[0.04em] text-ink-3">{t('set.model.col.eval')}</th>
            </tr>
          </thead>
          <tbody>
            {MODEL_REGISTRY.map(([model, score]) => (
              <tr key={model} className="border-b border-line/70 last:border-b-0">
                <td className="px-3 py-2"><code className="font-mono text-[12px] text-ink">{model}</code></td>
                <td className="px-3 py-2"><StatusPill label={t('set.model.evalReport', { score })} tone="emerald" /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="ns-card p-4">
        <h3 className="ns-meta mb-2">{t('set.model.guardrails')}</h3>
        <ul className="grid gap-1.5 sm:grid-cols-2">
          {(['set.model.guard.injection', 'set.model.guard.exfil', 'set.model.guard.allowlist', 'set.model.guard.caps'] as GovernanceKey[]).map((k) => (
            <li key={k} className="flex items-center justify-between rounded-lg border border-line px-3 py-2 text-[13px] text-ink">
              {t(k)}
              {k === 'set.model.guard.caps'
                ? <code className="font-mono text-[11px] text-ink-3">8k tok · $0.40</code>
                : <Check size={14} className="text-ev-verified" aria-hidden />}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

/* ── § Integrations ──────────────────────────────────────────────── */

const STATUS_TONE: Record<string, StatusTone> = {
  mock: 'amber', sandbox: 'violet', connected: 'emerald', degraded: 'red', not_connected: 'neutral',
};

function IntegrationsSection() {
  const { t } = useGovernanceT();
  const list = trpc.integrations.list.useQuery(undefined, { retry: 1 });
  return (
    <div className="ns-card p-4">
      <h2 className="mb-3 text-[16px] font-semibold leading-[22px] text-ink">{t('set.int.title')}</h2>
      {list.isLoading && <div className="h-40 animate-pulse rounded-lg bg-surface-2" />}
      {list.isSuccess && (
        <>
          <div className="overflow-x-auto rounded-lg border border-line">
            <table className="w-full border-collapse text-[13px]">
              <thead>
                <tr className="border-b border-line bg-surface-2/60 text-left">
                  {(['set.int.col.name', 'set.int.col.status', 'set.int.col.detail', 'set.int.col.action'] as GovernanceKey[]).map((k) => (
                    <th key={k} scope="col" className="px-3 py-2 text-[11px] font-medium uppercase tracking-[0.04em] text-ink-3">{t(k)}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {list.data.map((row, i) => (
                  <motion.tr key={row.id} {...stagger(i)} className="border-b border-line/70 last:border-b-0">
                    <td className="px-3 py-2.5 font-medium text-ink">{row.name}</td>
                    <td className="px-3 py-2.5">
                      <motion.span
                        animate={row.status === 'mock' ? { scale: [1, 1.06, 1] } : undefined}
                        transition={row.status === 'mock' ? { duration: 0.5, delay: 0.3 } : undefined}
                        className="inline-flex">
                        <StatusPill label={t(`set.int.status.${row.status}` as GovernanceKey)} tone={STATUS_TONE[row.status] ?? 'neutral'} />
                      </motion.span>
                    </td>
                    <td className="max-w-72 px-3 py-2.5 text-[12px] text-ink-2">{row.truthfulNote}</td>
                    <td className="px-3 py-2.5">
                      {row.status === 'mock' || row.status === 'sandbox' ? (
                        <button type="button" className="rounded-lg border border-line px-2.5 py-1 text-[12px] font-medium text-accent hover:bg-accent-tint">
                          {t('set.int.configure')}
                        </button>
                      ) : row.status === 'not_connected' ? (
                        <button type="button" className="rounded-lg border border-line px-2.5 py-1 text-[12px] font-medium text-accent hover:bg-accent-tint">
                          {t('set.int.onboarding')}
                        </button>
                      ) : null}
                    </td>
                  </motion.tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-3 flex items-start gap-1.5 text-[12px] text-ink-3">
            <FlaskConical size={13} className="mt-0.5 shrink-0 text-ev-estimate" aria-hidden />
            {t('set.int.rule')}
          </p>
        </>
      )}
    </div>
  );
}

/* ── § Team & roles ──────────────────────────────────────────────── */

const AVATAR_BY_NAME: Record<string, string> = {
  'Maya Chen': '/avatar-maya.png',
  'Daniel Okafor': '/avatar-daniel.png',
  'Sofia Tremblay': '/avatar-sofia.png',
  'Amir Haddad': '/avatar-amir.png',
};

function TeamSection() {
  const { t } = useGovernanceT();
  const tenantQ = trpc.settings.tenant.useQuery(undefined, { retry: 1 });
  const members = tenantQ.data?.members ?? [];
  return (
    <div className="ns-card p-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-[16px] font-semibold leading-[22px] text-ink">{t('set.team.title')}</h2>
        <button type="button" className="flex h-8 items-center gap-1.5 rounded-lg bg-accent px-3 text-[12px] font-medium text-white hover:bg-accent-hover">
          <UserPlus size={13} aria-hidden /> {t('set.team.invite')}
        </button>
      </div>
      {tenantQ.isLoading && <div className="h-32 animate-pulse rounded-lg bg-surface-2" />}
      {members.length > 0 && (
        <div className="overflow-x-auto rounded-lg border border-line">
          <table className="w-full border-collapse text-[13px]">
            <thead>
              <tr className="border-b border-line bg-surface-2/60 text-left">
                {(['set.team.col.member', 'set.team.col.role', 'set.team.col.ceiling', 'set.team.col.mfa'] as GovernanceKey[]).map((k) => (
                  <th key={k} scope="col" className="px-3 py-2 text-[11px] font-medium uppercase tracking-[0.04em] text-ink-3">{t(k)}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {members.map(({ membership, user }, i) => (
                <motion.tr key={membership.id} {...stagger(i)} className="border-b border-line/70 last:border-b-0">
                  <td className="px-3 py-2.5">
                    <span className="flex items-center gap-2">
                      {AVATAR_BY_NAME[user.name ?? '']
                        ? <img src={AVATAR_BY_NAME[user.name ?? '']} alt="" className="h-6 w-6 rounded-full" />
                        : <span className="flex h-6 w-6 items-center justify-center rounded-full bg-accent-tint text-[10px] font-semibold text-accent">{(user.name ?? '?').slice(0, 1)}</span>}
                      <span className="font-medium text-ink">{user.name}</span>
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-[12px] text-ink-2">{membership.role.replaceAll('_', ' ')}</td>
                  <td className="px-3 py-2.5 text-[12px] text-ink-3">—</td>
                  <td className="px-3 py-2.5"><StatusPill label={t('set.team.mfa.on')} tone="emerald" /></td>
                </motion.tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/* ── § Notifications ─────────────────────────────────────────────── */

function NotificationsSection() {
  const { t } = useGovernanceT();
  const rows: [GovernanceKey, GovernanceKey][] = [
    ['set.notif.digest', 'set.notif.digest.weekly'],
    ['set.notif.escalation', 'set.notif.escalationNote'],
    ['set.notif.quiet', 'set.notif.quietNote'],
  ];
  return (
    <div className="ns-card p-4">
      <h2 className="mb-3 text-[16px] font-semibold leading-[22px] text-ink">{t('set.notif.title')}</h2>
      <dl className="divide-y divide-line">
        {rows.map(([label, note], i) => (
          <motion.div key={label} {...stagger(i)} className="py-3">
            <dt className="text-[13px] font-medium text-ink">{t(label)}</dt>
            <dd className="mt-0.5 text-[13px] text-ink-2">{t(note)}</dd>
          </motion.div>
        ))}
      </dl>
      <div className="mt-2 flex justify-end">
        <StatusPill label={t('set.saved')} tone="emerald" />
      </div>
    </div>
  );
}

/* ── § Design language ───────────────────────────────────────────── */

function DesignSection() {
  const { t } = useGovernanceT();
  const [demo, setDemo] = useState<EvidenceDetail | null>(null);
  return (
    <div className="ns-card p-4">
      <h2 className="mb-1.5 text-[16px] font-semibold leading-[22px] text-ink">{t('set.design.title')}</h2>
      <p className="mb-4 text-[13px] text-ink-2">{t('set.design.note')}</p>
      <div className="grid gap-2 sm:grid-cols-2">
        {EVIDENCE_STATES.map((s, i) => (
          <motion.div key={s} {...stagger(i)}
            className="flex items-center justify-between rounded-lg border border-line px-3 py-2.5">
            <EvidenceChip state={s} />
            <code className="font-mono text-[11px] text-ink-3">{s}</code>
          </motion.div>
        ))}
      </div>
      <div className="mt-4">
        <button type="button"
          onClick={() => setDemo({
            statement: 'Median detached price in Davisville is $1.62M.',
            state: 'external',
            sourceName: 'Board statistics feed (mock)',
            freshnessLabel: '2 h', freshnessLevel: 'fresh',
            confidence: 0.87, confidenceBasis: '5 comparable sales, 90-day window',
            lineage: [
              { kind: 'source', label: 'Board statistics feed', ref: 'src_board_stats' },
              { kind: 'agent', label: 'seller-brief-agent', ref: 'k3-sellerbrief@1.4.2' },
              { kind: 'policy', label: 'Evidence standard', ref: 'EV-STD-01' },
            ],
          })}
          className="flex h-9 items-center gap-1.5 rounded-lg border border-line px-3 text-[13px] font-medium text-accent hover:bg-accent-tint">
          {t('set.design.demo')}
        </button>
      </div>
      <EvidenceDrawer open={demo !== null} onClose={() => setDemo(null)} evidence={demo} />
    </div>
  );
}
