import { useState } from 'react';
import { Link, useParams } from 'react-router';
import { AnimatePresence, motion } from 'framer-motion';
import { addDays, endOfMonth, endOfWeek, format, formatDistanceToNowStrict, isSameDay, isSameMonth, startOfMonth, startOfWeek } from 'date-fns';
import {
  AlertTriangle, BadgeCheck, CalendarDays, CheckCircle2, ChevronDown, FileText,
  FileWarning, KeyRound, RefreshCw, Send, Upload, Users, Workflow,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useOps } from '@/lib/i18n/ops';
import type { OpsKey } from '@/lib/i18n/ops';
import { formatCAD } from '@/lib/i18n';
import { trpc } from '@/providers/trpc';
import { Banner } from '@/components/evidence/Banner';
import { BlockedAction } from '@/components/evidence/BlockedAction';
import { EvidenceChip } from '@/components/evidence/EvidenceChip';
import type { EvidenceState } from '@/components/evidence/EvidenceChip';
import { StatusPill } from '@/components/evidence/StatusPill';
import type { StatusTone } from '@/components/evidence/StatusPill';
import { TimelineItem } from '@/components/evidence/TimelineItem';
import { EmptyState } from '@/components/evidence/EmptyState';

function useTxn(id: number) {
  return trpc.transactions.byId.useQuery({ id }, { retry: 1, enabled: Number.isFinite(id) });
}
type ById = NonNullable<ReturnType<typeof useTxn>['data']>;
type Task = ById['tasks'][number];

const TASK_TONE: Record<string, StatusTone> = {
  pending: 'neutral',
  in_progress: 'amber',
  done: 'emerald',
  waived: 'slate',
};

function taskEvidence(task: Task): EvidenceState {
  if (task.status === 'done') return 'verified';
  if (task.kind.startsWith('fintrac')) return 'external';
  if (task.status === 'in_progress') return 'external';
  return 'assumption';
}

function ownerLabel(role: string | null, t: (k: OpsKey) => string): string {
  switch (role) {
    case 'transaction_coordinator': return t('tl.role.transaction_coordinator');
    case 'buyer_rep': return t('tl.role.buyer_rep');
    case 'fintrac_officer': return t('tl.role.fintrac_officer');
    case 'lawyer': return t('tl.role.lawyer');
    default: return t('tl.role.registrant');
  }
}

/* ── Page ──────────────────────────────────────────────────────────── */

