import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Megaphone, Mail, MessageSquare, Plus, X, Lock, Gauge,
  CalendarRange, Users, Pause, Play, PencilLine, OctagonX, Undo2,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { trpc } from '@/providers/trpc';
import { formatCAD } from '@/lib/i18n';
import { useT } from '@/lib/i18n';
import { useActionsT } from '@/lib/i18n/actions';
import type { ActionsKey } from '@/lib/i18n/actions';
import { EvidenceChip } from '@/components/evidence/EvidenceChip';
import { AutonomyBadge } from '@/components/evidence/AutonomyBadge';
import type { AutonomyLevel } from '@/components/evidence/AutonomyBadge';
import { StatusPill } from '@/components/evidence/StatusPill';
import type { StatusTone } from '@/components/evidence/StatusPill';
import { Banner } from '@/components/evidence/Banner';
import { BlockedAction } from '@/components/evidence/BlockedAction';
import { PolicyGatePanel } from '@/components/evidence/PolicyGatePanel';
import type { GateCheck } from '@/components/evidence/PolicyGatePanel';
import { EmptyState } from '@/components/evidence/EmptyState';

/* ── helpers ─────────────────────────────────────────────────────── */

const CHANNEL_ICON: Record<string, LucideIcon> = { email: Mail, sms: MessageSquare, dm: Megaphone, voice: Megaphone };

/** Demo spent amounts (mock provider ledger) keyed by campaign name. */
const SPENT_BY_NAME: Record<string, number> = {
  'Spring seller seminar follow-up': 48600,
  'Davisville listing announcement': 22000,
  'Investor list nurture': 0,
};

type CampaignStatus = 'draft' | 'pending_approval' | 'approved' | 'active' | 'paused' | 'completed';

const STATUS_KEY: Record<CampaignStatus, ActionsKey> = {
  draft: 'cm.status.draft',
  pending_approval: 'cm.status.pending_approval',
  approved: 'cm.status.approved',
  active: 'cm.status.active',
  paused: 'cm.status.paused',
  completed: 'cm.status.completed',
};

const STATUS_TONE: Record<CampaignStatus, StatusTone> = {
  draft: 'neutral',
  pending_approval: 'amber',
  approved: 'accent',
  active: 'emerald',
  paused: 'amber',
  completed: 'slate',
};

function audienceSize(audience: unknown): number {
  const a = audience as { size?: number } | null;
  return a?.size ?? 0;
}

/* ── page ────────────────────────────────────────────────────────── */

