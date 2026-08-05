import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router';
import { AnimatePresence, motion } from 'framer-motion';
import {
  FileText, Megaphone, MessageSquare, Tag, ShieldCheck, Copy, Check,
  BadgeCheck, Clock, Lock, ChevronRight,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { trpc } from '@/providers/trpc';
import { useActionsT } from '@/lib/i18n/actions';
import type { ActionsKey } from '@/lib/i18n/actions';
import { EvidenceChip } from '@/components/evidence/EvidenceChip';
import { AutonomyBadge } from '@/components/evidence/AutonomyBadge';
import type { AutonomyLevel } from '@/components/evidence/AutonomyBadge';
import { StatusPill } from '@/components/evidence/StatusPill';
import type { StatusTone } from '@/components/evidence/StatusPill';
import { DiffView } from '@/components/evidence/DiffView';
import type { DiffEntry } from '@/components/evidence/DiffView';
import { PolicyGatePanel } from '@/components/evidence/PolicyGatePanel';
import type { GateCheck } from '@/components/evidence/PolicyGatePanel';
import { BlockedAction } from '@/components/evidence/BlockedAction';
import { AgentRunCard } from '@/components/evidence/AgentRunCard';
import { CitationRef } from '@/components/evidence/CitationRef';
import { Banner } from '@/components/evidence/Banner';
import { EmptyState } from '@/components/evidence/EmptyState';

/* ── helpers ─────────────────────────────────────────────────────── */

const KIND_ICON: Record<string, LucideIcon> = {
  content: FileText,
  campaign: Megaphone,
  communication: MessageSquare,
  pricing: Tag,
};

/** Mirror of api/audit.ts stableStringify — deterministic JSON for hashing. */
function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`).join(',')}}`;
}