export default function TransactionTimeline() {
  const { t, lang, dfLocale } = useOps();
  const params = useParams();
  const id = Number(params.id);
  const q = useTxn(id);
  const props = trpc.properties.list.useQuery(undefined, { retry: 1 });
  const utils = trpc.useUtils();

  const wfId = q.data?.workflow?.id ?? null;
  const wfQ = trpc.workflows.byId.useQuery({ id: wfId ?? 0 }, { enabled: wfId != null, retry: 1 });

  const restart = trpc.workflows.simulateRestart.useMutation({
    onSuccess: () => {
      utils.transactions.byId.invalidate({ id });
      if (wfId != null) utils.workflows.byId.invalidate({ id: wfId });
    },
  });
  const completeTask = trpc.transactions.completeTask.useMutation({
    onSuccess: () => utils.transactions.byId.invalidate({ id }),
  });

  if (q.isLoading) {
    return (
      <div className="p-6" aria-busy="true">
        <div className="mb-4 h-8 w-72 animate-pulse rounded-lg bg-surface-2" />
        <div className="mb-3 grid grid-cols-4 gap-3">
          {Array.from({ length: 4 }, (_, i) => <div key={i} className="h-20 animate-pulse rounded-xl bg-surface-2" />)}
        </div>
        <div className="h-96 animate-pulse rounded-xl bg-surface-2" />
      </div>
    );
  }

  if (q.isError || !q.data) {
    return (
      <div className="p-6">
        <div className="rounded-xl border border-ev-conflict/40 bg-surface p-4">
          <p className="flex items-center gap-2 text-[14px] font-semibold text-ev-conflict">
            <FileWarning size={15} aria-hidden /> {t('ops.errorTitle')}
          </p>
          <p className="mt-1 text-[13px] text-ink-2">{t('ops.errorBody')}</p>
          <button type="button" onClick={() => q.refetch()} className="mt-2 rounded-lg border border-line px-3 py-1 text-[12px] font-medium text-accent hover:bg-accent-tint">
            {t('ops.retry')}
          </button>
        </div>
      </div>
    );
  }

  const { transaction: txn, tasks, health, workflow } = q.data;
  const property = props.data?.find((p) => p.id === txn.propertyId);
  const address = property ? `${property.addressLine1}, ${property.city}` : `#${txn.propertyId}`;
  const events = wfQ.data?.events ?? [];
  const outbox = wfQ.data?.outbox ?? [];
  const firm = txn.status === 'firm' || txn.status === 'closed' || txn.status === 'lawyer_handoff';
  const lastEvent = events.length ? new Date(events[events.length - 1].createdAt) : null;

  return (
    <div className="p-6">
      {/* Header */}
      <header className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-[22px] font-semibold leading-7 tracking-[-0.01em] text-ink">
            {t('tl.title')} — {address}
          </h1>
          <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-ink-3">
            <span>{t('txns.seller')}: {txn.sellerName ?? '—'}</span>
            <span>{t('txns.buyer')}: {txn.buyerName ?? '—'}</span>
            {txn.acceptedPrice != null && (
              <span className="tnum text-ink-2">
                {formatCAD(txn.acceptedPrice, lang)}
                {txn.acceptedAt && ` · ${t('tl.acceptedOn', { date: format(new Date(txn.acceptedAt), 'd MMM', { locale: dfLocale }) })}`}
              </span>
            )}
            <StatusPill label={t(`txn.status.${txn.status}` as OpsKey)} tone={firm ? 'emerald' : txn.status === 'collapsed' ? 'red' : 'amber'} />
          </p>
        </div>

        {/* Durable-workflow badge (signature element) */}
        {workflow && (
          <motion.div
            layout
            className={cn(
              'w-full max-w-sm rounded-xl border p-3 shadow-card transition-colors sm:w-auto',
              restart.isPending ? 'border-line-strong bg-surface-2' : 'border-ev-verified/40 bg-surface',
            )}
          >
            <p className="flex items-center gap-1.5 text-[13px] font-semibold text-ink">
              <Workflow size={14} className={restart.isPending ? 'text-ink-3' : 'text-ev-verified'} aria-hidden />
              <span className="font-mono text-[12px]">txn_wf #{workflow.id}@v{workflow.version}</span>
            </p>
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
              {restart.isPending ? (
                <StatusPill label={t('tl.wf.restarting')} tone="neutral" />
              ) : (
                <EvidenceChip state="verified" label={t('tl.wf.durable')} />
              )}
              <StatusPill label={t('tl.wf.events', { n: events.length })} tone="slate" />
              <StatusPill label={t('tl.wf.idempotent')} tone="emerald" />
            </div>
            <p className="tnum mt-1 text-[11px] text-ink-3">
              {lastEvent ? formatDistanceToNowStrict(lastEvent, { locale: dfLocale, addSuffix: true }) : ''}
              {workflow.currentStep ? ` · ${workflow.currentStep}` : ''}
            </p>
            <button
              type="button"
              disabled={restart.isPending}
              onClick={() => restart.mutate({ id: workflow.id })}
              className="mt-2 inline-flex h-7 items-center gap-1.5 rounded-lg border border-line px-2.5 text-[12px] font-medium text-ink-2 hover:bg-surface-2 disabled:opacity-60"
            >
              <RefreshCw size={12} className={cn(restart.isPending && 'motion-safe:animate-spin')} aria-hidden />
              {t('tl.wf.simulate')}
            </button>
          </motion.div>
        )}
      </header>

      {/* Restart-resume recovery banner */}
      <AnimatePresence>
        {restart.isSuccess && (
          <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
            <Banner variant="info" className="mb-3 border-ev-verified/40 bg-ev-verified/5" title={t('tl.wf.proof.title')}>
              <span className="flex flex-wrap items-center gap-1.5">
                <BadgeCheck size={14} className="text-ev-verified" aria-hidden />
                {t('tl.wf.resumed', {
                  steps: restart.data.resumedSteps.length,
                  effects: restart.data.newEffectsEnqueued,
                  dup: restart.data.duplicateSends,
                })}
                <EvidenceChip state="verified" animate={false} />
              </span>
            </Banner>
          </motion.div>
        )}
      </AnimatePresence>

      {firm && (
        <Banner variant="info" className="mb-3 border-ev-verified/40 bg-ev-verified/5">{t('tl.firmBanner')}</Banner>
      )}

      {/* Health strip */}
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <HealthTile label={t('tl.health.conditions')} value={String(health.conditionsRemaining)} tone="amber" />
        <HealthTile
          label={t('tl.health.nextDeadline')}
          value={health.nextDeadline ? formatDistanceToNowStrict(new Date(health.nextDeadline.dueAt), { locale: dfLocale, addSuffix: true }) : '—'}
          sub={health.nextDeadline?.title}
          tone="amber"
        />
        <HealthTile label={t('tl.health.documents')} value={health.docsComplete} tone="accent" />
        <HealthTile label={t('tl.health.exceptions')} value={String(health.exceptions.length)} tone={health.exceptions.length ? 'red' : 'emerald'} />
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        {/* Left: master timeline + exceptions */}
        <div className="space-y-4 xl:col-span-2">
          <section className="rounded-xl border border-line bg-surface p-4 shadow-card">
            <h2 className="mb-3 text-[15px] font-semibold text-ink">{t('tl.timeline')}</h2>
            {tasks.length === 0 ? (
              <EmptyState title={t('ops.empty')} />
            ) : (
              <ul>
                {tasks.map((task, i) => (
                  <motion.li key={task.id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}>
                    <div className="flex items-start gap-2">
                      <div className="min-w-0 flex-1">
                        <TimelineItem
                          title={task.title}
                          actor={{ kind: 'human', name: ownerLabel(task.ownerRole, t) }}
                          timestamp={task.dueAt ? format(new Date(task.dueAt), 'EEE d MMM · HH:mm', { locale: dfLocale }) : '—'}
                          evidenceState={taskEvidence(task)}
                          isLast={i === tasks.length - 1 && task.status === 'done'}
                          detail={`kind: ${task.kind} · status: ${t(`tl.task.${task.status}` as OpsKey)}${task.completedAt ? ` · done ${format(new Date(task.completedAt), 'd MMM HH:mm', { locale: dfLocale })}` : ''}`}
                        />
                      </div>
                      <div className="flex shrink-0 flex-col items-end gap-1 pt-0.5">
                        <StatusPill label={t(`tl.task.${task.status}` as OpsKey)} tone={TASK_TONE[task.status]} />
                        {(task.status === 'pending' || task.status === 'in_progress') && (
                          <button
                            type="button"
                            disabled={completeTask.isPending}
                            onClick={() => completeTask.mutate({ taskId: task.id })}
                            className="rounded-md border border-accent/40 bg-accent-tint px-1.5 py-0.5 text-[10.5px] font-medium text-accent hover:bg-accent-tint/70 disabled:opacity-50"
                          >
                            {t('tl.markDone')}
                          </button>
                        )}
                      </div>
                    </div>
                  </motion.li>
                ))}
              </ul>
            )}
          </section>

          {/* Exception alerts */}
          {health.exceptions.length > 0 && (
            <section className="space-y-3" aria-live="polite">
              <h2 className="text-[15px] font-semibold text-ink">{t('tl.exceptions.title')}</h2>
              {health.exceptions.map((ex, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, boxShadow: '0 0 0 0 rgba(194,73,43,0.4)' }}
                  animate={{ opacity: 1, boxShadow: '0 0 0 3px rgba(194,73,43,0)' }}
                  transition={{ duration: 0.6 }}
                  className="rounded-xl border border-ev-conflict/50 bg-surface p-4 shadow-card"
                >
                  <p className="flex items-start gap-2 text-[13px] font-semibold text-ev-conflict">
                    <AlertTriangle size={15} className="mt-0.5 shrink-0" aria-hidden /> {ex.title}
                  </p>
                  <p className="mt-1 text-[13px] text-ink-2">{ex.reason}</p>
                  <p className="mt-1.5 text-[12px] text-ink-3">{t('tl.exceptions.escalated')}</p>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <Link to="/conversations" className="rounded-lg border border-line px-2.5 py-1 text-[12px] font-medium text-ink-2 hover:bg-surface-2">
                      {t('tl.exceptions.openConversation')}
                    </Link>
                    <BlockedAction label={t('tl.exceptions.logOutcome')} reason={t('tl.exceptions.blocked')} />
                  </div>
                </motion.div>
              ))}
            </section>
          )}

          {/* Closing checklist (ghosted until firm) */}
          <ClosingChecklist firm={firm} tasks={tasks} />
        </div>

        {/* Right rail */}
        <aside className="space-y-3">
          <DeadlineCalendar tasks={tasks} closingAt={txn.closingAt ? new Date(txn.closingAt) : null} />
          <DocumentChecklist tasks={tasks} />
          <OwnersCard tasks={tasks} />
          <ClientUpdateCard />
          <WorkflowLogCard
            events={events}
            outbox={outbox}
            restartProof={restart.isSuccess ? restart.data : null}
          />
        </aside>
      </div>
    </div>
  );
}

