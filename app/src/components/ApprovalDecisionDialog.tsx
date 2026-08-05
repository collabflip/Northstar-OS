import { useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Check, Clock, Copy, Lock, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useT } from '@/lib/i18n';
import { AutonomyBadge } from '@/components/evidence/AutonomyBadge';
import type { AutonomyLevel } from '@/components/evidence/AutonomyBadge';
import { StatusPill } from '@/components/evidence/StatusPill';

/** Structural shape of an approvals.list row the dialog can decide on. */
export interface ApprovalDecisionTarget {
  id: number;
  kind: string;
  title: string;
  payload: unknown;
  payloadHash: string;
  destination: string;
  requestedBy: string;
  autonomyLevel: string;
  expiresAt: Date | string;
  createdAt: Date | string;
}

interface ApprovalDecisionDialogProps {
  approval: ApprovalDecisionTarget | null;
  deciding: boolean;
  /** Last decide-mutation error, shown inline so the dialog stays open. */
  error?: string | null;
  /** When false the Approve action is blocked client-side (e.g. A4 role gate). */
  canApprove: boolean;
  blockedReason?: string | null;
  onClose: () => void;
  onDecide: (decision: 'approved' | 'rejected', reason?: string) => void;
}

function fmtDateTime(d: Date | string): string {
  return new Date(d).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

function hoursLeft(expiresAt: Date | string): number {
  return Math.round((new Date(expiresAt).getTime() - Date.now()) / 3_600_000);
}

function shortHash(hash: string): string {
  const hex = hash.replace('sha256:', '');
  return hex.length > 12 ? `sha256:${hex.slice(0, 6)}…${hex.slice(-4)}` : hash;
}

/** Flat payload renderer: scalar fields as definition rows, nested values as JSON. */
function PayloadView({ payload }: { payload: unknown }) {
  const { scalars, nested } = useMemo(() => {
    const scalars: [string, string][] = [];
    const nested: [string, unknown][] = [];
    if (payload && typeof payload === 'object' && !Array.isArray(payload)) {
      for (const [k, v] of Object.entries(payload as Record<string, unknown>)) {
        if (v === null || ['string', 'number', 'boolean'].includes(typeof v)) {
          scalars.push([k, String(v ?? '—')]);
        } else {
          nested.push([k, v]);
        }
      }
    }
    return { scalars, nested };
  }, [payload]);

  if (payload === null || payload === undefined) {
    return <p className="text-[12.5px] text-ink-3">No payload attached.</p>;
  }
  if (typeof payload !== 'object' || Array.isArray(payload) || (scalars.length === 0 && nested.length === 0)) {
    return (
      <pre className="overflow-x-auto rounded-lg border border-line bg-surface-2 p-3 font-mono text-[12px] text-ink-2">
        {JSON.stringify(payload, null, 2)}
      </pre>
    );
  }
  return (
    <div className="space-y-2">
      {scalars.length > 0 && (
        <dl className="grid gap-x-6 gap-y-1.5 sm:grid-cols-2">
          {scalars.map(([field, value]) => (
            <div key={field} className="flex items-baseline justify-between gap-3 border-b border-line py-1.5">
              <dt className="shrink-0 font-mono text-[11.5px] text-ink-3">{field}</dt>
              <dd className="min-w-0 break-words text-right text-[12.5px] text-ink">{value}</dd>
            </div>
          ))}
        </dl>
      )}
      {nested.map(([field, value]) => (
        <div key={field}>
          <p className="ns-meta mb-1">{field}</p>
          <pre className="max-h-48 overflow-auto rounded-lg border border-line bg-surface-2 p-3 font-mono text-[12px] text-ink-2">
            {JSON.stringify(value, null, 2)}
          </pre>
        </div>
      ))}
    </div>
  );
}

/**
 * Payload-bound approval decision sheet. Approve/Reject call approvals.decide
 * with the exact payloadHash shown here (the parent passes it through), so a
 * decision can only ever bind to the payload the reviewer actually saw.
 */
export function ApprovalDecisionDialog({
  approval,
  deciding,
  error,
  canApprove,
  blockedReason,
  onClose,
  onDecide,
}: ApprovalDecisionDialogProps) {
  const { t } = useT();
  const [rejectOpen, setRejectOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [copied, setCopied] = useState(false);

  const copyHash = async (hash: string) => {
    try {
      await navigator.clipboard.writeText(hash);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard unavailable */
    }
  };

  const hrs = approval ? hoursLeft(approval.expiresAt) : 0;
  const expired = approval ? hrs <= 0 : false;

  return (
    <AnimatePresence>
      {approval && (
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
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label={approval.title}
            className="fixed inset-x-4 top-[6dvh] z-50 mx-auto flex max-h-[88dvh] max-w-xl flex-col rounded-2xl border border-line bg-surface shadow-lift"
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 24 }}
            transition={{ type: 'spring', stiffness: 380, damping: 34 }}
          >
            {/* header */}
            <div className="flex items-start justify-between gap-3 border-b border-line p-4">
              <div className="min-w-0">
                <h2 className="text-[16px] font-semibold leading-[22px] text-ink">{approval.title}</h2>
                <p className="tnum mt-0.5 text-[12px] text-ink-3">
                  {approval.kind} · {approval.requestedBy} · {fmtDateTime(approval.createdAt)}
                </p>
                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  <AutonomyBadge level={approval.autonomyLevel as AutonomyLevel} />
                  <StatusPill label={expired ? 'Expired' : 'Waiting'} tone={expired ? 'red' : 'neutral'} />
                  <span className="tnum inline-flex items-center gap-1 rounded-md bg-surface-2 px-1.5 py-0.5 text-[10.5px] text-ink-3">
                    <Clock size={10} aria-hidden />
                    {expired ? `expired ${fmtDateTime(approval.expiresAt)}` : `expires ${fmtDateTime(approval.expiresAt)} (${hrs} h)`}
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label={t('action.close')}
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-ink-3 hover:bg-surface-2 hover:text-ink"
              >
                <X size={15} aria-hidden />
              </button>
            </div>

            {/* body */}
            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
              {/* destination binding */}
              <section>
                <h3 className="ns-meta mb-1.5">Destination</h3>
                <ul className="space-y-1.5">
                  {approval.destination.split(',').map((d) => (
                    <li key={d} className="flex items-center gap-2 rounded-lg border border-line bg-surface-2 px-3 py-1.5">
                      <Lock size={12} className="shrink-0 text-ink-3" aria-hidden />
                      <code className="truncate font-mono text-[12px] text-ink">{d.trim()}</code>
                    </li>
                  ))}
                </ul>
                <div className="mt-2 flex items-center gap-2">
                  <span className="ns-meta">Payload hash</span>
                  <code className="font-mono text-[12px] text-ink-2">{shortHash(approval.payloadHash)}</code>
                  <button
                    type="button"
                    onClick={() => copyHash(approval.payloadHash)}
                    className="inline-flex h-6 items-center gap-1 rounded-md border border-line px-1.5 text-[11px] font-medium text-ink-2 hover:bg-surface-2"
                  >
                    {copied ? <Check size={11} className="text-ev-verified" aria-hidden /> : <Copy size={11} aria-hidden />}
                    {copied ? 'Copied' : 'Copy'}
                  </button>
                </div>
                <p className="mt-1.5 text-[11.5px] leading-4 text-ink-3">
                  Payload-bound approval — your decision is recorded against this exact hash; any change to the payload invalidates it.
                </p>
              </section>

              {/* exact payload */}
              <section>
                <h3 className="ns-meta mb-1.5">Proposed payload</h3>
                <PayloadView payload={approval.payload} />
              </section>

              {!canApprove && blockedReason && (
                <p className="flex items-start gap-1.5 rounded-lg border border-ev-conflict/40 bg-[#C2492B]/5 px-3 py-2 text-[12px] text-ev-conflict">
                  <Lock size={12} className="mt-0.5 shrink-0" aria-hidden />
                  {blockedReason}
                </p>
              )}
              {error && (
                <p className="rounded-lg border border-ev-conflict/40 bg-[#C2492B]/5 px-3 py-2 text-[12px] text-ev-conflict" role="alert">
                  {error}
                </p>
              )}
            </div>

            {/* footer: reject panel + actions */}
            <div className="border-t border-line p-4">
              <AnimatePresence initial={false}>
                {rejectOpen && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.2 }}
                    className="overflow-hidden"
                  >
                    <div className="mb-3">
                      <label htmlFor="reject-reason" className="ns-meta mb-1 block">
                        Rejection reason (required)
                      </label>
                      <textarea
                        id="reject-reason"
                        value={reason}
                        onChange={(e) => setReason(e.target.value)}
                        rows={2}
                        placeholder="Why is this payload being rejected?"
                        className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-[13px] text-ink placeholder:text-ink-3 focus:outline-none focus:ring-2 focus:ring-accent"
                      />
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
              <div className="flex flex-wrap items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="h-8 rounded-lg border border-line px-3 text-[13px] font-medium text-ink-2 hover:border-line-strong"
                >
                  {t('action.close')}
                </button>
                {rejectOpen ? (
                  <button
                    type="button"
                    disabled={!reason.trim() || deciding}
                    onClick={() => onDecide('rejected', reason.trim())}
                    className="h-8 rounded-lg border border-ev-conflict/50 px-3 text-[13px] font-medium text-ev-conflict hover:bg-[#C2492B]/10 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Confirm reject
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => setRejectOpen(true)}
                    className="h-8 rounded-lg border border-ev-conflict/50 px-3 text-[13px] font-medium text-ev-conflict hover:bg-[#C2492B]/10"
                  >
                    Reject
                  </button>
                )}
                <span
                  title={!canApprove ? (blockedReason ?? undefined) : expired ? 'Approval expired — payload must be re-reviewed' : undefined}
                  className={cn(!canApprove || expired ? 'cursor-not-allowed' : undefined)}
                >
                  <button
                    type="button"
                    disabled={deciding || !canApprove || expired}
                    onClick={() => onDecide('approved')}
                    className="h-8 rounded-lg bg-accent px-3 text-[13px] font-medium text-white transition-colors hover:bg-accent-hover active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {deciding ? 'Recording…' : t('action.approve')}
                  </button>
                </span>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
