import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router';
import { motion } from 'framer-motion';
import { format } from 'date-fns';
import {
  ShieldCheck, PhoneOff, Lock, Archive, FileClock, Check, FlaskConical,
  AlertTriangle, ChevronRight,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { trpc } from '@/providers/trpc';
import { useGovernanceT } from '@/lib/i18n/governance';
import type { GovernanceKey } from '@/lib/i18n/governance';
import { StatusPill } from '@/components/evidence/StatusPill';
import type { StatusTone } from '@/components/evidence/StatusPill';
import { Banner } from '@/components/evidence/Banner';
import { EmptyState } from '@/components/evidence/EmptyState';

/* ── motion presets ──────────────────────────────────────────────── */
const cardEntrance = (i: number, stagger = 0.04) => ({
  initial: { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.24, delay: i * stagger, ease: 'easeOut' as const },
});
const hoverLift = 'transition-shadow duration-150 hover:border-line-strong hover:shadow-lift';

/* ── page ────────────────────────────────────────────────────────── */

type DecisionFilter = 'all' | 'allow' | 'block';

export default function Compliance() {
  const { t, dfLocale } = useGovernanceT();
  const overview = trpc.compliance.overview.useQuery(undefined, { retry: 1 });
  const expiring = trpc.consents.expiringSoon.useQuery({ days: 30 }, { retry: 1 });
  const contacts = trpc.contacts.list.useQuery(undefined, { retry: 1 });
  const suppression = trpc.compliance.suppressionList.useQuery(undefined, { retry: 1 });
  const decisions = trpc.policy.decisions.useQuery({ limit: 30 }, { retry: 1 });

  const fintracRestricted = overview.data?.fintracQueue === 'restricted';
  // fintracQueue is a MUTATION: every call writes an audit row (FIN-07
  // view-attempt evidence), so it must not ride a side-effect-free GET.
  const fintrac = trpc.compliance.fintracQueue.useMutation({ retry: false });
  const { mutate: loadFintracQueue } = fintrac;
  const fintracShouldLoad = overview.isSuccess && !fintracRestricted;
  const fintracRequested = useRef(false);
  useEffect(() => {
    if (fintracShouldLoad && !fintracRequested.current) {
      fintracRequested.current = true;
      loadFintracQueue(undefined);
    }
  }, [fintracShouldLoad, loadFintracQueue]);

  const [filter, setFilter] = useState<DecisionFilter>('all');
  const [toast, setToast] = useState<string | null>(null);
  const pushToast = useCallback((msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast(null), 5000);
  }, []);

  const contactName = useCallback(
    (id: number) => {
      const c = contacts.data?.find((x) => x.id === id);
      return c ? (c.preferredName ?? `${c.firstName} ${c.lastName}`) : `#${id}`;
    },
    [contacts.data],
  );

  const ov = overview.data;
  const validConsent = ov ? ov.casl.express + ov.casl.implied : 0;
  const decisions7d = useMemo(() => {
    const all = decisions.data ?? [];
    return all.filter((d) => filter === 'all' || d.verdict === filter);
  }, [decisions.data, filter]);

  const verdictTone: Record<string, StatusTone> = { allow: 'emerald', block: 'red', escalate: 'amber' };
  const verdictKey: Record<string, GovernanceKey> = {
    allow: 'cmp.decisions.allowed',
    block: 'cmp.decisions.blocked',
    escalate: 'cmp.decisions.escalated',
  };

  return (
    <div className="p-6">
      {/* header */}
      <header className="mb-5">
        <div className="flex flex-wrap items-center gap-2.5">
          <h1 className="text-[22px] font-semibold leading-7 tracking-[-0.01em] text-ink">{t('cmp.title')}</h1>
          <span className="inline-flex h-6 items-center gap-1.5 rounded-full border border-line bg-surface px-2.5 text-[11px] font-medium text-ink-2">
            <ShieldCheck size={12} className="text-ev-verified" aria-hidden />
            {t('cmp.pack', { version: '2026.1', date: '2026-05-15' })}
          </span>
        </div>
        <p className="mt-1 text-[12px] text-ink-3">{t('cmp.disclaimer')}</p>
      </header>

      {overview.isError && (
        <Banner variant="warning" title={t('cmp.error.title')} className="mb-4"
          action={<button type="button" onClick={() => overview.refetch()} className="rounded-lg border border-line px-2.5 py-1 text-[12px] font-medium text-accent hover:bg-accent-tint">{t('gov.retry')}</button>}>
          {t('cmp.error.body')}
        </Banner>
      )}

      {/* KPI strip */}
      <section className="mb-5 grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-5" aria-busy={overview.isLoading}>
        <KpiTile i={0} loading={overview.isLoading} value={validConsent.toLocaleString()} label={t('cmp.kpi.validConsent')} sub={t('cmp.kpi.validConsentSub')} tone="text-ev-verified" />
        <KpiTile i={1} loading={overview.isLoading} value={String(ov?.casl.expiringSoon ?? 0)} label={t('cmp.kpi.expiring')} sub={t('cmp.kpi.expiringSub')} tone={ov && ov.casl.expiringSoon > 0 ? 'text-ev-estimate' : 'text-ev-verified'} />
        <KpiTile i={2} loading={overview.isLoading} value={String(ov?.dncl.flags ?? 0)} label={t('cmp.kpi.dncl')} sub={t('cmp.kpi.dnclSub')} tone="text-ev-verified" />
        {fintracRestricted ? (
          <motion.div {...cardEntrance(3)} className={cn('ns-card p-3.5', hoverLift)}>
            <div className="flex items-center gap-1.5 text-ev-blocked"><Lock size={14} aria-hidden /><span className="tnum text-[22px] font-semibold leading-7 text-ink-3">—</span></div>
            <p className="mt-1 text-[12px] font-medium text-ink">{t('cmp.kpi.fintrac')}</p>
            <p className="text-[11px] text-ink-3">{t('cmp.kpi.fintracSub')}</p>
          </motion.div>
        ) : (
          <KpiTile i={3} loading={overview.isLoading} value={String(typeof ov?.fintracQueue === 'object' ? ov.fintracQueue.count : 0)} label={t('cmp.kpi.fintrac')} sub={t('cmp.fintrac.awaiting')} tone="text-ev-estimate" />
        )}
        <KpiTile i={4} loading={overview.isLoading} value={(ov?.policyDecisions7d.total ?? 0).toLocaleString()} label={t('cmp.kpi.decisions')} sub={t('cmp.kpi.decisionsSub', { pct: ov?.policyDecisions7d.passRatePct ?? 100 })} tone="text-ink" />
      </section>

      {/* Row 2 — CASL + DNCL/voice */}
      <section className="mb-5 grid grid-cols-12 gap-4">
        <motion.div {...cardEntrance(1)} className={cn('ns-card col-span-12 p-4 xl:col-span-7', hoverLift)}>
          <h2 className="mb-3 text-[16px] font-semibold leading-[22px] text-ink">{t('cmp.casl.title')}</h2>
          {/* stacked bar */}
          {ov && (
            <>
              <div className="mb-2 flex h-3 w-full overflow-hidden rounded-full" role="img"
                aria-label={`${t('cmp.casl.express')} ${ov.casl.express}, ${t('cmp.casl.implied')} ${ov.casl.implied}, ${t('cmp.casl.expired')} ${ov.casl.expired}, ${t('cmp.casl.suppressed')} ${ov.casl.suppressed}`}>
                <BarSeg count={ov.casl.express} total={validConsent + ov.casl.expired + ov.casl.suppressed} cls="bg-ev-verified" delay={0} />
                <BarSeg count={ov.casl.implied} total={validConsent + ov.casl.expired + ov.casl.suppressed} cls="bg-ev-external" delay={0.1} />
                <BarSeg count={ov.casl.expired} total={validConsent + ov.casl.expired + ov.casl.suppressed} cls="bg-ev-estimate" delay={0.2} />
                <BarSeg count={ov.casl.suppressed} total={validConsent + ov.casl.expired + ov.casl.suppressed} cls="bg-ink-3" delay={0.3} />
              </div>
              <div className="mb-4 flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-ink-2">
                {([['cmp.casl.express', ov.casl.express, 'bg-ev-verified'], ['cmp.casl.implied', ov.casl.implied, 'bg-ev-external'], ['cmp.casl.expired', ov.casl.expired, 'bg-ev-estimate'], ['cmp.casl.suppressed', ov.casl.suppressed, 'bg-ink-3']] as [GovernanceKey, number, string][]).map(([k, n, dot]) => (
                  <span key={k} className="inline-flex items-center gap-1.5">
                    <span className={cn('h-2 w-2 rounded-full', dot)} aria-hidden /> {t(k)} <span className="tnum font-medium text-ink">{n.toLocaleString()}</span>
                  </span>
                ))}
              </div>
            </>
          )}

          {/* expiring soon */}
          <h3 className="ns-meta mb-2">{t('cmp.casl.expiringTitle')}</h3>
          {expiring.isLoading && <div className="h-24 animate-pulse rounded-lg bg-surface-2" />}
          {!expiring.isLoading && (expiring.data ?? []).length === 0 && (
            <p className="rounded-lg border border-line bg-surface-2/60 px-3 py-2.5 text-[13px] text-ink-2">{t('cmp.casl.empty')}</p>
          )}
          {(expiring.data ?? []).length > 0 && (
            <div className="overflow-x-auto rounded-lg border border-line">
              <table className="w-full border-collapse text-[13px]">
                <thead>
                  <tr className="border-b border-line bg-surface-2/60 text-left">
                    {(['cmp.casl.col.contact', 'cmp.casl.col.channel', 'cmp.casl.col.basis', 'cmp.casl.col.expiry'] as GovernanceKey[]).map((k) => (
                      <th key={k} scope="col" className="px-3 py-2 text-[11px] font-medium uppercase tracking-[0.04em] text-ink-3">{t(k)}</th>
                    ))}
                    <th scope="col" className="w-36" />
                  </tr>
                </thead>
                <tbody>
                  {(expiring.data ?? []).map((c, i) => (
                    <motion.tr key={c.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.025 }}
                      className="border-b border-line/70 last:border-b-0 hover:bg-surface-2/60">
                      <td className="px-3 py-2 font-medium text-ink">{contactName(c.contactId)}</td>
                      <td className="px-3 py-2 uppercase text-ink-2">{c.channel}</td>
                      <td className="px-3 py-2 text-ink-2">{c.basis === 'implied' ? t('cmp.casl.implied') : c.basis === 'express' ? t('cmp.casl.express') : c.basis}</td>
                      <td className="tnum px-3 py-2 text-ev-estimate">{c.expiresAt ? format(new Date(c.expiresAt), 'd MMM yyyy', { locale: dfLocale }) : '—'}</td>
                      <td className="px-3 py-2 text-right">
                        <button type="button" onClick={() => pushToast(t('cmp.casl.reconsentSent'))}
                          className="rounded-lg border border-line px-2.5 py-1 text-[12px] font-medium text-accent hover:bg-accent-tint">
                          {t('cmp.casl.reconsent')}
                        </button>
                      </td>
                    </motion.tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* suppression summary */}
          <div className="mt-4 flex items-center justify-between rounded-lg border border-line bg-surface-2/60 px-3 py-2.5">
            <div className="flex items-center gap-2 text-[13px] text-ink-2">
              <Archive size={14} className="text-ink-3" aria-hidden />
              <span className="font-medium text-ink">{t('cmp.casl.suppressionTitle')}</span>
              <code className="font-mono text-[11px] text-ink-3">supp_2025-06</code>
              <span className="text-[12px]">{t('cmp.casl.suppressionMeta', { count: suppression.data?.length ?? 0 })}</span>
            </div>
            <Lock size={13} className="shrink-0 text-ev-blocked" aria-hidden />
          </div>
        </motion.div>

        {/* DNCL & voice */}
        <motion.div {...cardEntrance(2)} className={cn('ns-card col-span-12 p-4 xl:col-span-5', hoverLift)}>
          <h2 className="mb-3 text-[16px] font-semibold leading-[22px] text-ink">{t('cmp.dncl.title')}</h2>
          <div className="mb-3 flex items-center gap-2 rounded-lg border border-line bg-surface-2/60 px-3 py-2 text-[12px] text-ink-2">
            <FlaskConical size={13} className="text-ev-estimate" aria-hidden />
            {t('cmp.dncl.sync')}
          </div>
          <div className="mb-4 grid grid-cols-2 gap-3">
            <div className="rounded-lg border border-line p-3">
              <p className="tnum text-[20px] font-semibold leading-6 text-ev-verified">{ov?.dncl.flags ?? 0}</p>
              <p className="text-[12px] text-ink-2">{t('cmp.dncl.flags')}</p>
            </div>
            <div className="rounded-lg border border-line p-3">
              <p className="tnum text-[20px] font-semibold leading-6 text-ink">{ov?.dncl.internalDnc ?? 0}</p>
              <p className="text-[12px] text-ink-2">{t('cmp.dncl.internal')}</p>
            </div>
          </div>
          <ul className="space-y-2 text-[13px] text-ink-2">
            {[t('cmp.dncl.hours'), t('cmp.dncl.disclosure')].map((line) => (
              <li key={line} className="flex items-center gap-2">
                <Check size={14} className="text-ev-verified" aria-hidden /> {line}
              </li>
            ))}
            <li className="flex items-center gap-2">
              <PhoneOff size={14} className="text-ink-3" aria-hidden />
              {t('cmp.dncl.recording')} <code className="font-mono text-[11px] text-ink-3">voice-notice@v1</code>
            </li>
          </ul>
        </motion.div>
      </section>

      {/* Row 2b — FINTRAC queue (restricted) */}
      <motion.section {...cardEntrance(3)} className={cn('ns-card mb-5 p-4', hoverLift)}>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-[16px] font-semibold leading-[22px] text-ink">{t('cmp.fintrac.title')}</h2>
          {(fintracRestricted || fintrac.isError) && <StatusPill label={t('gov.restricted')} tone="neutral" />}
        </div>
        {fintracRestricted || fintrac.isError ? (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.2 }}
            className="flex items-center gap-3 rounded-lg border border-line bg-surface-2/60 px-4 py-3.5">
            <Lock size={16} className="shrink-0 text-ev-blocked" aria-hidden />
            <div>
              <p className="text-[13px] font-medium text-ink">{t('cmp.fintrac.locked')}</p>
              <p className="text-[11px] text-ink-3">{t('cmp.fintrac.loggedNote')}</p>
            </div>
          </motion.div>
        ) : (
          <>
            {(fintrac.isIdle || fintrac.isPending) && <div className="h-16 animate-pulse rounded-lg bg-surface-2" />}
            {fintrac.isSuccess && (
              <div className="overflow-x-auto rounded-lg border border-line">
                <table className="w-full border-collapse text-[13px]">
                  <thead>
                    <tr className="border-b border-line bg-surface-2/60 text-left">
                      {(['cmp.fintrac.col.file', 'cmp.fintrac.col.trigger', 'cmp.fintrac.col.status', 'cmp.fintrac.col.age'] as GovernanceKey[]).map((k) => (
                        <th key={k} scope="col" className="px-3 py-2 text-[11px] font-medium uppercase tracking-[0.04em] text-ink-3">{t(k)}</th>
                      ))}
                      <th scope="col" className="w-28" />
                    </tr>
                  </thead>
                  <tbody>
                    {fintrac.data.map((task) => (
                      <tr key={task.id} className="border-b border-line/70 last:border-b-0 hover:bg-surface-2/60">
                        <td className="px-3 py-2 font-medium text-ink">{task.title}</td>
                        <td className="px-3 py-2 text-ink-2">{t('cmp.fintrac.rof')}</td>
                        <td className="px-3 py-2">
                          <StatusPill label={task.status === 'done' ? t('cmp.fintrac.escalated') : t('cmp.fintrac.awaiting')} tone={task.status === 'done' ? 'accent' : 'amber'} />
                        </td>
                        <td className="tnum px-3 py-2 text-ink-2">{format(new Date(task.createdAt), 'd MMM', { locale: dfLocale })}</td>
                        <td className="px-3 py-2 text-right">
                          <button type="button" className="rounded-lg border border-line px-2.5 py-1 text-[12px] font-medium text-accent hover:bg-accent-tint">
                            {t('cmp.fintrac.open')}
                          </button>
                        </td>
                      </tr>
                    ))}
                    {fintrac.data.length === 0 && (
                      <tr><td colSpan={5} className="px-3 py-4 text-center text-[13px] text-ink-3">{t('cmp.fintrac.empty')}</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
            <p className="mt-2 text-[11px] text-ink-3">{t('cmp.fintrac.antiTip')}</p>
            <p className="text-[11px] text-ink-3">{t('cmp.fintrac.meta')}</p>
          </>
        )}
      </motion.section>

      {/* Row 3 — decisions log + privacy */}
      <section className="grid grid-cols-12 gap-4">
        <motion.div {...cardEntrance(4)} className={cn('ns-card col-span-12 p-4 xl:col-span-7', hoverLift)}>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-[16px] font-semibold leading-[22px] text-ink">{t('cmp.decisions.title')}</h2>
            <div className="flex gap-1" role="tablist" aria-label={t('cmp.decisions.title')}>
              {(['all', 'allow', 'block'] as DecisionFilter[]).map((f) => (
                <button key={f} type="button" role="tab" aria-selected={filter === f} onClick={() => setFilter(f)}
                  className={cn('h-7 rounded-full px-2.5 text-[12px] font-medium transition-colors',
                    filter === f ? 'bg-accent text-white' : 'border border-line text-ink-2 hover:bg-surface-2')}>
                  {t(f === 'all' ? 'cmp.decisions.filter.all' : f === 'allow' ? 'cmp.decisions.filter.allowed' : 'cmp.decisions.filter.blocked')}
                </button>
              ))}
            </div>
          </div>
          {decisions.isLoading && <div className="h-40 animate-pulse rounded-lg bg-surface-2" />}
          {!decisions.isLoading && decisions7d.length === 0 && (
            <EmptyState title={t('cmp.decisions.empty')} className="py-6" />
          )}
          {decisions7d.length > 0 && (
            <div className="overflow-x-auto rounded-lg border border-line">
              <table className="w-full border-collapse text-[13px]">
                <thead>
                  <tr className="border-b border-line bg-surface-2/60 text-left">
                    {(['cmp.decisions.col.time', 'cmp.decisions.col.actor', 'cmp.decisions.col.action', 'cmp.decisions.col.rules', 'cmp.decisions.col.decision'] as GovernanceKey[]).map((k) => (
                      <th key={k} scope="col" className="px-3 py-2 text-[11px] font-medium uppercase tracking-[0.04em] text-ink-3">{t(k)}</th>
                    ))}
                    <th scope="col" className="w-8" />
                  </tr>
                </thead>
                <tbody>
                  {decisions7d.map((d, i) => (
                    <motion.tr key={d.id} initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.024, duration: 0.2 }}
                      className="border-b border-line/70 last:border-b-0 hover:bg-surface-2/60">
                      <td className="tnum whitespace-nowrap px-3 py-2 text-[12px] text-ink-2">{format(new Date(d.createdAt), 'HH:mm', { locale: dfLocale })}</td>
                      <td className="max-w-32 truncate px-3 py-2 text-ink">{d.actor}</td>
                      <td className="max-w-52 truncate px-3 py-2 text-ink-2" title={d.action}>{d.action}</td>
                      <td className="px-3 py-2">
                        {(d.ruleIds as string[]).slice(0, 2).map((r) => (
                          <code key={r} className="mr-1 rounded bg-surface-2 px-1 font-mono text-[10.5px] text-ink-2">{r}</code>
                        ))}
                      </td>
                      <td className="px-3 py-2">
                        <StatusPill label={t(verdictKey[d.verdict] ?? 'cmp.decisions.allowed')} tone={verdictTone[d.verdict] ?? 'neutral'} />
                        {d.verdict === 'block' && (d.reasons as string[])[0] && (
                          <span className="mt-0.5 flex max-w-44 items-start gap-1 text-[11px] text-ev-conflict">
                            <AlertTriangle size={10} className="mt-0.5 shrink-0" aria-hidden />
                            <span className="truncate" title={(d.reasons as string[])[0]}>{(d.reasons as string[])[0]}</span>
                          </span>
                        )}
                      </td>
                      <td className="px-2 py-2">
                        <Link to="/audit" aria-label={t('gov.viewAudit')} className="text-ink-3 hover:text-accent"><ChevronRight size={14} /></Link>
                      </td>
                    </motion.tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </motion.div>

        {/* privacy & retention */}
        <motion.div {...cardEntrance(5)} className={cn('ns-card col-span-12 p-4 xl:col-span-5', hoverLift)}>
          <h2 className="mb-3 text-[16px] font-semibold leading-[22px] text-ink">{t('cmp.privacy.title')}</h2>
          <h3 className="ns-meta mb-2">{t('cmp.privacy.jobs')}</h3>
          <ul className="mb-4 space-y-1.5">
            {([['cmp.privacy.job.purge', 'cmp.privacy.nightly'], ['cmp.privacy.job.media', 'cmp.privacy.daily'], ['cmp.privacy.job.archive', 'cmp.privacy.monthly']] as [GovernanceKey, GovernanceKey][]).map(([job, cadence]) => (
              <li key={job} className="flex items-center justify-between rounded-lg border border-line px-3 py-2 text-[13px]">
                <span className="flex items-center gap-2 text-ink">
                  <FileClock size={13} className="text-ink-3" aria-hidden />
                  {t(job)} <span className="text-[12px] text-ink-3">— {t(cadence)}</span>
                </span>
                <StatusPill label={t('cmp.privacy.lastRun')} tone="emerald" />
              </li>
            ))}
          </ul>

          <h3 className="ns-meta mb-2">{t('cmp.privacy.requests')}</h3>
          <div className="mb-4 rounded-lg border border-ev-estimate/40 bg-[#9A6A1B]/5 px-3 py-2.5">
            <p className="text-[13px] font-medium text-ink">{t('cmp.privacy.pr1')}</p>
            <ol className="mt-2 flex flex-wrap items-center gap-1.5 text-[11px] text-ink-2">
              {(['cmp.privacy.step.verify', 'cmp.privacy.step.compile', 'cmp.privacy.step.review', 'cmp.privacy.step.deliver'] as GovernanceKey[]).map((k, i) => (
                <li key={k} className="flex items-center gap-1.5">
                  {i > 0 && <ChevronRight size={11} className="text-ink-3" aria-hidden />}
                  <span className={cn('inline-flex items-center gap-1 rounded-full border px-2 py-0.5',
                    i === 0 ? 'border-ev-verified/40 bg-ev-verified/10 text-ev-verified' : i === 1 ? 'border-ev-estimate/40 bg-[#9A6A1B]/10 text-ev-estimate' : 'border-line bg-surface text-ink-3')}>
                    {i === 0 && <Check size={10} aria-hidden />}
                    {t(k)}
                  </span>
                </li>
              ))}
            </ol>
          </div>

          <div className="mb-3 flex items-center justify-between rounded-lg border border-line px-3 py-2 text-[13px]">
            <span className="font-medium text-ink">{t('cmp.privacy.holds')}</span>
            <StatusPill label={t('cmp.privacy.holdsNone')} tone="neutral" />
          </div>
          <div className="rounded-lg border border-ev-verified/40 bg-ev-verified/5 px-3 py-2.5">
            <p className="flex items-center gap-2 text-[13px] font-medium text-ev-verified">
              <ShieldCheck size={14} aria-hidden /> {t('cmp.privacy.noIncidents')}
            </p>
            <p className="mt-0.5 text-[11px] text-ink-3">{t('cmp.privacy.breach')} · {t('cmp.privacy.drill')}</p>
          </div>
        </motion.div>
      </section>

      {/* toast */}
      {toast && (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
          className="fixed bottom-5 right-5 z-50 flex items-center gap-2 rounded-xl border border-line bg-surface px-4 py-2.5 text-[13px] font-medium text-ink shadow-lift" role="status">
          <Check size={14} className="text-ev-verified" aria-hidden /> {toast}
        </motion.div>
      )}
    </div>
  );
}

/* ── subcomponents ───────────────────────────────────────────────── */

function KpiTile({ i, loading, value, label, sub, tone }: {
  i: number; loading: boolean; value: string; label: string; sub: string; tone: string;
}) {
  return (
    <motion.div {...cardEntrance(i)} className={cn('ns-card p-3.5', hoverLift)}>
      {loading ? (
        <div className="h-7 w-16 animate-pulse rounded bg-surface-2" />
      ) : (
        <p className={cn('tnum text-[22px] font-semibold leading-7', tone)}>{value}</p>
      )}
      <p className="mt-1 text-[12px] font-medium text-ink">{label}</p>
      <p className="text-[11px] text-ink-3">{sub}</p>
    </motion.div>
  );
}

function BarSeg({ count, total, cls, delay }: { count: number; total: number; cls: string; delay: number }) {
  const pct = total > 0 ? (count / total) * 100 : 0;
  if (pct <= 0) return null;
  return (
    <motion.span className={cn('block h-full origin-left', cls)} style={{ width: `${pct}%` }}
      initial={{ scaleX: 0 }} animate={{ scaleX: 1 }} transition={{ duration: 0.6, delay, ease: 'easeOut' }} />
  );
}