export default function Campaigns() {
  const { t, lang } = useActionsT();
  const listQ = trpc.campaigns.list.useQuery();
  const [drawerId, setDrawerId] = useState<number | null>(null);
  const [wizardOpen, setWizardOpen] = useState(false);

  // auto-open first campaign drawer per design (detail open by default)
  const campaigns = listQ.data ?? [];
  const openId = drawerId ?? (campaigns.length ? campaigns[0].id : null);

  return (
    <div className="px-6 pb-8 pt-6">
      {/* header */}
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-[22px] font-semibold leading-7 tracking-[-0.01em] text-ink">{t('cm.title')}</h1>
        <span className="inline-flex h-6 items-center gap-1.5 rounded-full border border-accent/30 bg-accent-tint px-2.5 text-[11.5px] font-medium text-accent">
          <AutonomyBadge level="A3" showLabel={false} />
          {t('cm.ceiling')}
        </span>
        <button
          type="button"
          onClick={() => setWizardOpen(true)}
          className="ml-auto inline-flex h-9 items-center gap-1.5 rounded-lg bg-accent px-4 text-[13px] font-medium text-white hover:bg-accent-hover active:scale-[0.99]"
        >
          <Plus size={14} aria-hidden />
          {t('cm.new')}
        </button>
      </div>

      {/* list */}
      {listQ.isLoading ? (
        <div className="mt-5 grid gap-4 lg:grid-cols-2">
          {[0, 1].map((i) => <div key={i} className="h-[180px] animate-pulse rounded-xl border border-line bg-surface" />)}
        </div>
      ) : listQ.isError ? (
        <EmptyState title={t('cm.error.title')} description={t('cm.error.desc')} className="mt-5" />
      ) : campaigns.length === 0 ? (
        <EmptyState
          title={t('cm.empty.title')}
          description={t('cm.empty.desc')}
          className="mt-5"
          action={
            <button type="button" onClick={() => setWizardOpen(true)} className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-accent px-4 text-[13px] font-medium text-white hover:bg-accent-hover">
              <Plus size={14} aria-hidden />
              {t('cm.new')}
            </button>
          }
        />
      ) : (
        <div className="mt-5 grid gap-4 lg:grid-cols-2">
          {campaigns.map((c, i) => {
            const status = c.status as CampaignStatus;
            const cap = c.budgetCapCents ?? 0;
            const spent = SPENT_BY_NAME[c.name] ?? 0;
            const pct = cap > 0 ? Math.min(100, Math.round((spent / cap) * 100)) : 0;
            const channels = (c.channels as string[] | null) ?? [];
            const schedule = c.schedule as { startDate?: string; window?: string } | null;
            const pausedByPolicy = c.name.toLowerCase().includes('investor');
            return (
              <motion.button
                key={c.id}
                type="button"
                onClick={() => setDrawerId(c.id)}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.24, delay: i * 0.05 }}
                className={cn(
                  'ns-card p-5 text-left transition-all hover:-translate-y-px hover:border-line-strong',
                  openId === c.id && 'border-accent/40',
                  pausedByPolicy && 'opacity-90',
                )}
              >
                <div className="flex items-start justify-between gap-2">
                  <p className="min-w-0 flex-1 truncate text-[15px] font-semibold text-ink">{c.name}</p>
                  <StatusPill
                    label={pausedByPolicy ? t('cm.status.pausedPolicy') : t(STATUS_KEY[status])}
                    tone={pausedByPolicy ? 'red' : STATUS_TONE[status]}
                  />
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  {channels.map((ch) => {
                    const Icon = CHANNEL_ICON[ch] ?? Megaphone;
                    return (
                      <span key={ch} className="inline-flex items-center gap-1 rounded-md bg-surface-2 px-1.5 py-0.5 text-[10.5px] font-medium capitalize text-ink-2">
                        <Icon size={10} aria-hidden />
                        {ch}
                      </span>
                    );
                  })}
                  <AutonomyBadge level={(c.autonomyLevel as AutonomyLevel) ?? 'A2'} showLabel={false} />
                </div>
                {/* budget bar */}
                <div className="mt-3">
                  <div className="flex items-baseline justify-between text-[11.5px]">
                    <span className="text-ink-3">{t('cm.card.budget')}</span>
                    <span className="tnum text-ink-2">
                      {formatCAD(spent / 100, lang)} {t('cm.card.spent')} / {formatCAD(cap / 100, lang)} {t('cm.card.cap')}
                    </span>
                  </div>
                  <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-surface-2">
                    <motion.div
                      className="h-full rounded-full bg-ev-estimate"
                      initial={{ width: 0 }}
                      animate={{ width: `${pct}%` }}
                      transition={{ duration: 0.6, ease: 'easeOut' }}
                    />
                  </div>
                </div>
                <div className="tnum mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[11.5px] text-ink-3">
                  <span className="inline-flex items-center gap-1"><Users size={11} aria-hidden />{audienceSize(c.audience)} {t('cm.card.contacts')}</span>
                  {c.frequencyCapPerWeek && <span className="inline-flex items-center gap-1"><Gauge size={11} aria-hidden />{c.frequencyCapPerWeek}{t('cm.card.perWeek')}</span>}
                  {schedule?.startDate && <span className="inline-flex items-center gap-1"><CalendarRange size={11} aria-hidden />{schedule.startDate}</span>}
                </div>
                {pausedByPolicy && (
                  <p className="mt-2 flex items-start gap-1.5 text-[11.5px] text-ev-conflict">
                    <Lock size={11} className="mt-0.5 shrink-0" aria-hidden />
                    {t('cm.pausedPolicy.banner')}
                  </p>
                )}
              </motion.button>
            );
          })}
        </div>
      )}

      {/* detail drawer */}
      <CampaignDrawer campaignId={openId} onClose={() => setDrawerId(-1)} />

      {/* new campaign wizard */}
      <NewCampaignWizard open={wizardOpen} onClose={() => setWizardOpen(false)} />
    </div>
  );
}

/* ── campaign detail drawer ──────────────────────────────────────── */