/* ── Health tile ───────────────────────────────────────────────────── */

function HealthTile({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone: StatusTone }) {
  const dot: Record<StatusTone, string> = {
    neutral: 'bg-ink-3', accent: 'bg-accent', emerald: 'bg-ev-verified',
    amber: 'bg-ev-estimate', red: 'bg-ev-conflict', slate: 'bg-ev-external', violet: 'bg-ev-generated',
  };
  return (
    <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="rounded-xl border border-line bg-surface p-3 shadow-card">
      <p className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-[0.04em] text-ink-3">
        <span className={cn('h-1.5 w-1.5 rounded-full', dot[tone])} aria-hidden /> {label}
      </p>
      <p className="tnum mt-1 truncate text-[18px] font-semibold text-ink" title={sub}>{value}</p>
      {sub && <p className="truncate text-[11px] text-ink-3">{sub}</p>}
    </motion.div>
  );
}

/* ── Deadline calendar (mini month with deadline diamonds) ─────────── */

function DeadlineCalendar({ tasks, closingAt }: { tasks: Task[]; closingAt: Date | null }) {
  const { t, dfLocale } = useOps();
  const deadlines = tasks
    .filter((x) => x.dueAt && x.status !== 'done' && x.status !== 'waived')
    .map((x) => ({ title: x.title, due: new Date(x.dueAt!), kind: x.kind }))
    .sort((a, b) => a.due.getTime() - b.due.getTime());
  const anchor = deadlines[0]?.due ?? closingAt ?? new Date();
  const start = startOfWeek(startOfMonth(anchor), { weekStartsOn: 1 });
  const end = endOfWeek(endOfMonth(anchor), { weekStartsOn: 1 });
  const cells: Date[] = [];
  for (let d = start; d <= end; d = addDays(d, 1)) cells.push(d);
  const hasDeadline = (d: Date) => deadlines.some((x) => isSameDay(x.due, d));

  return (
    <div className="rounded-xl border border-line bg-surface p-3 shadow-card">
      <h3 className="mb-2 flex items-center gap-1.5 text-[13px] font-semibold text-ink">
        <CalendarDays size={13} className="text-accent" aria-hidden /> {t('tl.deadlines')}
      </h3>
      <p className="mb-1 text-[11px] font-medium capitalize text-ink-3">{format(anchor, 'LLLL yyyy', { locale: dfLocale })}</p>
      <div className="grid grid-cols-7 gap-0.5">
        {cells.map((d) => (
          <span
            key={d.toISOString()}
            className={cn(
              'tnum relative rounded py-0.5 text-center text-[11px]',
              !isSameMonth(d, anchor) && 'text-ink-3/50',
              hasDeadline(d) && 'bg-[#9A6A1B]/10 font-semibold text-ev-estimate',
            )}
          >
            {format(d, 'd')}
            {hasDeadline(d) && <span className="absolute -top-0.5 right-0.5 h-1.5 w-1.5 rotate-45 bg-ev-estimate" aria-hidden />}
          </span>
        ))}
      </div>
      <ul className="mt-2 space-y-1">
        {deadlines.slice(0, 4).map((x, i) => (
          <li key={i} className="flex items-center gap-1.5 text-[12px] text-ink-2">
            <span className="h-1.5 w-1.5 shrink-0 rotate-45 bg-ev-estimate" aria-hidden />
            <span className="min-w-0 flex-1 truncate">{x.title}</span>
            <span className="tnum shrink-0 text-[11px] text-ink-3">{format(x.due, 'd MMM · HH:mm', { locale: dfLocale })}</span>
          </li>
        ))}
        {closingAt && (
          <li className="flex items-center gap-1.5 text-[12px] text-ink-2">
            <KeyRound size={11} className="shrink-0 text-accent" aria-hidden />
            <span className="min-w-0 flex-1 truncate">{t('txn.status.closed')}</span>
            <span className="tnum shrink-0 text-[11px] text-ink-3">{format(closingAt, 'd MMM', { locale: dfLocale })}</span>
          </li>
        )}
      </ul>
    </div>
  );
}