async function sha256Hex(input: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

function hoursBetween(from: Date, to: Date): number {
  return Math.round((to.getTime() - from.getTime()) / 3_600_000);
}

function fmtAge(createdAt: Date): string {
  const h = Math.max(1, hoursBetween(new Date(createdAt), new Date()));
  return h < 48 ? `${h} h` : `${Math.round(h / 24)} d`;
}

function fmtDateTime(d: Date): string {
  return new Date(d).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

function shortHash(hash: string): string {
  const hex = hash.replace('sha256:', '');
  return `sha256:${hex.slice(0, 4)}…${hex.slice(-4)}`;
}

interface Toast { id: number; message: string; href?: string }

/* ── page ────────────────────────────────────────────────────────── */

type Filter = 'all' | 'content' | 'campaign' | 'communication' | 'pricing';

export default function Approvals() {
  const { t } = useActionsT();
  const utils = trpc.useUtils();
  const listQ = trpc.approvals.list.useQuery();
  const [filter, setFilter] = useState<Filter>('all');
  const [freshOnly, setFreshOnly] = useState(false);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);

  const pushToast = useCallback((message: string, href?: string) => {
    const id = Date.now();
    setToasts((prev) => [...prev, { id, message, href }]);
    window.setTimeout(() => setToasts((prev) => prev.filter((x) => x.id !== id)), 6000);
  }, []);

  const rows = useMemo(() => {
    const all = listQ.data ?? [];
    return all.filter((a) => {
      if (filter !== 'all' && a.kind !== filter) return false;
      if (freshOnly && a.status === 'pending' && hoursBetween(new Date(), new Date(a.expiresAt)) >= 24) return false;
      return true;
    });
  }, [listQ.data, filter, freshOnly]);

  const pending = (listQ.data ?? []).filter((a) => a.status === 'pending');
  const oldest = pending.length
    ? Math.max(...pending.map((a) => hoursBetween(new Date(a.createdAt), new Date())))
    : null;

  const selected = rows.find((a) => a.id === selectedId) ?? rows.find((a) => a.status === 'pending') ?? rows[0] ?? null;

  const decide = trpc.approvals.decide.useMutation({
    onSuccess: async (res, vars) => {
      await utils.approvals.list.invalidate();
      if (selected) await utils.approvals.byId.invalidate({ id: selected.id });
      const hash = res.auditHash ? ` evt_${res.auditHash.replace('sha256:', '').slice(0, 6)}…` : '';
      pushToast(`${vars.decision === 'approved' ? t('ap.toast.approved') : t('ap.toast.rejected')}${hash}`, '/audit');
    },
    onError: (err) => pushToast(err.message),
  });

  // keyboard navigation: j/k move, a approve, r reject
  const actionRef = useRef<(kind: 'approve' | 'reject') => void>(() => undefined);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (!rows.length) return;
      const idx = selected ? rows.findIndex((r) => r.id === selected.id) : -1;
      if (e.key === 'j' || e.key === 'k') {
        const next = e.key === 'j' ? Math.min(rows.length - 1, idx + 1) : Math.max(0, idx - 1);
        setSelectedId(rows[next].id);
      } else if (e.key === 'a' || e.key === 'r') {
        actionRef.current(e.key === 'a' ? 'approve' : 'reject');
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [rows, selected]);

  const FILTERS: { id: Filter; key: ActionsKey }[] = [
    { id: 'all', key: 'ap.filter.all' },
    { id: 'content', key: 'ap.filter.content' },
    { id: 'campaign', key: 'ap.filter.campaigns' },
    { id: 'communication', key: 'ap.filter.communications' },
    { id: 'pricing', key: 'ap.filter.pricing' },
  ];

  return (
    <div className="flex h-full flex-col">
      {/* header */}
      <div className="flex flex-wrap items-center gap-3 px-6 pb-4 pt-6">
        <div>
          <h1 className="text-[22px] font-semibold leading-7 tracking-[-0.01em] text-ink">{t('ap.title')}</h1>
          <p className="tnum mt-0.5 text-[12px] text-ink-3">
            {pending.length} {t('ap.waiting')}
            {oldest !== null && ` · ${t('ap.oldest')} ${oldest} h`}
          </p>
        </div>
        <div className="flex flex-1 flex-wrap items-center gap-1.5 pl-2">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => setFilter(f.id)}
              aria-pressed={filter === f.id}
              className={cn(
                'h-7 rounded-full border px-3 text-[12px] font-medium transition-colors',
                filter === f.id ? 'border-accent bg-accent-tint text-accent' : 'border-line bg-surface text-ink-2 hover:border-line-strong',
              )}
            >
              {t(f.key)}
            </button>
          ))}
          <button
            type="button"
            onClick={() => setFreshOnly((v) => !v)}
            aria-pressed={freshOnly}
            className={cn(
              'h-7 rounded-full border px-3 text-[12px] font-medium transition-colors',
              freshOnly ? 'border-ev-estimate bg-[#9A6A1B]/10 text-ev-estimate' : 'border-line bg-surface text-ink-2 hover:border-line-strong',
            )}
          >
            {freshOnly ? t('ap.filter.fresh.expiring') : t('ap.filter.fresh.all')}
          </button>
        </div>
        <span className="hidden font-mono text-[11px] text-ink-3 lg:inline">{t('ap.kbd')}</span>
      </div>

      {/* body */}
      {listQ.isLoading ? (
        <ApprovalsSkeleton />
      ) : listQ.isError ? (
        <EmptyState
          title={t('ap.error.title')}
          description={t('ap.error.desc')}
          action={
            <button type="button" onClick={() => listQ.refetch()} className="h-8 rounded-lg bg-accent px-3 text-[13px] font-medium text-white hover:bg-accent-hover">
              Retry
            </button>
          }
        />
      ) : rows.length === 0 ? (
        <EmptyState title={t('ap.empty.title')} description={t('ap.empty.desc')} />
      ) : (
        <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 px-6 pb-6 lg:grid-cols-[380px_minmax(0,1fr)]">
          {/* list */}
          <ul className="space-y-2 overflow-y-auto pr-1" aria-label={t('ap.title')}>
            {rows.map((a, i) => {
              const Icon = KIND_ICON[a.kind] ?? ShieldCheck;
              const hrsLeft = hoursBetween(new Date(), new Date(a.expiresAt));
              const isPending = a.status === 'pending';
              const expiringSoon = isPending && hrsLeft < 24;
              const expired = isPending && hrsLeft <= 0;
              const pill: { label: string; tone: StatusTone } = !isPending
                ? { label: t(a.status === 'approved' ? 'ap.status.approved' : 'ap.status.rejected'), tone: a.status === 'approved' ? 'emerald' : 'red' }
                : expired
                  ? { label: t('ap.status.expired'), tone: 'red' }
                  : expiringSoon
                    ? { label: t('ap.status.expiringSoon'), tone: 'amber' }
                    : { label: t('ap.status.waiting'), tone: 'neutral' };
              const isSel = selected?.id === a.id;
              return (
                <motion.li
                  key={a.id}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.24, delay: i * 0.035 }}
                >
                  <button
                    type="button"
                    onClick={() => setSelectedId(a.id)}
                    aria-current={isSel}
                    className={cn(
                      'flex w-full items-start gap-3 rounded-xl border p-3 text-left shadow-card transition-colors',
                      isSel ? 'border-accent/40 bg-accent-tint' : 'border-line bg-surface hover:border-line-strong',
                    )}
                  >
                    <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-surface-2 text-ink-2">
                      <Icon size={15} aria-hidden />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px] font-semibold text-ink">{a.title}</span>
                      <span className="mt-0.5 block truncate font-mono text-[11px] text-ink-3">{a.destination}</span>
                      <span className="mt-1.5 flex flex-wrap items-center gap-1.5">
                        <span className="tnum inline-flex items-center gap-1 rounded-md bg-surface-2 px-1.5 py-0.5 text-[10.5px] text-ink-3">
                          <Clock size={10} aria-hidden />
                          {fmtAge(new Date(a.createdAt))}
                        </span>
                        <AutonomyBadge level={a.autonomyLevel as AutonomyLevel} showLabel={false} />
                        <StatusPill label={pill.label} tone={pill.tone} />
                      </span>
                    </span>
                    <ChevronRight size={14} className="mt-1 shrink-0 text-ink-3" aria-hidden />
                  </button>
                </motion.li>
              );
            })}
          </ul>

          {/* detail */}
          <div className="min-w-0 overflow-y-auto">
            {selected && (
              <ApprovalDetail
                key={selected.id}
                approval={selected}
                onDecide={(decision, reason) =>
                  decide.mutate({ id: selected.id, decision, expectedPayloadHash: selected.payloadHash, reason })
                }
                deciding={decide.isPending}
                onSnooze={() => pushToast(t('ap.decision.snoozed'))}
                actionRef={actionRef}
              />
            )}
          </div>
        </div>
      )}

      {/* toasts */}
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
                  {t('act.view')}
                </Link>
              )}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
}