function CampaignDrawer({ campaignId, onClose }: { campaignId: number | null; onClose: () => void }) {
  const { t, lang } = useActionsT();
  const { t: tShared } = useT();
  const utils = trpc.useUtils();
  const open = campaignId !== null && campaignId > 0;
  const detailQ = trpc.campaigns.byId.useQuery({ id: open ? campaignId : 0 }, { enabled: open });
  const [paused, setPaused] = useState(false);
  const [ended, setEnded] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [launchNote, setLaunchNote] = useState<string | null>(null);

  const campaign = detailQ.data?.campaign ?? null;
  const messages = useMemo(() => detailQ.data?.messages ?? [], [detailQ.data]);
  const pausedByPolicy = campaign ? campaign.name.toLowerCase().includes('investor') : false;

  const launch = trpc.campaigns.launch.useMutation({
    onSuccess: async (res) => {
      setLaunchNote(res.launched ? t('cm.launch.launched') : t('cm.launch.gated'));
      await utils.campaigns.list.invalidate();
      if (open) await utils.campaigns.byId.invalidate({ id: campaignId });
    },
    onError: (err) => setLaunchNote(err.message),
  });

  const sent = messages.filter((m) => m.status === 'sent').length;
  const blocked = messages.filter((m) => m.status === 'blocked' || m.status === 'failed');
  const queued = messages.filter((m) => m.status === 'queued' || m.status === 'draft');

  const gateChecks: GateCheck[] = [
    { id: 'tenant', label: 'Tenant', detail: 'hrl-001', status: 'pass' },
    { id: 'actor', label: 'Actor', detail: 'campaign-agent', status: 'pass' },
    { id: 'role', label: 'Role', detail: 'A3 bounded', status: 'pass' },
    { id: 'jurisdiction', label: 'Jurisdiction', detail: 'ON-TRESA', status: 'pass' },
    { id: 'brokerage', label: 'Brokerage policy', detail: 'pol-v2.3.1', status: 'pass' },
    { id: 'consent', label: 'CASL consent', detail: 'express only', status: 'pass' },
    { id: 'suppression', label: 'Suppression', detail: '0 hits', status: 'pass' },
    { id: 'purpose', label: 'Purpose', detail: 'seller-nurture', status: 'pass' },
    { id: 'approval-fresh', label: 'Approval freshness', detail: '26 h < 72 h', status: 'pass' },
    { id: 'data-fresh', label: 'Data freshness', detail: '1 h', status: 'pass' },
    { id: 'payload-bind', label: 'Payload↔destination', detail: 'comms:mock', status: 'pass' },
    { id: 'budget', label: 'Budget / frequency', detail: campaign ? `${formatCAD((campaign.budgetCapCents ?? 0) / 100, lang)} · ${campaign.frequencyCapPerWeek ?? 2}/wk` : undefined, status: 'pass' },
    { id: 'idempotency', label: 'Idempotency', detail: 'cm_* unique', status: 'pass' },
    { id: 'audit', label: 'Audit fields', detail: '14 fields', status: 'pass' },
  ];

  const schedule = campaign?.schedule as { startDate?: string; window?: string } | null;
  const channels = (campaign?.channels as string[] | null) ?? [];

  return (
    <AnimatePresence>
      {open && (
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
            aria-label={campaign?.name ?? t('cm.title')}
            className="fixed inset-y-0 right-0 z-50 flex w-[720px] max-w-[94vw] flex-col border-l border-line bg-paper shadow-lift"
            initial={{ x: 720 }}
            animate={{ x: 0 }}
            exit={{ x: 720 }}
            transition={{ type: 'spring', stiffness: 380, damping: 34 }}
          >
            <div className="flex shrink-0 items-center gap-3 border-b border-line bg-surface px-5 py-3.5">
              <p className="min-w-0 flex-1 truncate text-[15px] font-semibold text-ink">{campaign?.name ?? '…'}</p>
              {campaign && (
                <StatusPill
                  label={pausedByPolicy ? t('cm.status.pausedPolicy') : ended ? t('cm.status.completed') : paused ? t('cm.status.paused') : t(STATUS_KEY[campaign.status as CampaignStatus])}
                  tone={pausedByPolicy ? 'red' : paused || ended ? 'amber' : STATUS_TONE[campaign.status as CampaignStatus]}
                />
              )}
              <button type="button" onClick={onClose} aria-label="close" className="rounded-lg p-1.5 text-ink-3 hover:bg-surface-2 hover:text-ink">
                <X size={16} aria-hidden />
              </button>
            </div>

            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-5">
              {detailQ.isLoading ? (
                <div className="space-y-3">{[0, 1, 2].map((i) => <div key={i} className="h-32 animate-pulse rounded-xl bg-surface-2" />)}</div>
              ) : !campaign ? (
                <EmptyState title={t('cm.error.title')} description={t('cm.error.desc')} />
              ) : (
                <>
                  {pausedByPolicy && (
                    <Banner variant="escalation" title={t('cm.status.pausedPolicy')}>
                      {t('cm.pausedPolicy.banner')} {t('cm.pausedPolicy.rule')}{' '}
                      <code className="font-mono text-[11px]">CASL-SUP-002</code>
                    </Banner>
                  )}

                  <Banner variant="truthful">{t('cm.truthful')}</Banner>

                  {/* 1 · operating envelope */}
                  <motion.section
                    initial="hidden"
                    animate="show"
                    variants={{ show: { transition: { staggerChildren: 0.025 } } }}
                    className="rounded-xl border-2 border-accent/30 bg-surface p-4"
                  >
                    <div className="mb-1 flex items-center gap-2">
                      <Lock size={13} className="text-accent" aria-hidden />
                      <h3 className="text-[14px] font-semibold text-ink">{t('cm.drawer.bounds')}</h3>
                      <AutonomyBadge level={(campaign.autonomyLevel as AutonomyLevel) ?? 'A2'} />
                    </div>
                    <p className="mb-3 text-[12px] text-ink-3">{t('cm.drawer.boundsNote')}</p>
                    <dl className="grid gap-x-6 gap-y-2 sm:grid-cols-2">
                      {([
                        [t('cm.card.audience'), `${audienceSize(campaign.audience)} ${t('cm.drawer.audienceConsent')}`],
                        [t('cm.drawer.contentFamily'), campaign.contentFamily ?? '—'],
                        [t('cm.drawer.budgetCap'), formatCAD((campaign.budgetCapCents ?? 0) / 100, lang)],
                        [t('cm.drawer.frequencyCap'), `${campaign.frequencyCapPerWeek ?? '—'}${t('cm.drawer.perContact')}`],
                        [t('cm.drawer.scheduleWindow'), `${schedule?.startDate ?? '—'} · ${schedule?.window ?? t('cm.drawer.quietHours')}`],
                        [t('cm.drawer.channels'), channels.join(', ') || '—'],
                      ] as [string, string][]).map(([k, v]) => (
                        <motion.div key={k} variants={{ hidden: { opacity: 0, y: 4 }, show: { opacity: 1, y: 0 } }} className="flex items-baseline justify-between gap-2 border-b border-line py-1.5">
                          <dt className="text-[12px] text-ink-3">{k}</dt>
                          <dd className="truncate text-right font-mono text-[12px] text-ink">{v}</dd>
                        </motion.div>
                      ))}
                      <motion.div variants={{ hidden: { opacity: 0, y: 4 }, show: { opacity: 1, y: 0 } }} className="flex items-baseline justify-between gap-2 border-b border-line py-1.5">
                        <dt className="text-[12px] text-ink-3">{t('cm.drawer.suppression')}</dt>
                        <dd className="flex items-center gap-1 font-mono text-[12px] text-ink">
                          supp_2025-06@3fa1…
                          <span title={t('cm.blocked.suppression')}><Lock size={11} className="text-ink-3" aria-hidden /></span>
                        </dd>
                      </motion.div>
                    </dl>
                  </motion.section>

                  {/* 2 · performance strip */}
                  <section className="ns-card p-4">
                    <h3 className="mb-3 text-[13px] font-semibold text-ink">{t('cm.drawer.performance')}</h3>
                    <div className="grid grid-cols-5 gap-2">
                      {([
                        [t('cm.perf.sent'), String(sent)],
                        [t('cm.perf.delivered'), String(sent)],
                        [t('cm.perf.opened'), '47%'],
                        [t('cm.perf.replied'), '6'],
                        [t('cm.perf.unsubscribed'), '3'],
                      ] as [string, string][]).map(([k, v]) => (
                        <div key={k} className="rounded-lg bg-surface-2 p-2.5 text-center">
                          <p className="tnum text-[18px] font-semibold leading-6 text-ink" style={{ fontFamily: '"Source Serif 4", Georgia, serif' }}>{v}</p>
                          <p className="text-[10.5px] text-ink-3">{k}</p>
                        </div>
                      ))}
                    </div>
                    <p className="mt-2 flex items-center gap-1.5 text-[11px] text-ink-3">
                      <EvidenceChip state="verified" label={t('cm.perf.autoSuppressed')} animate={false} />
                      {t('cm.blocked.suppression')}
                    </p>
                  </section>

                  {/* 3 · content variants */}
                  <section className="ns-card p-4">
                    <h3 className="mb-2 text-[13px] font-semibold text-ink">{t('cm.drawer.content')}</h3>
                    <ul className="space-y-2">
                      {[
                        { name: 'Seminar follow-up — EN', status: 'approved' as const },
                        { name: 'Suivi du séminaire — fr-CA', status: 'approved' as const },
                        { name: 'Valuation-update variant B — EN', status: 'draft' as const },
                      ].map((v) => (
                        <li key={v.name} className="flex items-center gap-2 rounded-lg border border-line bg-surface-2 px-3 py-2">
                          <EvidenceChip state="generated" animate={false} />
                          <span className="min-w-0 flex-1 truncate text-[12.5px] text-ink">{v.name}</span>
                          <StatusPill label={v.status === 'approved' ? t('ll.variants.approved') : t('ll.variants.draft')} tone={v.status === 'approved' ? 'emerald' : 'violet'} />
                        </li>
                      ))}
                    </ul>
                    <p className="mt-2 flex items-center gap-1.5 text-[11px] text-ink-3">
                      <Lock size={10} aria-hidden />
                      Brokerage ID + unsubscribe line are compliance-mandated and locked in every rendered message.
                    </p>
                  </section>

                  {/* 4 · audience panel with waterfall */}
                  <section className="ns-card p-4">
                    <h3 className="mb-3 text-[13px] font-semibold text-ink">{t('cm.drawer.audiencePanel')}</h3>
                    <div className="mb-2 flex flex-wrap gap-1.5">
                      <EvidenceChip state="verified" label="Attended seminar May 30" animate={false} />
                      <EvidenceChip state="verified" label="Express consent valid" animate={false} />
                      <EvidenceChip state="verified" label="Not on DNCL / suppression" animate={false} />
                    </div>
                    <ul className="space-y-1.5">
                      {[
                        { label: 'All contacts', count: 1204 },
                        { label: 'Attended seminar May 30', count: 538 },
                        { label: 'Express consent valid', count: 449 },
                        { label: 'Not suppressed', count: audienceSize(campaign.audience) || 412 },
                      ].map((row, i) => (
                        <li key={row.label} className="flex items-center gap-3">
                          <span className="w-44 truncate text-[11.5px] text-ink-2">{row.label}</span>
                          <div className="h-3 flex-1 overflow-hidden rounded-full bg-surface-2">
                            <motion.div
                              className="h-full rounded-full bg-accent/70"
                              initial={{ width: 0 }}
                              animate={{ width: `${(row.count / 1204) * 100}%` }}
                              transition={{ duration: 0.4, delay: i * 0.1, ease: 'easeOut' }}
                            />
                          </div>
                          <span className="tnum w-10 text-right text-[11.5px] font-medium text-ink">{row.count}</span>
                        </li>
                      ))}
                    </ul>
                  </section>

                  {/* 5 · policy & audit + send log */}
                  <section className="ns-card p-4">
                    <h3 className="mb-3 text-[13px] font-semibold text-ink">{t('cm.drawer.policyAudit')}</h3>
                    <PolicyGatePanel checks={gateChecks} />
                    <div className="mt-4">
                      <div className="mb-2 flex items-center justify-between">
                        <p className="ns-meta">{t('cm.drawer.sendLog')}</p>
                        <Link to="/audit" className="text-[11.5px] font-medium text-accent hover:underline">{tShared('misc.viewAudit')}</Link>
                      </div>
                      {messages.length === 0 ? (
                        <p className="text-[12px] text-ink-3">—</p>
                      ) : (
                        <table className="w-full text-left">
                          <thead>
                            <tr className="border-b border-line text-[10.5px] uppercase tracking-[0.04em] text-ink-3">
                              <th scope="col" className="py-1 pr-2 font-medium">{t('cm.drawer.idempotency')}</th>
                              <th scope="col" className="py-1 pr-2 font-medium">{t('cm.card.schedule')}</th>
                              <th scope="col" className="py-1 pr-2 font-medium">{t('cm.drawer.policyDecision')}</th>
                              <th scope="col" className="py-1 text-right font-medium">status</th>
                            </tr>
                          </thead>
                          <tbody>
                            {messages.map((m) => (
                              <tr key={m.id} className="border-b border-line last:border-0">
                                <td className="py-1.5 pr-2"><code className="font-mono text-[11px] text-ink-2">{m.idempotencyKey}</code></td>
                                <td className="tnum py-1.5 pr-2 text-[11.5px] text-ink-3">
                                  {m.sentAt ? new Date(m.sentAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : '—'}
                                </td>
                                <td className="py-1.5 pr-2"><code className="font-mono text-[11px] text-ink-3">{m.policyDecisionId ? `pol_${m.policyDecisionId}` : 'pending'}</code></td>
                                <td className="py-1.5 text-right">
                                  {m.status === 'blocked' || m.status === 'failed' ? (
                                    <StatusPill label={t('cm.blocked.send.consent')} tone="red" />
                                  ) : (
                                    <StatusPill label={m.status} tone={m.status === 'sent' ? 'emerald' : 'neutral'} />
                                  )}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      )}
                      {blocked.length > 0 && (
                        <div className="mt-2 space-y-1">
                          {blocked.map((m) => (
                            <p key={m.id} className="flex items-start gap-1.5 text-[11.5px] text-ev-conflict">
                              <Lock size={11} className="mt-0.5 shrink-0" aria-hidden />
                              <code className="font-mono">{m.idempotencyKey}</code> — {t('cm.blocked.send.consent')} / {t('cm.blocked.send.suppressed')}
                            </p>
                          ))}
                        </div>
                      )}
                      {queued.length > 0 && (
                        <p className="tnum mt-2 text-[11px] text-ink-3">{queued.length} queued · {t('cm.truthful')}</p>
                      )}
                    </div>
                  </section>

                  {/* launch result note */}
                  {launchNote && (
                    <Banner variant="info">{launchNote}</Banner>
                  )}

                  {/* 6 · controls */}
                  <section className="ns-card flex flex-wrap items-center gap-2 p-4">
                    {(campaign.status === 'pending_approval' || campaign.status === 'draft') && (
                      <button
                        type="button"
                        onClick={() => launch.mutate({ id: campaign.id })}
                        disabled={launch.isPending}
                        className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-accent px-3 text-[12.5px] font-medium text-white hover:bg-accent-hover disabled:opacity-50"
                      >
                        <Play size={12} aria-hidden />
                        {t('act.requestApproval')}
                      </button>
                    )}
                    {pausedByPolicy ? (
                      <BlockedAction label={t('cm.controls.resume')} reason={t('cm.blocked.resume')} />
                    ) : paused ? (
                      <button
                        type="button"
                        onClick={() => { setPaused(false); setToast(null); }}
                        className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-line px-3 text-[12.5px] font-medium text-ink-2 hover:border-line-strong"
                      >
                        <Play size={12} aria-hidden />
                        {t('cm.controls.resume')}
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => { setPaused(true); setToast(t('cm.paused.toast')); }}
                        className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-line px-3 text-[12.5px] font-medium text-ink-2 hover:border-line-strong"
                      >
                        <Pause size={12} aria-hidden />
                        {t('cm.controls.pause')}
                      </button>
                    )}
                    <Link
                      to="/approvals"
                      title={t('cm.editBounds.note')}
                      className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-line px-3 text-[12.5px] font-medium text-ink-2 hover:border-line-strong"
                    >
                      <PencilLine size={12} aria-hidden />
                      {t('cm.controls.editBounds')}
                    </Link>
                    {!ended && (
                      <button
                        type="button"
                        onClick={() => setEnded(true)}
                        className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-ev-conflict/40 px-3 text-[12.5px] font-medium text-ev-conflict hover:bg-[#C2492B]/10"
                      >
                        <OctagonX size={12} aria-hidden />
                        {t('cm.controls.end')}
                      </button>
                    )}
                    <AnimatePresence>
                      {toast && (
                        <motion.span
                          initial={{ opacity: 0, y: 8 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: 8 }}
                          className="inline-flex items-center gap-2 rounded-lg bg-surface-2 px-3 py-1.5 text-[12px] text-ink-2"
                          role="status"
                        >
                          {toast}
                          <button type="button" onClick={() => { setPaused(false); setToast(null); }} className="inline-flex items-center gap-1 font-medium text-accent hover:underline">
                            <Undo2 size={11} aria-hidden />
                            {t('cm.undo')}
                          </button>
                        </motion.span>
                      )}
                    </AnimatePresence>
                  </section>
                </>
              )}
            </div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}

/* ── new campaign wizard ─────────────────────────────────────────── */

function NewCampaignWizard({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t, lang } = useActionsT();
  const [step, setStep] = useState(0);
  const [audience, setAudience] = useState('');
  const [family, setFamily] = useState('');
  const [budget, setBudget] = useState('1500');
  const [freq, setFreq] = useState('2');
  const [schedWindow, setSchedWindow] = useState('10:00-16:00 weekdays');
  const [channel, setChannel] = useState<'email' | 'sms'>('email');

  const steps: ActionsKey[] = ['cm.wizard.step1', 'cm.wizard.step2', 'cm.wizard.step3', 'cm.wizard.step4'];
  const budgetNum = Number(budget) || 0;

  const gatePreview: GateCheck[] = [
    { id: 'consent', label: 'CASL consent', detail: 'express only', status: audience ? 'pass' : 'na' },
    { id: 'suppression', label: 'Suppression', detail: '0 hits', status: 'pass' },
    { id: 'budget', label: 'Budget / frequency', detail: `$${budgetNum || '—'} · ${freq}/wk`, status: budgetNum > 0 ? 'pass' : 'fail' },
    { id: 'payload-bind', label: 'Payload↔destination', detail: 'comms:mock', status: 'pass' },
    { id: 'idempotency', label: 'Idempotency', detail: 'auto per contact', status: 'pass' },
  ];

  const close = () => {
    setStep(0);
    onClose();
  };

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            className="fixed inset-0 z-40 bg-ink/20"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            onClick={close}
            aria-hidden
          />
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label={t('cm.wizard.title')}
            className="fixed left-1/2 top-1/2 z-50 w-[640px] max-w-[94vw] -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-line bg-surface p-5 shadow-lift"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 16 }}
            transition={{ duration: 0.2 }}
          >
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-[16px] font-semibold text-ink">{t('cm.wizard.title')}</h2>
              <button type="button" onClick={close} aria-label="close" className="rounded-lg p-1.5 text-ink-3 hover:bg-surface-2 hover:text-ink">
                <X size={16} aria-hidden />
              </button>
            </div>

            {/* step indicator */}
            <ol className="mb-5 flex items-center gap-2">
              {steps.map((key, i) => (
                <li key={key} className="flex items-center gap-2">
                  <span
                    className={cn(
                      'flex h-6 w-6 items-center justify-center rounded-full border text-[11px] font-semibold',
                      i < step && 'border-accent bg-accent text-white',
                      i === step && 'border-accent bg-accent-tint text-accent',
                      i > step && 'border-line bg-surface-2 text-ink-3',
                    )}
                  >
                    {i + 1}
                  </span>
                  <span className={cn('hidden text-[11.5px] sm:inline', i === step ? 'font-medium text-ink' : 'text-ink-3')}>{t(key)}</span>
                  {i < steps.length - 1 && <span className="h-px w-5 bg-line-strong" aria-hidden />}
                </li>
              ))}
            </ol>

            <div className="grid gap-4 sm:grid-cols-[1fr_220px]">
              {/* step body */}
              <AnimatePresence mode="wait">
                <motion.div
                  key={step}
                  initial={{ opacity: 0, x: 24 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -24 }}
                  transition={{ duration: 0.2 }}
                  className="min-h-[220px]"
                >
                  {step === 0 && (
                    <label className="block">
                      <span className="ns-meta">{t('cm.wizard.step1')}</span>
                      <textarea
                        value={audience}
                        onChange={(e) => setAudience(e.target.value)}
                        placeholder={t('cm.wizard.audiencePlaceholder')}
                        rows={4}
                        className="mt-1.5 w-full rounded-lg border border-line bg-surface px-3 py-2 text-[13px] text-ink placeholder:text-ink-3 focus:outline-none focus:ring-2 focus:ring-accent"
                      />
                      <span className="mt-1 block text-[11px] text-ink-3">{t('cm.drawer.audienceConsent')}</span>
                    </label>
                  )}
                  {step === 1 && (
                    <label className="block">
                      <span className="ns-meta">{t('cm.wizard.step2')}</span>
                      <input
                        value={family}
                        onChange={(e) => setFamily(e.target.value)}
                        placeholder={t('cm.wizard.familyPlaceholder')}
                        className="mt-1.5 h-9 w-full rounded-lg border border-line bg-surface px-3 font-mono text-[13px] text-ink placeholder:text-ink-3 focus:outline-none focus:ring-2 focus:ring-accent"
                      />
                      <span className="mt-2 block"><EvidenceChip state="generated" animate={false} /></span>
                    </label>
                  )}
                  {step === 2 && (
                    <div className="space-y-3">
                      <div className="grid grid-cols-2 gap-3">
                        <label className="block">
                          <span className="ns-meta">{t('cm.drawer.budgetCap')} ($)</span>
                          <input value={budget} onChange={(e) => setBudget(e.target.value)} inputMode="numeric" className="mt-1 h-9 w-full rounded-lg border border-line bg-surface px-3 font-mono text-[13px] text-ink focus:outline-none focus:ring-2 focus:ring-accent" />
                        </label>
                        <label className="block">
                          <span className="ns-meta">{t('cm.drawer.frequencyCap')}</span>
                          <input value={freq} onChange={(e) => setFreq(e.target.value)} inputMode="numeric" className="mt-1 h-9 w-full rounded-lg border border-line bg-surface px-3 font-mono text-[13px] text-ink focus:outline-none focus:ring-2 focus:ring-accent" />
                        </label>
                      </div>
                      <label className="block">
                        <span className="ns-meta">{t('cm.drawer.scheduleWindow')}</span>
                        <input value={schedWindow} onChange={(e) => setSchedWindow(e.target.value)} className="mt-1 h-9 w-full rounded-lg border border-line bg-surface px-3 font-mono text-[13px] text-ink focus:outline-none focus:ring-2 focus:ring-accent" />
                      </label>
                      <div role="group" aria-label={t('cm.drawer.channels')} className="flex gap-1.5">
                        {(['email', 'sms'] as const).map((ch) => (
                          <button
                            key={ch}
                            type="button"
                            onClick={() => setChannel(ch)}
                            aria-pressed={channel === ch}
                            className={cn('h-8 rounded-lg border px-3 text-[12.5px] font-medium capitalize', channel === ch ? 'border-accent bg-accent-tint text-accent' : 'border-line text-ink-2 hover:border-line-strong')}
                          >
                            {ch}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                  {step === 3 && (
                    <div>
                      <PolicyGatePanel checks={gatePreview} />
                      <p className="mt-2 font-mono text-[11px] text-ink-3">
                        payload → comms:mock · hash sha256:{family ? family.slice(0, 4) : '····'}…{String(budgetNum).padStart(4, '0').slice(-4)}
                      </p>
                    </div>
                  )}
                </motion.div>
              </AnimatePresence>

              {/* envelope preview */}
              <aside className="rounded-xl border-2 border-accent/30 bg-paper p-3">
                <p className="ns-meta mb-2 flex items-center gap-1"><Lock size={10} aria-hidden />{t('cm.wizard.envelope')}</p>
                <dl className="space-y-1.5 text-[11.5px]">
                  <div><dt className="text-ink-3">{t('cm.card.audience')}</dt><dd className="truncate font-medium text-ink">{audience || '—'}</dd></div>
                  <div><dt className="text-ink-3">{t('cm.drawer.contentFamily')}</dt><dd className="truncate font-mono text-ink">{family || '—'}</dd></div>
                  <div><dt className="text-ink-3">{t('cm.drawer.budgetCap')}</dt><dd className="tnum font-medium text-ink">{budgetNum ? formatCAD(budgetNum, lang) : '—'}</dd></div>
                  <div><dt className="text-ink-3">{t('cm.drawer.frequencyCap')}</dt><dd className="tnum font-medium text-ink">{freq}{t('cm.drawer.perContact')}</dd></div>
                  <div><dt className="text-ink-3">{t('cm.drawer.scheduleWindow')}</dt><dd className="font-medium text-ink">{schedWindow || '—'}</dd></div>
                  <div><dt className="text-ink-3">{t('cm.drawer.channels')}</dt><dd className="font-medium capitalize text-ink">{channel}</dd></div>
                </dl>
              </aside>
            </div>

            {/* footer */}
            <div className="mt-5 flex items-center justify-between border-t border-line pt-4">
              <button
                type="button"
                onClick={() => setStep((s) => Math.max(0, s - 1))}
                disabled={step === 0}
                className="h-9 rounded-lg border border-line px-3 text-[13px] font-medium text-ink-2 hover:border-line-strong disabled:opacity-40"
              >
                {t('cm.wizard.back')}
              </button>
              {step < 3 ? (
                <button
                  type="button"
                  onClick={() => setStep((s) => s + 1)}
                  className="h-9 rounded-lg bg-accent px-4 text-[13px] font-medium text-white hover:bg-accent-hover"
                >
                  {t('cm.wizard.next')}
                </button>
              ) : (
                <BlockedAction label={t('cm.wizard.requestApproval')} reason={t('cm.blocked.submit')} />
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