/* ── Document checklist (derived from real tasks) ──────────────────── */

interface DocEntry { name: string; status: 'received' | 'requested' | 'missing' }

function deriveDocs(tasks: Task[]): DocEntry[] {
  const docs: DocEntry[] = [];
  const byStatus = (task: Task): DocEntry['status'] =>
    task.status === 'done' ? 'received' : task.status === 'in_progress' ? 'requested' : 'missing';
  for (const task of tasks) {
    switch (task.kind) {
      case 'deposit':
        docs.push({ name: 'Deposit receipt', status: byStatus(task) });
        break;
      case 'fintrac_receipt_of_funds':
        docs.push({ name: 'FINTRAC receipt-of-funds record', status: byStatus(task) });
        break;
      case 'fintrac_idv':
        docs.push({ name: 'ID verification record', status: byStatus(task) });
        break;
      case 'condition':
        if (/inspect/i.test(task.title)) docs.push({ name: 'Inspection report', status: byStatus(task) });
        else docs.push({ name: `Waiver / fulfilment — ${task.title}`, status: byStatus(task) });
        break;
      case 'lawyer_handoff':
        docs.push({ name: 'Executed APS + amendments', status: byStatus(task) });
        break;
      case 'document':
        docs.push({ name: task.title, status: byStatus(task) });
        break;
      default:
        break;
    }
  }
  return docs;
}