function ApprovalsSkeleton() {
  return (
    <div className="grid flex-1 grid-cols-1 gap-4 px-6 pb-6 lg:grid-cols-[380px_minmax(0,1fr)]">
      <div className="space-y-2">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-[92px] animate-pulse rounded-xl border border-line bg-surface" />
        ))}
      </div>
      <div className="h-[480px] animate-pulse rounded-xl border border-line bg-surface" />
    </div>
  );
}

/* ── detail pane ─────────────────────────────────────────────────── */

interface ApprovalRow {
  id: number;
  tenantId: number;
  kind: string;
  title: string;
  payload: unknown;
  payloadHash: string;
  destination: string;
  policyDecisionId: number | null;
  requestedBy: string;
  requestedByUserId: number | null;
  autonomyLevel: string;
  status: 'pending' | 'approved' | 'rejected';
  decidedBy: number | null;
  decidedAt: Date | null;
  reason: string | null;
  expiresAt: Date;
  createdAt: Date;
}

const REASON_CHIPS: ActionsKey[] = ['ap.reject.factual', 'ap.reject.brand', 'ap.reject.compliance', 'ap.reject.other'];

function ApprovalDetail({
  approval,
  onDecide,
  deciding,
  onSnooze,
  actionRef,
}: {
  approval: ApprovalRow;
  onDecide: (decision: 'approved' | 'rejected', reason?: string) => void;
  deciding: boolean;
  onSnooze: () => void;
  actionRef: React.MutableRefObject<(kind: 'approve' | 'reject') => void>;
}) {
  const { t } = useActionsT();
  const detailQ = trpc.approvals.byId.useQuery({ id: approval.id });
  const [rejectOpen, setRejectOpen] = useState(false);
  const [reasonChip, setReasonChip] = useState<ActionsKey | null>(null);
  const [reasonNote, setReasonNote] = useState('');
  const [editOpen, setEditOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [countersignRequested, setCountersignRequested] = useState(false);

  const payload = (approval.payload ?? {}) as Record<string, unknown>;
  const isPending = approval.status === 'pending';
  const hrsLeft = hoursBetween(new Date(), new Date(approval.expiresAt));
  const expired = isPending && hrsLeft <= 0;
  const hashMatches = detailQ.data?.hashMatches ?? true;
  const withinExpiry = detailQ.data?.withinExpiry ?? !expired;

  // ── editable payload fields (approve-with-edits) ──
  const editableFields = useMemo(
    () => Object.entries(payload).filter(([, v]) => typeof v === 'string') as [string, string][],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [approval.id],
  );
  const [edited, setEdited] = useState<Record<string, string>>({});
  const editedPayload = useMemo(() => ({ ...payload, ...edited }), [payload, edited]);
  const [editedHash, setEditedHash] = useState<string | null>(null);
  const [hashBusy, setHashBusy] = useState(false);
  useEffect(() => {
    if (!editOpen) return;
    let alive = true;
    setHashBusy(true);
    sha256Hex(stableStringify(editedPayload)).then((hex) => {
      if (alive) {
        setEditedHash(`sha256:${hex}`);
        setHashBusy(false);
      }
    });
    return () => {
      alive = false;
    };
  }, [editOpen, editedPayload]);
  const editedDiffers = editOpen && editedHash !== null && editedHash !== approval.payloadHash;

  // ── 14-check commit-time policy gate ──
  const isA4 = approval.autonomyLevel === 'A4';
  const isComm = approval.kind === 'communication';
  const isCampaign = approval.kind === 'campaign';
  const checks: GateCheck[] = [
    { id: 'tenant', label: t('ap.check.tenant'), detail: 'hrl-001', status: 'pass' },
    { id: 'actor', label: t('ap.check.actor'), detail: 'Maya Chen', status: 'pass' },
    {
      id: 'role',
      label: t('ap.check.role'),
      detail: isA4 ? 'ON-ADV-014' : 'registrant',
      status: isA4 ? 'fail' : 'pass',
    },
    { id: 'jurisdiction', label: t('ap.check.jurisdiction'), detail: 'ON-TRESA', status: 'pass' },
    { id: 'brokerage', label: t('ap.check.brokerage'), detail: 'pol-v2.3.1', status: 'pass' },
    {
      id: 'consent',
      label: t('ap.check.consent'),
      detail: isComm ? 'express · cst-2025-114' : isCampaign ? 'express-only audience' : undefined,
      status: isComm || isCampaign ? 'pass' : 'na',
    },
    {
      id: 'suppression',
      label: t('ap.check.suppression'),
      detail: isComm || isCampaign ? '0 hits' : undefined,
      status: isComm || isCampaign ? 'pass' : 'na',
    },
    { id: 'purpose', label: t('ap.check.purpose'), detail: approval.kind, status: 'pass' },
    {
      id: 'approval-fresh',
      label: t('ap.check.approvalFresh'),
      detail: withinExpiry ? `${Math.max(1, hrsLeft)} h left` : 'expired',
      status: withinExpiry ? 'pass' : 'fail',
    },
    { id: 'data-fresh', label: t('ap.check.dataFresh'), detail: '2 h', status: 'pass' },
    {
      id: 'payload-bind',
      label: t('ap.check.payloadBind'),
      detail: shortHash(approval.payloadHash),
      status: hashMatches && !editedDiffers ? 'pass' : 'fail',
    },
    {
      id: 'budget',
      label: t('ap.check.budget'),
      detail: isCampaign ? '$1,500 · 2/wk' : isComm ? '2/wk cap' : undefined,
      status: isComm || isCampaign ? 'pass' : 'na',
    },
    { id: 'idempotency', label: t('ap.check.idempotency'), detail: `idem_${approval.id.toString(16)}f3…`, status: 'pass' },
    { id: 'audit', label: t('ap.check.audit'), detail: '14 fields', status: 'pass' },
  ];
  const gateFails = checks.filter((c) => c.status === 'fail');
  const canApprove = isPending && !expired && gateFails.length === 0 && !deciding;
  const approveBlockedReason = isA4
    ? t('ap.blocked.a4')
    : editedDiffers
      ? t('ap.blocked.edited')
      : t('ap.blocked.gate');

  actionRef.current = (kind) => {
    if (kind === 'approve' && canApprove) onDecide('approved');
    if (kind === 'reject' && isPending) setRejectOpen(true);
  };

  const submitReject = () => {
    if (!reasonChip) return;
    const reason = `${t(reasonChip)}${reasonNote.trim() ? ` — ${reasonNote.trim()}` : ''}`;
    onDecide('rejected', reason);
  };

  const copyHash = async () => {
    try {
      await navigator.clipboard.writeText(approval.payloadHash);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard unavailable */
    }
  };

  // ── payload body per kind ──
  const diffs: DiffEntry[] = useMemo(() => {
    if (approval.kind !== 'content') return [];
    const headline = String(payload.headline ?? '');
    const body = String(payload.body ?? '');
    const entries: DiffEntry[] = [];
    if (headline) entries.push({ field: 'headline', oldValue: 'Charming family home', newValue: headline });
    if (body) entries.push({ field: 'body', oldValue: 'Charming 4-bed in a great neighbourhood. A must-see!', newValue: body });
    return entries;
  }, [approval.kind, payload]);

  const agentVersion = approval.kind === 'content'
    ? { model: 'k3-content@2.1.0', prompt: 'listing-copy@3.0' }
    : approval.kind === 'campaign'
      ? { model: 'k3-campaign@1.4.0', prompt: 'bounded-campaign@2.2' }
      : { model: 'mock-deterministic-1', prompt: 'conversational-lead@1.0' };

  return (
    <motion.div
      key={approval.id}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.18 }}
      className="relative space-y-4 pb-24"
    >
      {expired && (
        <Banner variant="warning" title={t('ap.status.expired')}>
          {t('ap.expired.banner')}
        </Banner>
      )}

      {/* 1 · summary header */}
      <motion.section initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.24 }} className="ns-card p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-[16px] font-semibold leading-[22px] text-ink">{approval.title}</h2>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <EvidenceChip state="generated" />
              <AutonomyBadge level={approval.autonomyLevel as AutonomyLevel} />
              <StatusPill
                label={t(approval.status === 'approved' ? 'ap.status.approved' : approval.status === 'rejected' ? 'ap.status.rejected' : 'ap.status.waiting')}
                tone={approval.status === 'approved' ? 'emerald' : approval.status === 'rejected' ? 'red' : 'neutral'}
              />
            </div>
            <p className="tnum mt-3 text-[12px] text-ink-3">
              {t('ap.detail.created')} {fmtDateTime(approval.createdAt)} · {t('ap.detail.expires')} {fmtDateTime(approval.expiresAt)}
              {isPending && !expired && ` (${t('act.expiresIn')} ${hrsLeft} h)`}
            </p>
          </div>
        </div>
        <div className="mt-4 max-w-md">
          <AgentRunCard
            agentName={approval.requestedBy}
            modelVersion={agentVersion.model}
            promptVersion={agentVersion.prompt}
            duration="3.2 s"
            tokens="1,904 tok"
            confidence={91}
            evidenceCount={approval.kind === 'content' ? 4 : 2}
            auditHref="/audit"
          />
        </div>
      </motion.section>

      {/* 2 · exact payload */}
      <motion.section initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.24, delay: 0.05 }} className="ns-card p-5">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-[14px] font-semibold text-ink">{t('ap.payload.title')}</h3>
          <span className="ns-meta">{t('ap.payload.currentNew')}</span>
        </div>

        {approval.kind === 'content' && (
          <div className="space-y-3">
            <DiffView diffs={diffs} />
            <p className="text-[12.5px] leading-5 text-ink-2">
              {t('ap.payload.body')}: “{String(payload.body ?? '')}”{' '}
              <CitationRef
                ref="dossier §profile"
                quote="Lot dimensions 33 x 122 ft — municipal record (MPAC-mock), retrieved Jun 8"
                documentName="Property dossier — DEMO-ON-PROPERTY-001"
                documentHref="/properties/1"
              />{' '}
              <CitationRef
                ref="MPAC-mock"
                quote="2024 property taxes $8,940 — municipal record (MPAC-mock), retrieved Jun 8"
                documentName="Property dossier — DEMO-ON-PROPERTY-001"
                documentHref="/properties/1"
              />
            </p>
          </div>
        )}

        {approval.kind === 'communication' && (
          <div className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-lg border border-line bg-surface-2 p-3">
                <p className="ns-meta mb-1">EN</p>
                <p className="text-[12.5px] leading-5 text-ink">{String(payload.body ?? '')}</p>
              </div>
              <div className="rounded-lg border border-line bg-surface-2 p-3">
                <p className="ns-meta mb-1">fr-CA</p>
                <p className="text-[12.5px] leading-5 text-ink">
                  Bonjour Gurpreet — c’est Maya. Merci encore pour la consultation ; l’ébauche de votre dossier est en cours. Répondez ARRÊT en tout temps.
                </p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <EvidenceChip state="verified" label={t('ap.payload.casl')} />
              <EvidenceChip state="verified" label={t('ap.payload.unsubscribe')} />
              <EvidenceChip state="verified" label={t('ap.payload.quietHours')} />
              <span className="font-mono text-[11px] text-ink-3">{t('ap.payload.senderId')}: HRL-Notify</span>
            </div>
          </div>
        )}

        {approval.kind === 'campaign' && (
          <dl className="grid gap-x-6 gap-y-2 sm:grid-cols-2">
            {([
              ['ap.payload.audience', `${String(payload.size ?? '412')} ${t('ap.payload.contacts')}`],
              ['ap.payload.contentFamily', String(payload.contentFamily ?? 'seminar-followup@v3')],
              ['ap.payload.budgetCap', String(payload.budgetCap ?? '$1,500')],
              ['ap.payload.frequencyCap', String(payload.frequencyCap ?? '2/week/contact')],
              ['ap.payload.schedule', String(payload.schedule ?? 'Jun 2–30 · quiet hours 9 am–8 pm ET')],
              ['ap.payload.suppression', String(payload.suppression ?? 'supp_2025-06 @ 3fa1…')],
            ] as [ActionsKey, string][]).map(([key, val]) => (
              <div key={key} className="flex items-baseline justify-between gap-2 border-b border-line py-1.5">
                <dt className="text-[12px] text-ink-3">{t(key)}</dt>
                <dd className="truncate font-mono text-[12px] text-ink">{val}</dd>
              </div>
            ))}
          </dl>
        )}

        {approval.kind !== 'content' && approval.kind !== 'communication' && approval.kind !== 'campaign' && (
          <pre className="overflow-x-auto rounded-lg border border-line bg-surface-2 p-3 font-mono text-[12px] text-ink-2">
            {JSON.stringify(payload, null, 2)}
          </pre>
        )}
      </motion.section>

      {/* 3 · destination binding */}
      <motion.section initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.24, delay: 0.1 }} className="ns-card p-5">
        <h3 className="mb-3 text-[14px] font-semibold text-ink">{t('ap.dest.title')}</h3>
        <ul className="space-y-1.5">
          {approval.destination.split(',').map((d) => (
            <li key={d} className="flex items-center gap-2 rounded-lg border border-line bg-surface-2 px-3 py-1.5">
              <Lock size={12} className="shrink-0 text-ink-3" aria-hidden />
              <code className="truncate font-mono text-[12px] text-ink">{d.trim()}</code>
            </li>
          ))}
          {approval.kind === 'content' && (
            <li className="flex items-center gap-2 rounded-lg border border-line bg-surface-2 px-3 py-1.5">
              <Lock size={12} className="shrink-0 text-ink-3" aria-hidden />
              <code className="truncate font-mono text-[12px] text-ink">portal:property/demo-on-property-001</code>
            </li>
          )}
        </ul>
        <div className="mt-3 flex items-center gap-2">
          <span className="ns-meta">{t('ap.dest.hash')}</span>
          <code className="font-mono text-[12px] text-ink-2">{shortHash(approval.payloadHash)}</code>
          <button
            type="button"
            onClick={copyHash}
            className="inline-flex h-6 items-center gap-1 rounded-md border border-line px-1.5 text-[11px] font-medium text-ink-2 hover:bg-surface-2"
          >
            {copied ? <Check size={11} className="text-ev-verified" aria-hidden /> : <Copy size={11} aria-hidden />}
            {copied ? t('act.copied') : t('act.copy')}
          </button>
        </div>
      </motion.section>

      {/* 4 · policy gate */}
      <motion.section initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.24, delay: 0.15 }}>
        <PolicyGatePanel checks={checks} />
        {isA4 && (
          <p className="mt-2 flex items-start gap-1.5 text-[12px] text-ev-conflict">
            <Lock size={12} className="mt-0.5 shrink-0" aria-hidden />
            {t('ap.check.roleFail')} · <code className="font-mono">ON-ADV-014</code>
          </p>
        )}
      </motion.section>

      {/* 5 · A4 counter-signature callout */}
      {isA4 && isPending && (
        <motion.section
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.24, delay: 0.2 }}
          className="rounded-xl border border-ev-conflict/40 bg-[#C2492B]/5 p-5"
        >
          <div className="flex flex-wrap items-center gap-4">
            <img src="/avatar-daniel.png" alt="Daniel Okafor" className="h-12 w-12 rounded-full border border-line object-cover" />
            <div className="min-w-0 flex-1">
              <p className="text-[14px] font-semibold text-ink">{t('ap.a4.title')}</p>
              <p className="mt-0.5 text-[12.5px] text-ink-2">{t('ap.a4.body')}</p>
            </div>
            {countersignRequested ? (
              <span className="inline-flex items-center gap-1.5 text-[12.5px] font-medium text-ev-verified">
                <BadgeCheck size={15} aria-hidden />
                {t('ap.a4.requested')}
              </span>
            ) : (
              <button
                type="button"
                onClick={() => setCountersignRequested(true)}
                className="h-8 rounded-lg border border-ev-conflict/50 bg-surface px-3 text-[13px] font-medium text-ev-conflict hover:bg-[#C2492B]/10"
              >
                {t('ap.a4.request')}
              </button>
            )}
          </div>
        </motion.section>
      )}

      {/* 6 · history strip */}
      {approval.kind === 'content' && (
        <motion.section initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.24, delay: 0.25 }} className="ns-card p-5">
          <h3 className="mb-3 text-[14px] font-semibold text-ink">{t('ap.history.title')}</h3>
          <div className="flex flex-wrap gap-2">
            <Link to="/audit" className="rounded-lg border border-ev-conflict/30 bg-[#C2492B]/5 px-3 py-2 text-[12px] text-ink-2 hover:border-ev-conflict/50">
              <StatusPill label={t('ap.status.rejected')} tone="red" className="mr-2" />
              {t('ap.history.v1Rejected')}
            </Link>
            <span className="rounded-lg border border-ev-verified/30 bg-[#1E7A4F]/5 px-3 py-2 text-[12px] text-ink-2">
              <StatusPill label={`v2 · ${t('ap.history.current')}`} tone="emerald" className="mr-2" />
              {shortHash(approval.payloadHash)}
            </span>
          </div>
        </motion.section>
      )}

      {/* decided read-only note */}
      {!isPending && (
        <Banner variant={approval.status === 'approved' ? 'info' : 'warning'} title={t(approval.status === 'approved' ? 'ap.status.approved' : 'ap.status.rejected')}>
          {approval.decidedAt && `${fmtDateTime(approval.decidedAt)}`}
          {approval.reason && ` — ${approval.reason}`}
        </Banner>
      )}

      {/* 7 · sticky decision bar */}
      {isPending && (
        <div className="sticky bottom-0 z-10 -mx-1 mt-4 rounded-xl border border-line bg-surface/95 p-3 shadow-lift backdrop-blur">
          {/* reject panel */}
          <AnimatePresence>
            {rejectOpen && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="overflow-hidden"
              >
                <div className="mb-3 rounded-lg border border-line bg-surface-2 p-3">
                  <p className="mb-2 text-[13px] font-semibold text-ink">{t('ap.reject.title')}</p>
                  <div className="flex flex-wrap gap-1.5">
                    {REASON_CHIPS.map((key) => (
                      <button
                        key={key}
                        type="button"
                        onClick={() => setReasonChip(key)}
                        aria-pressed={reasonChip === key}
                        className={cn(
                          'h-7 rounded-full border px-3 text-[12px] font-medium',
                          reasonChip === key ? 'border-ev-conflict bg-[#C2492B]/10 text-ev-conflict' : 'border-line bg-surface text-ink-2 hover:border-line-strong',
                        )}
                      >
                        {t(key)}
                      </button>
                    ))}
                  </div>
                  <textarea
                    value={reasonNote}
                    onChange={(e) => setReasonNote(e.target.value)}
                    placeholder={t('ap.reject.notePlaceholder')}
                    rows={2}
                    className="mt-2 w-full rounded-lg border border-line bg-surface px-3 py-2 text-[13px] text-ink placeholder:text-ink-3 focus:outline-none focus:ring-2 focus:ring-accent"
                  />
                  {!reasonChip && <p className="mt-1 text-[11.5px] text-ink-3">{t('ap.reject.reasonRequired')}</p>}
                  <div className="mt-2 flex justify-end">
                    <button
                      type="button"
                      disabled={!reasonChip || deciding}
                      onClick={submitReject}
                      className="h-8 rounded-lg border border-ev-conflict/50 px-3 text-[13px] font-medium text-ev-conflict hover:bg-[#C2492B]/10 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {t('ap.reject.submit')}
                    </button>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* edit panel */}
          <AnimatePresence>
            {editOpen && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="overflow-hidden"
              >
                <div className="mb-3 rounded-lg border border-line bg-surface-2 p-3">
                  <p className="text-[13px] font-semibold text-ink">{t('ap.edit.title')}</p>
                  <p className="mt-0.5 text-[11.5px] text-ink-3">{t('ap.edit.note')}</p>
                  <div className="mt-2 space-y-2">
                    {editableFields.map(([field, value]) => (
                      <label key={field} className="block">
                        <span className="ns-meta">{field}</span>
                        <textarea
                          value={edited[field] ?? value}
                          onChange={(e) => setEdited((prev) => ({ ...prev, [field]: e.target.value }))}
                          rows={field === 'body' ? 3 : 1}
                          className="mt-0.5 w-full rounded-lg border border-line bg-surface px-3 py-1.5 font-mono text-[12.5px] text-ink focus:outline-none focus:ring-2 focus:ring-accent"
                        />
                      </label>
                    ))}
                  </div>
                  <p className="mt-2 flex flex-wrap items-center gap-2 text-[12px]">
                    <span className="ns-meta">{t('ap.edit.hashLive')}</span>
                    <code className={cn('font-mono transition-colors', hashBusy ? 'animate-pulse text-ink-3' : editedDiffers ? 'text-ev-conflict' : 'text-ev-verified')}>
                      {hashBusy || !editedHash ? '…' : shortHash(editedHash)}
                    </code>
                    {editedDiffers && (
                      <BlockedAction label={t('ap.edit.save')} reason={t('ap.blocked.edited')} />
                    )}
                  </p>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <div className="flex flex-wrap items-center gap-2">
            {canApprove ? (
              <button
                type="button"
                onClick={() => onDecide('approved')}
                disabled={deciding}
                className="h-9 rounded-lg bg-accent px-4 text-[13px] font-medium text-white transition-colors hover:bg-accent-hover active:scale-[0.99] disabled:opacity-50"
              >
                {t('ap.decision.approve')}
              </button>
            ) : (
              <BlockedAction label={t('ap.decision.approve')} reason={expired ? t('ap.expired.banner') : approveBlockedReason} />
            )}
            <button
              type="button"
              onClick={() => setEditOpen((v) => !v)}
              aria-expanded={editOpen}
              className="h-9 rounded-lg border border-line px-3 text-[13px] font-medium text-ink-2 hover:border-line-strong"
            >
              {t('ap.decision.approveEdits')}
            </button>
            <button
              type="button"
              onClick={() => setRejectOpen((v) => !v)}
              aria-expanded={rejectOpen}
              className="h-9 rounded-lg border border-ev-conflict/50 px-3 text-[13px] font-medium text-ev-conflict hover:bg-[#C2492B]/10"
            >
              {t('ap.decision.reject')}
            </button>
            <button
              type="button"
              onClick={onSnooze}
              className="h-9 rounded-lg px-3 text-[13px] font-medium text-ink-3 hover:bg-surface-2"
            >
              {t('ap.decision.snooze')}
            </button>
          </div>
        </div>
      )}
    </motion.div>
  );
}
