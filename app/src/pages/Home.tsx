import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Plus, BookOpenCheck, ChevronRight, Lock, ShieldCheck,
  AlertTriangle, CheckCircle2, BadgeCheck,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useT } from '@/lib/i18n';
import { useJourney } from '@/lib/i18n/journey';
import type { JourneyKey } from '@/lib/i18n/journey';
import { trpc } from '@/providers/trpc';
import { EvidenceChip } from '@/components/evidence/EvidenceChip';
import type { EvidenceState } from '@/components/evidence/EvidenceChip';
import { AutonomyBadge } from '@/components/evidence/AutonomyBadge';
import type { AutonomyLevel } from '@/components/evidence/AutonomyBadge';
import { ConfidenceBar } from '@/components/evidence/ConfidenceBar';
import { EmptyState } from '@/components/evidence/EmptyState';
import { ApprovalDecisionDialog } from '@/components/ApprovalDecisionDialog';
import type { ApprovalDecisionTarget } from '@/components/ApprovalDecisionDialog';

/* ── Pipeline stages (ids match the dashboard summary + /pipeline) ── */

const STAGES = [
  'new_lead', 'qualified', 'consultation_booked', 'dossier_ready', 'strategy_proposed',
  'approved', 'live_listing', 'offer_review', 'under_contract', 'closed',
] as const;
type Stage = (typeof STAGES)[number];

const STAGE_KEY: Record<Stage, JourneyKey> = {
  new_lead: 'stage.new_lead', qualified: 'stage.qualified',
  consultation_booked: 'stage.consultation_booked', dossier_ready: 'stage.dossier_ready',
  strategy_proposed: 'stage.strategy_proposed', approved: 'stage.approved',
  live_listing: 'stage.live_listing', offer_review: 'stage.offer_review',
  under_contract: 'stage.under_contract', closed: 'stage.closed',
};

/** dashboard.recommendations evidenceKind → honest chip. */
const REC_KIND: Record<string, { state: EvidenceState; label?: string }> = {
  generated: { state: 'generated' },
  missing: { state: 'missing' },
  stale: { state: 'external', label: 'Stale data' },
};

/* ── helpers ─────────────────────────────────────────────────────── */

function fmtAge(createdAt: Date | string): string {
  const h = Math.max(1, Math.round((Date.now() - new Date(createdAt).getTime()) / 3_600_000));
  return h < 48 ? `${h} h` : `${Math.round(h / 24)} d`;
}

function leadReasons(raw: unknown): string[] {
  return Array.isArray(raw) ? raw.filter((r): r is string => typeof r === 'string') : [];
}

/* ── Count-up hook (figures 0→value over 600ms) ─────────────────── */
function useCountUp(target: number, duration = 600): number {
  const [value, setValue] = useState(0);
  const raf = useRef<number>(0);
  useEffect(() => {
    const start = performance.now();
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / duration);
      setValue(Math.round(target * (1 - Math.pow(1 - p, 3))));
      if (p < 1) raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf.current);
  }, [target, duration]);
  return value;
}

/* ── Motion presets ─────────────────────────────────────────────── */
const cardEntrance = (i: number, stagger = 0.04) => ({
  initial: { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.24, delay: i * stagger, ease: 'easeOut' as const },
});

const hoverLift =
  'transition-shadow duration-150 hover:border-line-strong hover:shadow-lift';

interface Toast { id: number; message: string; href?: string }

/* ══════════════════════════════════════════════════════════════════ */