function DocumentChecklist({ tasks }: { tasks: Task[] }) {
  const { t } = useOps();
  const docs = deriveDocs(tasks);
  const received = docs.filter((d) => d.status === 'received').length;
  const tone: Record<DocEntry['status'], StatusTone> = { received: 'emerald', requested: 'amber', missing: 'neutral' };
  return (
    <div className="rounded-xl border border-line bg-surface p-3 shadow-card">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="flex items-center gap-1.5 text-[13px] font-semibold text-ink">
          <FileText size={13} className="text-accent" aria-hidden /> {t('tl.docs')}
        </h3>
        <span className="tnum text-[11px] text-ink-3">{received}/{docs.length}</span>
      </div>
      {docs.length === 0 && <p className="text-[12px] text-ink-3">{t('ops.empty')}</p>}
      <ul className="space-y-1.5">
        {docs.map((d, i) => (
          <li key={i} className="flex items-center gap-2 rounded-lg border border-line px-2 py-1.5">
            <span className="min-w-0 flex-1 truncate text-[12px] text-ink">{d.name}</span>
            {d.status === 'received' && <EvidenceChip state="verified" animate={false} />}
            <StatusPill label={t(`tl.doc.${d.status}` as OpsKey)} tone={tone[d.status]} />
            {d.status !== 'received' && (
              <button type="button" className="inline-flex items-center gap-1 rounded-md border border-line px-1.5 py-0.5 text-[10.5px] font-medium text-accent hover:bg-accent-tint">
                <Upload size={10} aria-hidden /> {t('tl.docs.upload')}
              </button>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ── Responsible owners (RACI-lite from real owner roles) ──────────── */

function OwnersCard({ tasks }: { tasks: Task[] }) {
  const { t } = useOps();
  const roles = [...new Set(tasks.map((x) => x.ownerRole).filter((r): r is string => r != null))];
  const duty: Record<string, OpsKey> = {
    transaction_coordinator: 'tl.owners.coordination',
    buyer_rep: 'tl.owners.financing',
    fintrac_officer: 'tl.owners.compliance',
    lawyer: 'tl.owners.legal',
    registrant: 'tl.owners.clientComms',
  };
  return (
    <div className="rounded-xl border border-line bg-surface p-3 shadow-card">
      <h3 className="mb-2 flex items-center gap-1.5 text-[13px] font-semibold text-ink">
        <Users size={13} className="text-accent" aria-hidden /> {t('tl.owners')}
      </h3>
      <ul className="space-y-1.5">
        {roles.map((r) => (
          <li key={r} className="flex items-center gap-2 text-[12px]">
            <img
              src={r === 'transaction_coordinator' ? '/avatar-sofia.png' : r === 'fintrac_officer' ? '/avatar-amir.png' : '/avatar-maya.png'}
              alt="" className="h-6 w-6 rounded-full border border-line object-cover"
            />
            <span className="min-w-0 flex-1">
              <span className="block truncate font-medium text-ink">{ownerLabel(r, t)}</span>
              <span className="block text-[11px] text-ink-3">{t(duty[r] ?? 'tl.owners.coordination')}</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ── Client update card ────────────────────────────────────────────── */

function ClientUpdateCard() {
  const { t } = useOps();
  const [preview, setPreview] = useState(false);
  return (
    <div className="rounded-xl border border-line bg-surface p-3 shadow-card">
      <h3 className="mb-1 flex items-center gap-1.5 text-[13px] font-semibold text-ink">
        <Send size={13} className="text-accent" aria-hidden /> {t('tl.clientUpdate')}
      </h3>
      <p className="flex flex-wrap items-center gap-1.5 text-[12px] text-ink-3">
        {t('tl.clientUpdate.last')} <EvidenceChip state="verified" animate={false} />
      </p>
      <div className="mt-2 flex items-center gap-2">
        <button
          type="button" onClick={() => setPreview((v) => !v)}
          className="rounded-lg border border-accent/40 bg-accent-tint px-2.5 py-1 text-[12px] font-medium text-accent hover:bg-accent-tint/70"
        >
          {t('tl.clientUpdate.send')}
        </button>
        <span className="text-[11px] text-ink-3">{t('tl.clientUpdate.note')}</span>
      </div>
      <AnimatePresence>
        {preview && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
            <p className="mt-2 rounded-lg border border-line bg-surface-2 p-2 font-mono text-[11px] leading-5 text-ink-2">
              template: txn-update@v2 (fr) · idem_txn-update_seller · payload: &#123; status, next_deadline &#125;
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ── Workflow event log (mono-dense) ───────────────────────────────── */

interface RestartProof {
  resumedSteps: string[];
  newEffectsEnqueued: number;
  drained: { first: number; second: number };
  duplicateSends: number;
  checkpointEvents: number;
  auditHash: string;
}

function WorkflowLogCard({ events, outbox, restartProof }: {
  events: { id: number; seq: number; type: string; createdAt: string | Date }[];
  outbox: { id: number; idempotencyKey: string; action: string; status: string; attempts: number }[];
  restartProof: RestartProof | null;
}) {
  const { t, dfLocale } = useOps();
  const last = [...events].sort((a, b) => b.seq - a.seq).slice(0, 6);
  return (
    <div className="rounded-xl border border-line bg-surface p-3 shadow-card">
      <h3 className="mb-2 flex items-center gap-1.5 text-[13px] font-semibold text-ink">
        <Workflow size={13} className="text-accent" aria-hidden /> {t('tl.wfLog')}
      </h3>

      {restartProof && (
        <div className="mb-2 rounded-lg border border-ev-verified/40 bg-ev-verified/5 p-2 font-mono text-[11px] leading-5 text-ink-2">
          <p className="mb-1 font-sans text-[11px] font-semibold text-ev-verified">{t('tl.wf.proof.title')}</p>
          <p>{t('tl.wf.proof.eventsReplayed')}: {restartProof.checkpointEvents}</p>
          <p>{t('tl.wf.proof.duplicates')}: {restartProof.duplicateSends} <BadgeCheck size={10} className="inline text-ev-verified" aria-hidden /></p>
          <p>{t('tl.wf.proof.drained')}: {restartProof.drained.first} / {restartProof.drained.second}</p>
          <p className="truncate">{t('tl.wf.proof.audit')}: {restartProof.auditHash}</p>
        </div>
      )}

      {last.length === 0 && outbox.length === 0 && (
        <p className="text-[12px] text-ink-3">{restartProof ? '' : t('tl.wf.proof.idle')}</p>
      )}
      <ul className="space-y-1 font-mono text-[10.5px] leading-4 text-ink-2">
        {last.map((e) => (
          <li key={e.id} className="flex items-baseline gap-1.5">
            <span className="tnum shrink-0 text-ink-3">#{e.seq}</span>
            <span className="min-w-0 flex-1 truncate">{e.type}</span>
            <span className="tnum shrink-0 text-ink-3">{format(new Date(e.createdAt), 'HH:mm:ss', { locale: dfLocale })}</span>
          </li>
        ))}
        {outbox.slice(0, 4).map((o) => (
          <li key={o.id} className="flex items-baseline gap-1.5">
            <span className={cn('shrink-0', o.status === 'sent' ? 'text-ev-verified' : o.status === 'blocked' ? 'text-ev-blocked' : 'text-ev-estimate')}>
              {o.status}
            </span>
            <span className="min-w-0 flex-1 truncate" title={o.idempotencyKey}>{o.action} · {o.idempotencyKey.slice(0, 22)}…</span>
            {o.attempts > 1 && <EvidenceChip state="verified" label={t('tl.wfLog.dedup')} animate={false} />}
          </li>
        ))}
      </ul>
      <Link to="/audit" className="mt-2 inline-block text-[12px] font-medium text-accent hover:underline">
        {t('tl.wfLog.viewAudit')}
      </Link>
    </div>
  );
}

/* ── Closing checklist (ghosted until firm) ────────────────────────── */

const CLOSING_ITEMS = [
  'Final walk-through scheduled', 'Status certificate received', 'Amendments executed',
  'Funds direction to lawyer', 'Keys + lockbox release (via brokerage procedure)',
  'Closing funds confirmed', 'Title transfer confirmed', 'Post-closing follow-up 30-day',
  'Post-closing follow-up 90-day',
];

function ClosingChecklist({ firm, tasks }: { firm: boolean; tasks: Task[] }) {
  const { t } = useOps();
  const [open, setOpen] = useState(false);
  const doneTasks = tasks.filter((x) => x.status === 'done').length;
  return (
    <section className={cn('rounded-xl border bg-surface shadow-card', firm ? 'border-ev-verified/40' : 'border-line')}>
      <button
        type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open}
        className="flex w-full items-center justify-between px-4 py-3 text-left"
      >
        <span className="flex items-center gap-2">
          <CheckCircle2 size={15} className={firm ? 'text-ev-verified' : 'text-ink-3'} aria-hidden />
          <span className="text-[14px] font-semibold text-ink">{t('tl.closing')}</span>
          {!firm && <StatusPill label={t('tl.closing.ghost')} tone="neutral" />}
        </span>
        <ChevronDown size={15} className={cn('text-ink-3 transition-transform', open && 'rotate-180')} aria-hidden />
      </button>
      <AnimatePresence>
        {open && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.24 }} className="overflow-hidden">
            <ul className={cn('grid grid-cols-1 gap-1.5 px-4 pb-4 sm:grid-cols-2', !firm && 'opacity-50')}>
              {CLOSING_ITEMS.map((item, i) => (
                <li key={item} className="flex items-center gap-2 rounded-lg border border-line px-2.5 py-1.5 text-[12px] text-ink-2">
                  <span className={cn('flex h-4 w-4 items-center justify-center rounded border', firm && i < Math.min(doneTasks, 3) ? 'border-ev-verified bg-ev-verified text-white' : 'border-line-strong')}>
                    {firm && i < Math.min(doneTasks, 3) && <CheckCircle2 size={10} aria-hidden />}
                  </span>
                  {item.includes('follow-up') ? t('tl.postClosing') : item}
                </li>
              ))}
            </ul>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}