export default function Home() {
  const { t, lang } = useT();
  const { t: tj } = useJourney();
  const navigate = useNavigate();
  const utils = trpc.useUtils();

  const summaryQ = trpc.dashboard.summary.useQuery();
  const recsQ = trpc.dashboard.recommendations.useQuery();
  const approvalsQ = trpc.approvals.list.useQuery({ status: 'pending' });
  const contactsQ = trpc.contacts.list.useQuery();
  const tenantQ = trpc.settings.tenant.useQuery();

  const [legendOpen, setLegendOpen] = useState(false);
  const [decisionTarget, setDecisionTarget] = useState<ApprovalDecisionTarget | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);

  const pushToast = (message: string, href?: string) => {
    const id = Date.now();
    setToasts((prev) => [...prev, { id, message, href }]);
    window.setTimeout(() => setToasts((prev) => prev.filter((x) => x.id !== id)), 6000);
  };

  const decide = trpc.approvals.decide.useMutation({
    onSuccess: async (_res, vars) => {
      await utils.approvals.list.invalidate();
      await utils.dashboard.summary.invalidate();
      setDecisionTarget(null);
      pushToast(
        vars.decision === 'approved'
          ? 'Approved — decision recorded in the audit trail.'
          : 'Rejected — decision recorded in the audit trail.',
        '/audit',
      );
    },
  });

  const closeDecision = () => {
    setDecisionTarget(null);
    decide.reset();
  };

  const summary = summaryQ.data;
  const tenant = tenantQ.data?.tenant ?? null;
  const meRole = tenantQ.data?.me.role ?? null;

  const autonomyCeiling = (tenant?.autonomyCeiling ?? summary?.autonomy.ceiling ?? 'A2') as AutonomyLevel;

  // A4 decisions are broker-of-record-only (server-enforced); mirror it in the UI.
  const a4Blocked = decisionTarget?.autonomyLevel === 'A4' && meRole !== null && meRole !== 'broker_of_record';

  const pendingApprovals = approvalsQ.data ?? [];
  const highIntent = (contactsQ.data ?? [])
    .filter((c) => (c.leadScore ?? 0) >= 80)
    .sort((a, b) => (b.leadScore ?? 0) - (a.leadScore ?? 0))
    .slice(0, 2);

  const today = new Date().toLocaleDateString(lang === 'fr' ? 'fr-CA' : 'en-CA', {
    weekday: 'long', month: 'long', day: 'numeric',
  });
  const subline = [
    today,
    tenant?.name,
    tenant && tenant.policyPackVersion
      ? `${tenant.province} policy pack v${tenant.policyPackVersion}`
      : null,
  ].filter(Boolean).join(' · ');

  return (
    <div className="p-6">
      {/* ── Page header ─────────────────────────────────────────── */}
      <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[22px] font-semibold leading-7 tracking-[-0.01em] text-ink">
            {t('cc.greeting')}
          </h1>
          <p className="mt-0.5 text-[12px] font-medium text-ink-3">{subline}</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <button
              type="button"
              onClick={() => setLegendOpen((v) => !v)}
              aria-expanded={legendOpen}
              className="flex h-9 items-center gap-1.5 rounded-lg border border-line bg-surface px-3 text-[13px] font-medium text-ink-2 hover:border-line-strong"
            >
              <BookOpenCheck size={14} aria-hidden />
              {t('action.evidence')}
            </button>
            <AnimatePresence>
              {legendOpen && (
                <motion.div
                  role="dialog"
                  aria-label={t('action.evidence')}
                  className="absolute right-0 top-full z-40 mt-1.5 w-64 rounded-xl border border-line bg-surface p-3 shadow-lift"
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 4 }}
                  transition={{ duration: 0.14 }}
                >
                  <div className="grid grid-cols-2 gap-1.5">
                    {(['verified', 'external', 'estimate', 'generated', 'assumption', 'missing', 'conflict', 'ai', 'approved', 'blocked'] as EvidenceState[]).map((s) => (
                      <EvidenceChip key={s} state={s} animate={false} />
                    ))}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
          <Link
            to="/sellers?new=1"
            className="flex h-9 items-center gap-1.5 rounded-lg bg-accent px-3 text-[13px] font-medium text-white transition-colors hover:bg-accent-hover active:scale-[0.99]"
          >
            <Plus size={14} aria-hidden />
            {t('action.newSellerLead')}
          </Link>
        </div>
      </header>

      {/* ── Row 1: KPI strip (dashboard.summary) ────────────────── */}
      {summaryQ.isError ? (
        <PanelError onRetry={() => summaryQ.refetch()} className="mb-6" />
      ) : summaryQ.isLoading || !summary ? (
        <section className="mb-6 grid grid-cols-2 gap-4 xl:grid-cols-4" aria-busy="true">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-[92px] animate-pulse rounded-xl border border-line bg-surface" />
          ))}
        </section>
      ) : (
        <section className="mb-6 grid grid-cols-2 gap-4 xl:grid-cols-4">
          <KpiCard index={0} label={t('cc.kpi.activeSellers')} value={summary.kpis.activeSellerOpportunities} />
          <KpiCard
            index={1}
            label={t('cc.kpi.approvals')}
            value={summary.kpis.approvalsWaiting}
            sub={summary.kpis.approvalsWaiting > 0 ? `Oldest: ${summary.kpis.oldestApprovalHours} h` : undefined}
            dot={summary.kpis.approvalsWaiting > 0 ? 'amber' : undefined}
            pulseRing={summary.kpis.approvalsWaiting > 0}
          />
          <KpiCard index={2} label={t('cc.kpi.leads')} value={summary.kpis.highIntentLeads72h} sub={t('cc.kpi.leadsSub')} />
          <KpiCard
            index={3}
            label={t('cc.kpi.compliance')}
            value={summary.kpis.complianceItems}
            sub={t('cc.kpi.complianceSub')}
            dot={summary.kpis.complianceItems > 0 ? 'red' : undefined}
          />
        </section>
      )}

      {/* ── Row 2: pipeline snapshot + autonomy status ──────────── */}
      <section className="mb-6 grid grid-cols-12 gap-4">
        <motion.div {...cardEntrance(0)} className={cn('ns-card col-span-12 p-4 xl:col-span-8', hoverLift)}>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-[16px] font-semibold leading-[22px] text-ink">{t('cc.pipelineSnapshot')}</h2>
            <Link to="/pipeline" className="text-[12px] font-medium text-accent hover:underline">
              {t('cc.viewAll')} →
            </Link>
          </div>
          {summaryQ.isLoading ? (
            <div className="flex flex-wrap gap-1.5" aria-busy="true">
              {STAGES.map((s) => (
                <span key={s} className="h-7 w-24 animate-pulse rounded-full border border-line bg-surface-2" />
              ))}
            </div>
          ) : summaryQ.isError ? (
            <PanelError compact onRetry={() => summaryQ.refetch()} />
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {STAGES.map((stage) => {
                const count = summary?.pipelineSnapshot[stage] ?? 0;
                return (
                  <button
                    key={stage}
                    type="button"
                    onClick={() => navigate('/pipeline')}
                    className={cn(
                      'flex h-7 items-center gap-1.5 rounded-full border px-2.5 text-[12px] font-medium transition-colors',
                      count > 0
                        ? 'border-line bg-surface-2 text-ink hover:border-accent/40 hover:bg-accent-tint'
                        : 'border-line/70 bg-surface text-ink-3 hover:border-line-strong',
                    )}
                  >
                    {tj(STAGE_KEY[stage])}
                    <span className={cn('tnum rounded-full px-1.5 text-[11px]', count > 0 ? 'bg-accent text-white' : 'bg-surface-2 text-ink-3')}>
                      {count}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </motion.div>

        <motion.div {...cardEntrance(1)} className={cn('ns-card col-span-12 p-4 xl:col-span-4', hoverLift)}>
          <h2 className="mb-3 text-[16px] font-semibold leading-[22px] text-ink">{t('cc.autonomyStatus')}</h2>
          <AutonomyBadge level={autonomyCeiling} className="mb-2 h-6 px-2 text-[12px]" />
          <p className="text-[12px] text-ink-3">{t('autonomy.setBy')}</p>
          <Link to="/settings" className="mt-1 inline-block text-[12px] font-medium text-accent hover:underline">
            {t('cc.requestChange')}
          </Link>
          {summary && (
            summary.policyGate.decisions7d > 0 ? (
              <div className="mt-3 flex items-center gap-1.5 rounded-lg border border-ev-verified/30 bg-[#1E7A4F]/10 px-2.5 py-2 text-[12px] font-medium text-ev-verified">
                <ShieldCheck size={14} aria-hidden />
                Policy checks (7 d): {summary.policyGate.decisions7d} · {summary.policyGate.passRatePct}% passed
              </div>
            ) : (
              <div className="mt-3 flex items-center gap-1.5 rounded-lg border border-line bg-surface-2 px-2.5 py-2 text-[12px] font-medium text-ink-3">
                <ShieldCheck size={14} aria-hidden />
                No policy checks in the last 7 days
              </div>
            )
          )}
        </motion.div>
      </section>

      {/* ── Row 3: three work columns ───────────────────────────── */}
      <section className="mb-6 grid grid-cols-12 gap-4">
        {/* Needs your approval */}
        <div className="col-span-12 lg:col-span-4">
          <ColumnHeader title={t('cc.needsApproval')} href="/approvals" />
          {approvalsQ.isLoading ? (
            <div className="space-y-3" aria-busy="true">
              {[0, 1].map((i) => (
                <div key={i} className="h-[104px] animate-pulse rounded-xl border border-line bg-surface" />
              ))}
            </div>
          ) : approvalsQ.isError ? (
            <PanelError onRetry={() => approvalsQ.refetch()} />
          ) : pendingApprovals.length === 0 ? (
            <div className="ns-card">
              <EmptyState title={t('misc.empty.caughtUp')} />
            </div>
          ) : (
            <div className="space-y-3">
              {pendingApprovals.slice(0, 3).map((a, i) => (
                <motion.div key={a.id} {...cardEntrance(i)} className={cn('ns-card p-3', hoverLift)}>
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-[13px] font-semibold leading-5 text-ink">{a.title}</p>
                    <AutonomyBadge level={a.autonomyLevel as AutonomyLevel} showLabel={false} />
                  </div>
                  <p className="mt-0.5 truncate font-mono text-[11.5px] text-ink-3">{a.destination}</p>
                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    <span className="tnum inline-flex h-5 items-center rounded-md bg-surface-2 px-1.5 text-[11px] text-ink-3">
                      {fmtAge(a.createdAt)}
                    </span>
                    <span className="text-[11px] text-ink-3">{a.kind}</span>
                  </div>
                  <div className="mt-2.5 flex gap-2">
                    <button
                      type="button"
                      onClick={() => setDecisionTarget(a)}
                      className="h-7 rounded-lg bg-accent px-2.5 text-[12px] font-medium text-white hover:bg-accent-hover active:scale-[0.99]"
                      title={t('cc.approveInline')}
                    >
                      {t('action.approve')}
                    </button>
                    <button
                      type="button"
                      onClick={() => navigate('/approvals')}
                      className="h-7 rounded-lg border border-line px-2.5 text-[12px] font-medium text-ink-2 hover:border-line-strong"
                    >
                      {t('action.review')}
                    </button>
                  </div>
                </motion.div>
              ))}
              {pendingApprovals.length > 3 && (
                <Link to="/approvals" className="inline-flex items-center gap-1 text-[12px] font-medium text-accent hover:underline">
                  +{pendingApprovals.length - 3} more
                  <ChevronRight size={12} aria-hidden />
                </Link>
              )}
            </div>
          )}
        </div>

        {/* High-intent leads */}
        <div className="col-span-12 lg:col-span-4">
          <ColumnHeader title={t('cc.highIntentLeads')} href="/conversations" />
          {contactsQ.isLoading ? (
            <div className="space-y-3" aria-busy="true">
              {[0, 1].map((i) => (
                <div key={i} className="h-[104px] animate-pulse rounded-xl border border-line bg-surface" />
              ))}
            </div>
          ) : contactsQ.isError ? (
            <PanelError onRetry={() => contactsQ.refetch()} />
          ) : highIntent.length === 0 ? (
            <div className="ns-card">
              <EmptyState title="No high-intent leads right now" description="Leads scored ≥ 80 by the scoring agent will appear here." />
            </div>
          ) : (
            <div className="space-y-3">
              {highIntent.map((c, i) => {
                const reasons = leadReasons(c.leadScoreReasons);
                const name = `${c.firstName} ${c.lastName}`.trim();
                const initials = `${c.firstName[0] ?? ''}${c.lastName[0] ?? ''}`.toUpperCase();
                return (
                  <motion.div key={c.id} {...cardEntrance(i)} className={cn('ns-card p-3', hoverLift)}>
                    <div className="flex items-center gap-2.5">
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-line bg-surface-2 text-[13px] font-semibold text-ink-2">
                        {initials}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[13px] font-semibold text-ink">{name}</p>
                        <p className="truncate text-[12px] text-ink-3">{tj(STAGE_KEY[c.stage as Stage] ?? 'stage.new_lead')}</p>
                      </div>
                      <span className="font-serif text-[28px] font-semibold leading-[34px] text-ink tnum">{c.leadScore}</span>
                    </div>
                    <div className="mt-2 flex items-center gap-2">
                      <ConfidenceBar value={c.leadScore ?? 0} color="#0E5A50" basis={reasons.join(' · ') || undefined} />
                      <EvidenceChip state="ai" />
                    </div>
                    {reasons.length > 0 && (
                      <p className="mt-1.5 text-[12px] leading-4 text-ink-2">{reasons.join(' · ')}</p>
                    )}
                    <Link to="/conversations" className="mt-2 inline-flex items-center gap-1 text-[12px] font-medium text-accent hover:underline">
                      {t('action.openConversation')}
                      <ChevronRight size={12} aria-hidden />
                    </Link>
                  </motion.div>
                );
              })}
            </div>
          )}
        </div>

        {/* AI recommended next actions */}
        <div className="col-span-12 lg:col-span-4">
          <ColumnHeader title={t('cc.aiNextActions')} href="/audit" />
          {recsQ.isLoading ? (
            <div className="ns-card space-y-3 p-3" aria-busy="true">
              {[0, 1, 2].map((i) => (
                <div key={i} className="h-10 animate-pulse rounded-lg bg-surface-2" />
              ))}
            </div>
          ) : recsQ.isError ? (
            <PanelError onRetry={() => recsQ.refetch()} />
          ) : (recsQ.data ?? []).length === 0 ? (
            <div className="ns-card">
              <EmptyState title="No recommendations right now" />
            </div>
          ) : (
            <div className="ns-card divide-y divide-line">
              {(recsQ.data ?? []).map((rec, i) => {
                const chip = REC_KIND[rec.evidenceKind];
                return (
                  <motion.div key={rec.id} {...cardEntrance(i)} className="p-3">
                    <div className="flex items-start gap-2.5">
                      <span className="tnum mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-accent-tint text-[11px] font-semibold text-accent">
                        {i + 1}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-[13px] font-medium leading-5 text-ink">{rec.text}</p>
                        {chip && (
                          <div className="mt-1.5">
                            <EvidenceChip state={chip.state} label={chip.label} />
                          </div>
                        )}
                      </div>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          )}
        </div>
      </section>

      {/* ── Row 4: compliance alerts (dashboard.summary) ────────── */}
      <section className="grid grid-cols-12 gap-4">
        <motion.div {...cardEntrance(0)} className={cn('ns-card col-span-12 p-4 xl:col-span-7', hoverLift)}>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-[16px] font-semibold leading-[22px] text-ink">{t('cc.complianceAlerts')}</h2>
            <Link to="/compliance" className="text-[12px] font-medium text-accent hover:underline">
              {t('nav.compliance')} →
            </Link>
          </div>
          {summaryQ.isLoading ? (
            <div className="space-y-2" aria-busy="true">
              {[0, 1, 2].map((i) => (
                <div key={i} className="h-11 animate-pulse rounded-lg border border-line bg-surface-2" />
              ))}
            </div>
          ) : summaryQ.isError ? (
            <PanelError compact onRetry={() => summaryQ.refetch()} />
          ) : summary && (
            <ul className="space-y-2">
              {/* CASL consent expiry */}
              {summary.complianceAlerts.consentsExpiring30d > 0 ? (
                <li className="flex items-center gap-3 rounded-lg border border-ev-estimate/30 border-l-[3px] border-l-ev-estimate bg-[#9A6A1B]/5 px-3 py-2.5">
                  <AlertTriangle size={15} className="shrink-0 text-ev-estimate" aria-hidden />
                  <p className="min-w-0 flex-1 text-[13px] leading-[18px] text-ink">
                    CASL express consents expiring within 30 days: {summary.complianceAlerts.consentsExpiring30d}
                  </p>
                  <Link to="/compliance" className="shrink-0 rounded-lg border border-line bg-surface px-2.5 py-1 text-[12px] font-medium text-ink-2 hover:border-line-strong">
                    {t('action.review')}
                  </Link>
                </li>
              ) : (
                <li className="flex items-center gap-3 rounded-lg border border-line border-l-[3px] border-l-ev-verified px-3 py-2.5">
                  <CheckCircle2 size={15} className="shrink-0 text-ev-verified" aria-hidden />
                  <p className="min-w-0 flex-1 text-[13px] leading-[18px] text-ink-2">No consents expiring in the next 30 days</p>
                </li>
              )}

              {/* FINTRAC queue — role-gated by the API (null = restricted) */}
              {summary.complianceAlerts.fintracQueue === null ? (
                <li className="flex items-center gap-3 rounded-lg border border-line px-3 py-2.5">
                  <Lock size={15} className="shrink-0 text-ink-3" aria-hidden />
                  <p className="min-w-0 flex-1 text-[13px] leading-[18px] text-ink-3">FINTRAC queue</p>
                  <span className="inline-flex shrink-0 items-center gap-1 rounded-md bg-surface-2 px-1.5 py-1 text-[11px] font-medium text-ink-3">
                    <Lock size={10} aria-hidden />
                    {t('cc.restrictedFintrac')}
                  </span>
                </li>
              ) : (
                <li className="flex items-center gap-3 rounded-lg border border-ev-conflict/30 border-l-[3px] border-l-ev-conflict bg-[#C2492B]/5 px-3 py-2.5">
                  <span className="relative flex h-2 w-2 shrink-0">
                    <span className="absolute h-full w-full animate-pulse-dot rounded-full bg-ev-conflict motion-reduce:animate-none" aria-hidden />
                  </span>
                  <p className="min-w-0 flex-1 text-[13px] leading-[18px] text-ink">
                    FINTRAC queue: {summary.complianceAlerts.fintracQueue} awaiting review
                  </p>
                </li>
              )}

              {/* DNCL flags */}
              {summary.complianceAlerts.dnclFlags > 0 ? (
                <li className="flex items-center gap-3 rounded-lg border border-ev-estimate/30 border-l-[3px] border-l-ev-estimate bg-[#9A6A1B]/5 px-3 py-2.5">
                  <AlertTriangle size={15} className="shrink-0 text-ev-estimate" aria-hidden />
                  <p className="min-w-0 flex-1 text-[13px] leading-[18px] text-ink">
                    DNCL flags on {summary.complianceAlerts.dnclFlags} {summary.complianceAlerts.dnclFlags === 1 ? 'contact' : 'contacts'}
                  </p>
                  <Link to="/compliance" className="shrink-0 rounded-lg border border-line bg-surface px-2.5 py-1 text-[12px] font-medium text-ink-2 hover:border-line-strong">
                    {t('action.review')}
                  </Link>
                </li>
              ) : (
                <li className="flex items-center gap-3 rounded-lg border border-line border-l-[3px] border-l-ev-verified px-3 py-2.5">
                  <CheckCircle2 size={15} className="shrink-0 text-ev-verified" aria-hidden />
                  <p className="min-w-0 flex-1 text-[13px] leading-[18px] text-ink-2">DNCL: no new flags</p>
                </li>
              )}
            </ul>
          )}
        </motion.div>
      </section>

      {/* ── Payload-bound approval decision dialog ──────────────── */}
      <ApprovalDecisionDialog
        approval={decisionTarget}
        deciding={decide.isPending}
        error={decide.error?.message ?? null}
        canApprove={!a4Blocked}
        blockedReason={a4Blocked ? 'Requires broker of record — A4 is a human-only commit level.' : null}
        onClose={closeDecision}
        onDecide={(decision, reason) => {
          if (!decisionTarget) return;
          decide.mutate({
            id: decisionTarget.id,
            decision,
            expectedPayloadHash: decisionTarget.payloadHash,
            reason,
          });
        }}
      />

      {/* ── Toasts ──────────────────────────────────────────────── */}
      <div aria-live="polite" className="pointer-events-none fixed bottom-4 right-4 z-50 flex w-80 flex-col gap-2">
        <AnimatePresence>
          {toasts.map((toast) => (
            <motion.div
              key={toast.id}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 16 }}
              transition={{ duration: 0.22 }}
              className="pointer-events-auto flex items-center gap-2 rounded-xl border border-line bg-surface p-3 shadow-lift"
            >
              <BadgeCheck size={15} className="shrink-0 text-ev-verified" aria-hidden />
              <p className="min-w-0 flex-1 text-[12.5px] text-ink">{toast.message}</p>
              {toast.href && (
                <Link to={toast.href} className="shrink-0 text-[12px] font-medium text-accent hover:underline">
                  View
                </Link>
              )}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
}

/* ── Page-local small components ────────────────────────────────── */

function ColumnHeader({ title, href }: { title: string; href: string }) {
  const { t } = useT();
  return (
    <div className="mb-3 flex items-center justify-between">
      <h2 className="text-[16px] font-semibold leading-[22px] text-ink">{title}</h2>
      <Link to={href} className="text-[12px] font-medium text-accent hover:underline">
        {t('cc.viewAll')} →
      </Link>
    </div>
  );
}

function PanelError({ onRetry, compact, className }: { onRetry: () => void; compact?: boolean; className?: string }) {
  const { t } = useT();
  return (
    <div className={cn('flex items-center gap-3 rounded-xl border border-ev-conflict/30 bg-[#C2492B]/5 px-4', compact ? 'py-2.5' : 'py-4', className)} role="alert">
      <AlertTriangle size={15} className="shrink-0 text-ev-conflict" aria-hidden />
      <p className="min-w-0 flex-1 text-[13px] text-ink-2">Couldn’t load live data for this panel.</p>
      <button
        type="button"
        onClick={onRetry}
        className="h-7 shrink-0 rounded-lg border border-line bg-surface px-2.5 text-[12px] font-medium text-ink-2 hover:border-line-strong"
      >
        {t('action.retry')}
      </button>
    </div>
  );
}

function KpiCard({ index, label, value, sub, dot, pulseRing }: {
  index: number;
  label: string;
  value: number;
  sub?: string;
  dot?: 'amber' | 'red';
  pulseRing?: boolean;
}) {
  const display = useCountUp(value);
  return (
    <motion.div
      {...cardEntrance(index, 0.05)}
      className={cn(
        'ns-card p-4',
        hoverLift,
        pulseRing && 'ring-2 ring-ev-estimate/40 motion-safe:animate-[pulse-dot_2.4s_ease-in-out_infinite] motion-reduce:animate-none',
      )}
    >
      <p className="ns-meta flex items-center gap-1.5">
        {dot && <span className={cn('h-1.5 w-1.5 rounded-full', dot === 'amber' ? 'bg-ev-estimate' : 'bg-ev-conflict')} aria-hidden />}
        {label}
      </p>
      <div className="mt-2 flex items-end justify-between gap-2">
        <span className="font-serif text-[28px] font-semibold leading-[34px] text-ink tnum">{display}</span>
      </div>
      {sub && <p className="mt-1 text-[12px] text-ink-3">{sub}</p>}
    </motion.div>
  );
}
