import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Fingerprint, Link2, ShieldCheck, FileJson, Copy, Check, X, Lock,
  AlertTriangle, Download, Search, FileWarning,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { trpc } from '@/providers/trpc';
import { useGovernanceT } from '@/lib/i18n/governance';
import { StatusPill } from '@/components/evidence/StatusPill';
import { Banner } from '@/components/evidence/Banner';
import { EmptyState } from '@/components/evidence/EmptyState';

/* ── crypto helpers (mirror api/audit.ts — deterministic, truthful) ── */

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

interface AuditRow {
  id: number;
  seq: number;
  tenantId: number | null;
  actorId: number | null;
  actorRole: string | null;
  action: string;
  subjectType: string;
  subjectId: string;
  payloadHash: string;
  policyDecisionId: number | null;
  modelVersion: string | null;
  promptVersion: string | null;
  prevHash: string;
  hash: string;
  createdAt: string | Date;
}

/** Recompute one chain link exactly as api/audit.ts verifyAuditChain does. */
async function recomputeChainHash(row: AuditRow, actionOverride?: string): Promise<string> {
  const body = stableStringify({
    seq: row.seq,
    tenantId: row.tenantId,
    actorId: row.actorId ?? null,
    actorRole: row.actorRole ?? null,
    action: actionOverride ?? row.action,
    subjectType: row.subjectType,
    subjectId: String(row.subjectId),
    payloadHash: row.payloadHash,
    policyDecisionId: row.policyDecisionId ?? null,
    modelVersion: row.modelVersion ?? null,
    promptVersion: row.promptVersion ?? null,
    prevHash: row.prevHash,
  });
  return `sha256:${await sha256Hex(body)}`;
}

function shortHash(hash: string): string {
  const hex = hash.replace('sha256:', '');
  return hex.length <= 10 ? hash : `${hex.slice(0, 4)}…${hex.slice(-4)}`;
}

type ActorType = 'human' | 'agent' | 'system';
function actorTypeOf(r: AuditRow): ActorType {
  if (r.actorId == null && !r.actorRole) return 'system';
  if (r.modelVersion || r.actorRole === 'agent') return 'agent';
  return 'human';
}

const RESTRICTED_SUBJECTS = new Set(['fintrac_queue', 'fintrac']);
function isFintracRow(r: AuditRow): boolean {
  return RESTRICTED_SUBJECTS.has(r.subjectType) || r.action.includes('fintrac');
}

/* ── page ────────────────────────────────────────────────────────── */

type ActorFilter = 'all' | ActorType;

export default function AuditExplorer() {
  const { t } = useGovernanceT();
  const list = trpc.audit.list.useQuery({ limit: 100 }, { retry: 1 });
  const verify = trpc.audit.verifyChain.useQuery(undefined, { retry: 1 });
  const tenant = trpc.settings.tenant.useQuery(undefined, { retry: 1 });

  const [actorFilter, setActorFilter] = useState<ActorFilter>('all');
  const [actionType, setActionType] = useState<string>('all');
  const [ruleId, setRuleId] = useState('');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<AuditRow | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [verifyResult, setVerifyResult] = useState<'idle' | 'ok' | 'fail'>('idle');
  const [toast, setToast] = useState<string | null>(null);

  const role = tenant.data?.me.role ?? '';
  const canSeeFintrac = role === 'fintrac_officer' || role === 'broker_of_record';

  const rows = useMemo(() => (list.data ?? []) as AuditRow[], [list.data]);

  const actionTypes = useMemo(() => {
    const set = new Set<string>();
    for (const r of rows) set.add(r.action.split('.')[0]);
    return Array.from(set).sort();
  }, [rows]);

  const filtered = useMemo(() => rows.filter((r) => {
    if (actorFilter !== 'all' && actorTypeOf(r) !== actorFilter) return false;
    if (actionType !== 'all' && !r.action.startsWith(`${actionType}.`)) return false;
    if (ruleId && !r.action.toLowerCase().includes(ruleId.toLowerCase()) && !r.subjectId.toLowerCase().includes(ruleId.toLowerCase())) return false;
    if (search) {
      const q = search.toLowerCase();
      const hay = `${r.action} ${r.subjectType}/${r.subjectId} ${r.actorRole ?? ''} evt_${r.seq}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  }), [rows, actorFilter, actionType, ruleId, search]);

  const hasFilters = actorFilter !== 'all' || actionType !== 'all' || ruleId !== '' || search !== '';
  const clearFilters = () => { setActorFilter('all'); setActionType('all'); setRuleId(''); setSearch(''); };

  const pushToast = useCallback((msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast(null), 5000);
  }, []);

  const runVerify = useCallback(async () => {
    setVerifying(true);
    setVerifyResult('idle');
    const res = await verify.refetch();
    // deliberate sweep so the progressive animation reads
    window.setTimeout(() => {
      setVerifying(false);
      setVerifyResult(res.data?.ok ? 'ok' : 'fail');
    }, 1200);
  }, [verify]);

  const head = rows[0];
  const chainOk = verify.data?.ok ?? true;

  return (
    <div className="flex h-full flex-col p-6">
      {/* header */}
      <header className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2.5">
          <h1 className="text-[22px] font-semibold leading-7 tracking-[-0.01em] text-ink">{t('aud.title')}</h1>
          {chainOk && head && (
            <span className="inline-flex h-6 items-center gap-1.5 rounded-full border border-ev-verified/40 bg-ev-verified/10 px-2.5 font-mono text-[11px] font-medium text-ev-verified">
              <ShieldCheck size={12} aria-hidden />
              {t('aud.integrity.ok', { head: `evt_${head.seq} ${shortHash(head.hash)}`, count: (verify.data?.entries ?? rows.length).toLocaleString() })}
            </span>
          )}
          {!chainOk && <StatusPill label={t('aud.integrity.fail')} tone="red" />}
        </div>
        <button type="button" onClick={() => pushToast(t('aud.export.toast'))}
          className="flex h-9 items-center gap-1.5 rounded-lg border border-line bg-surface px-3 text-[13px] font-medium text-ink-2 transition-colors hover:border-line-strong">
          <Download size={14} aria-hidden /> {t('aud.export')}
        </button>
      </header>

      {list.isError && (
        <Banner variant="warning" title={t('aud.error.title')} className="mb-4"
          action={<button type="button" onClick={() => list.refetch()} className="rounded-lg border border-line px-2.5 py-1 text-[12px] font-medium text-accent hover:bg-accent-tint">{t('gov.retry')}</button>}>
          {t('aud.error.body')}
        </Banner>
      )}
      {verifyResult === 'fail' && (
        <Banner variant="escalation" title={t('aud.integrity.fail')} className="mb-4">{null}</Banner>
      )}

      {/* sticky filter bar */}
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.2 }}
        className="sticky top-0 z-20 mb-3 rounded-xl border border-line bg-surface/95 p-2.5 shadow-card backdrop-blur">
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-line bg-surface-2/60 px-2.5 text-[12px] font-medium text-ink-2">
            {t('aud.filter.dates')}: {t('aud.filter.today')}
          </span>
          <div className="flex gap-1" role="group" aria-label={t('aud.col.actor')}>
            {(['all', 'human', 'agent', 'system'] as ActorFilter[]).map((f) => (
              <button key={f} type="button" aria-pressed={actorFilter === f} onClick={() => setActorFilter(f)}
                className={cn('h-8 rounded-lg px-2.5 text-[12px] font-medium transition-colors',
                  actorFilter === f ? 'bg-accent text-white' : 'border border-line text-ink-2 hover:bg-surface-2')}>
                {t(`aud.filter.actor.${f}` as const)}
              </button>
            ))}
          </div>
          <select value={actionType} onChange={(e) => setActionType(e.target.value)} aria-label={t('aud.filter.actionType')}
            className="h-8 rounded-lg border border-line bg-surface px-2 text-[12px] font-medium text-ink-2">
            <option value="all">{t('aud.filter.allActions')}</option>
            {actionTypes.map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
          <input value={ruleId} onChange={(e) => setRuleId(e.target.value)} placeholder={t('aud.filter.rulePlaceholder')}
            aria-label={t('aud.filter.rule')}
            className="h-8 w-36 rounded-lg border border-line bg-surface px-2.5 font-mono text-[12px] text-ink placeholder:text-ink-3" />
          <div className="relative min-w-40 flex-1">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-3" aria-hidden />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t('aud.filter.search')}
              aria-label={t('aud.filter.search')}
              className="h-8 w-full rounded-lg border border-line bg-surface pl-7 pr-2.5 text-[12px] text-ink placeholder:text-ink-3" />
          </div>
          <button type="button" onClick={runVerify} disabled={verifying}
            className="flex h-8 items-center gap-1.5 rounded-lg border border-line px-2.5 text-[12px] font-medium text-ink-2 hover:bg-surface-2 disabled:opacity-60">
            <Fingerprint size={13} aria-hidden />
            {verifying ? t('aud.integrity.verifying') : t('aud.filter.verify')}
          </button>
        </div>
        {hasFilters && (
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            {actorFilter !== 'all' && <FilterChip label={t(`aud.filter.actor.${actorFilter}` as const)} onClear={() => setActorFilter('all')} />}
            {actionType !== 'all' && <FilterChip label={actionType} onClear={() => setActionType('all')} />}
            {ruleId && <FilterChip label={ruleId} mono onClear={() => setRuleId('')} />}
            {search && <FilterChip label={`“${search}”`} onClear={() => setSearch('')} />}
            <button type="button" onClick={clearFilters} className="text-[11px] font-medium text-accent hover:underline">
              {t('aud.filter.clear')}
            </button>
          </div>
        )}
      </motion.div>

      {/* count */}
      <p className="mb-2 text-[12px] text-ink-3" aria-live="polite">{t('aud.count', { count: filtered.length.toLocaleString() })}</p>

      {/* event table */}
      {list.isLoading && (
        <div className="rounded-xl border border-line bg-surface p-4 shadow-card" aria-busy="true">
          {Array.from({ length: 8 }, (_, i) => (
            <div key={i} className="mb-2 h-9 animate-pulse rounded-lg bg-surface-2" style={{ opacity: 1 - i * 0.1 }} />
          ))}
        </div>
      )}
      {!list.isLoading && !list.isError && filtered.length === 0 && (
        <div className="rounded-xl border border-line bg-surface shadow-card">
          <EmptyState title={t('aud.empty.title')} description={t('aud.empty.desc')}
            action={<button type="button" onClick={clearFilters} className="rounded-lg border border-line px-3 py-1.5 text-[12px] font-medium text-accent hover:bg-accent-tint">{t('aud.filter.clear')}</button>} />
        </div>
      )}
      {filtered.length > 0 && (
        <div className="overflow-x-auto rounded-xl border border-line bg-surface shadow-card">
          <table className="w-full border-collapse text-[13px]">
            <thead>
              <tr className="border-b border-line text-left">
                {(['aud.col.time', 'aud.col.event', 'aud.col.actor', 'aud.col.action', 'aud.col.object', 'aud.col.hash', 'aud.col.policy', 'aud.col.chain'] as const).map((k) => (
                  <th key={k} scope="col" className="px-3 py-2.5 text-[11px] font-medium uppercase tracking-[0.04em] text-ink-3">{t(k)}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              <AnimatePresence initial={false}>
                {filtered.map((r, i) => (
                  <EventRow key={r.id} row={r} index={i} restricted={isFintracRow(r) && !canSeeFintrac}
                    onOpen={() => setSelected(r)} onCopy={(msg) => pushToast(msg)} />
                ))}
              </AnimatePresence>
            </tbody>
          </table>
        </div>
      )}

      {/* integrity strip */}
      <div className="mt-4 rounded-xl border border-line bg-surface p-3.5 shadow-card">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <p className="ns-meta">{t('aud.integrity.title')}</p>
            {/* sparkline ticks */}
            <div className="flex items-end gap-[3px]" aria-hidden>
              {Array.from({ length: 24 }, (_, i) => (
                <motion.span key={i}
                  className={cn('w-[5px] rounded-sm',
                    verifyResult === 'fail' ? 'bg-ev-conflict' : verifying ? 'bg-accent' : 'bg-ev-verified/70')}
                  style={{ height: 6 + ((i * 7) % 12) }}
                  animate={verifying ? { opacity: [0.3, 1, 0.3] } : { opacity: 1 }}
                  transition={verifying ? { duration: 0.6, repeat: Infinity, delay: i * 0.05 } : { duration: 0.2 }} />
              ))}
            </div>
          </div>
          <div className="flex items-center gap-2.5">
            {verifyResult === 'ok' && (
              <motion.span initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
                className="inline-flex items-center gap-1.5 rounded-full border border-ev-verified/40 bg-ev-verified/10 px-2.5 py-1 text-[11px] font-medium text-ev-verified">
                <Check size={11} aria-hidden />
                {t('aud.integrity.result', { count: (verify.data?.entries ?? rows.length).toLocaleString() })}
              </motion.span>
            )}
            <button type="button" onClick={runVerify} disabled={verifying}
              className="flex h-8 items-center gap-1.5 rounded-lg bg-accent px-3 text-[12px] font-medium text-white transition-colors hover:bg-accent-hover disabled:opacity-60">
              <Fingerprint size={13} aria-hidden />
              {verifying ? t('aud.integrity.verifying') : t('aud.integrity.verifyFull')}
            </button>
          </div>
        </div>
      </div>

      {/* detail drawer */}
      <EventDrawer row={selected} onClose={() => setSelected(null)} />

      {/* toast */}
      <AnimatePresence>
        {toast && (
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            className="fixed bottom-5 right-5 z-50 flex items-center gap-2 rounded-xl border border-line bg-surface px-4 py-2.5 text-[13px] font-medium text-ink shadow-lift" role="status">
            <Check size={14} className="text-ev-verified" aria-hidden /> {toast}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ── filter chip ─────────────────────────────────────────────────── */

function FilterChip({ label, mono, onClear }: { label: string; mono?: boolean; onClear: () => void }) {
  return (
    <span className="inline-flex h-6 items-center gap-1 rounded-full border border-line bg-surface-2 px-2 text-[11px] font-medium text-ink-2">
      <span className={mono ? 'font-mono' : undefined}>{label}</span>
      <button type="button" onClick={onClear} aria-label="×" className="text-ink-3 hover:text-ev-conflict"><X size={11} /></button>
    </span>
  );
}

/* ── event row ───────────────────────────────────────────────────── */

function EventRow({ row, index, restricted, onOpen, onCopy }: {
  row: AuditRow; index: number; restricted: boolean; onOpen: () => void; onCopy: (msg: string) => void;
}) {
  const { t } = useGovernanceT();
  const [copied, setCopied] = useState(false);
  const kind = actorTypeOf(row);

  const copyId = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(`evt_${row.seq}:${row.hash}`);
      setCopied(true);
      onCopy(t('gov.copied'));
      window.setTimeout(() => setCopied(false), 800);
    } catch { /* clipboard unavailable */ }
  };

  const when = new Date(row.createdAt);
  const time = `${String(when.getHours()).padStart(2, '0')}:${String(when.getMinutes()).padStart(2, '0')}:${String(when.getSeconds()).padStart(2, '0')}.${String(when.getMilliseconds()).padStart(3, '0')}`;

  if (restricted) {
    return (
      <motion.tr initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ delay: index * 0.015, duration: 0.12 }}
        className="border-b border-line/70 last:border-b-0">
        <td className="tnum px-3 py-2 font-mono text-[12px] text-ink-3">{time}</td>
        <td colSpan={7} className="px-3 py-2">
          <span className="inline-flex items-center gap-2 text-[12px] text-ink-3">
            <Lock size={12} className="text-ev-blocked" aria-hidden />
            <span className="font-mono">evt_{row.seq}</span> — {t('aud.restricted.row')}
          </span>
        </td>
      </motion.tr>
    );
  }

  return (
    <motion.tr initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ delay: index * 0.015, duration: 0.12 }}
      onClick={onOpen}
      className="cursor-pointer border-b border-line/70 transition-colors last:border-b-0 hover:bg-surface-2/60">
      <td className="tnum whitespace-nowrap px-3 py-2 font-mono text-[12px] tabular-nums text-ink-2">{time}</td>
      <td className="px-3 py-2">
        <button type="button" onClick={copyId} title={row.hash}
          className="group inline-flex items-center gap-1 font-mono text-[12px] text-accent hover:underline">
          evt_{row.seq}
          {copied ? <Check size={11} className="text-ev-verified" aria-hidden /> : <Copy size={11} className="opacity-0 transition-opacity group-hover:opacity-100" aria-hidden />}
        </button>
      </td>
      <td className="max-w-40 truncate px-3 py-2 text-[12px] text-ink">
        {kind === 'system' ? (
          <span className="inline-flex items-center gap-1.5 text-ink-2"><StatusPill label={t('aud.filter.actor.system')} tone="slate" /></span>
        ) : kind === 'agent' ? (
          <span className="inline-flex flex-wrap items-center gap-1">
            <StatusPill label={row.actorRole ?? 'agent'} tone="violet" />
            {row.modelVersion && <code className="font-mono text-[10.5px] text-ink-3">{row.modelVersion}</code>}
          </span>
        ) : (
          <span>{row.actorRole ?? `#${row.actorId}`}</span>
        )}
      </td>
      <td className="max-w-72 truncate px-3 py-2 text-[13px] font-medium text-ink" title={row.action}>{row.action}</td>
      <td className="px-3 py-2">
        <code className="rounded bg-surface-2 px-1.5 py-0.5 font-mono text-[11px] text-ink-2">{row.subjectType}/{row.subjectId}</code>
      </td>
      <td className="px-3 py-2">
        <code className="font-mono text-[11px] text-ink-3" title={row.payloadHash}>{shortHash(row.payloadHash)}</code>
      </td>
      <td className="px-3 py-2">
        {row.policyDecisionId != null
          ? <StatusPill label={`#${row.policyDecisionId}`} tone="emerald" />
          : <span className="text-[11px] text-ink-3">{t('aud.policy.na')}</span>}
      </td>
      <td className="px-3 py-2">
        <Link2 size={13} className="text-ev-verified" aria-label={t('aud.col.chain')} />
      </td>
    </motion.tr>
  );
}

/* ── event detail drawer ─────────────────────────────────────────── */

function EventDrawer({ row, onClose }: { row: AuditRow | null; onClose: () => void }) {
  const { t } = useGovernanceT();
  const [tampered, setTampered] = useState(false);
  const [check, setCheck] = useState<'idle' | 'busy' | 'match' | 'mismatch'>('idle');

  // reset local state when a different event is opened (render-phase adjust)
  const [openId, setOpenId] = useState(row?.id);
  if (row?.id !== openId) {
    setOpenId(row?.id);
    setTampered(false);
    setCheck('idle');
  }

  useEffect(() => {
    if (!row) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [row, onClose]);

  const runRecompute = useCallback(async (tamper: boolean) => {
    if (!row) return;
    setCheck('busy');
    const actionOverride = tamper ? `${row.action} ` : undefined; // flip one byte
    const recomputed = await recomputeChainHash(row, actionOverride);
    setCheck(recomputed === row.hash ? 'match' : 'mismatch');
  }, [row]);

  const pretty = row ? JSON.stringify({
    seq: row.seq,
    action: tampered ? `${row.action} ` : row.action,
    subject: `${row.subjectType}/${row.subjectId}`,
    actor: { id: row.actorId, role: row.actorRole },
    policyDecisionId: row.policyDecisionId,
    model: row.modelVersion,
    prompt: row.promptVersion,
    payloadHash: row.payloadHash,
    prevHash: row.prevHash,
    hash: row.hash,
  }, null, 2) : '';

  return (
    <AnimatePresence>
      {row && (
        <>
          <motion.div className="fixed inset-0 z-40 bg-ink/20" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }} onClick={onClose} />
          <motion.aside role="dialog" aria-modal="true" aria-label={`evt_${row.seq}`}
            className="fixed right-0 top-0 z-50 flex h-full w-full max-w-[480px] flex-col border-l border-line bg-surface shadow-lift"
            initial={{ x: 480 }} animate={{ x: 0 }} exit={{ x: 480 }}
            transition={{ type: 'spring', stiffness: 320, damping: 32 }}>
            <div className="flex items-center justify-between border-b border-line px-4 py-3">
              <p className="flex items-center gap-2 font-mono text-[13px] font-semibold text-ink">
                <FileJson size={15} className="text-accent" aria-hidden /> evt_{row.seq}
              </p>
              <button type="button" onClick={onClose} aria-label={t('gov.close')}
                className="rounded-lg p-1.5 text-ink-3 hover:bg-surface-2 hover:text-ink">
                <X size={16} />
              </button>
            </div>

            <div className="flex-1 space-y-4 overflow-y-auto p-4">
              {/* payload */}
              <section>
                <h3 className="ns-meta mb-1.5">{t('aud.drawer.payload')}</h3>
                <pre className={cn('max-h-64 overflow-auto rounded-lg border p-3 font-mono text-[12px] leading-5',
                  tampered ? 'border-ev-conflict/50 bg-[#C2492B]/5 text-ev-conflict' : 'border-line bg-surface-2/60 text-ink-2')}>
                  {pretty}
                </pre>
                {tampered && <p className="mt-1 text-[11px] text-ev-conflict">{t('aud.drawer.tamperOn')}</p>}
              </section>

              {/* actor */}
              <section>
                <h3 className="ns-meta mb-1.5">{t('aud.drawer.actor')}</h3>
                <div className="rounded-lg border border-line px-3 py-2 text-[13px] text-ink-2">
                  <p className="font-medium text-ink">{row.actorRole ?? t('aud.filter.actor.system')}</p>
                  {row.modelVersion && (
                    <p className="mt-0.5 font-mono text-[11px] text-ink-3">
                      {t('aud.drawer.model')} {row.modelVersion}
                      {row.promptVersion && <> · {t('aud.drawer.prompt')} {row.promptVersion}</>}
                    </p>
                  )}
                </div>
              </section>

              {/* policy evaluation */}
              <section>
                <h3 className="ns-meta mb-1.5">{t('aud.drawer.policy')}</h3>
                <div className="rounded-lg border border-line px-3 py-2 text-[13px]">
                  {row.policyDecisionId != null ? (
                    <Link to="/compliance" className="inline-flex items-center gap-1.5 font-medium text-accent hover:underline">
                      <ShieldCheck size={13} aria-hidden /> decision #{row.policyDecisionId}
                    </Link>
                  ) : (
                    <span className="text-ink-3">{t('aud.policy.na')}</span>
                  )}
                </div>
              </section>

              {/* hash chain segment */}
              <section>
                <h3 className="ns-meta mb-1.5">{t('aud.drawer.chain')}</h3>
                <ol className="space-y-1.5">
                  {([['aud.drawer.prev', row.prevHash], ['aud.drawer.this', row.hash]] as const).map(([k, h], i) => (
                    <motion.li key={k} initial={{ opacity: 0, x: 8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.2 }}
                      className="flex items-center gap-2 rounded-lg border border-line px-3 py-2">
                      {i > 0 && <Link2 size={12} className="shrink-0 text-ev-verified" aria-hidden />}
                      <span className="w-20 shrink-0 text-[11px] font-medium text-ink-3">{t(k)}</span>
                      <code className="truncate font-mono text-[11px] text-ink-2" title={h}>{h}</code>
                    </motion.li>
                  ))}
                </ol>
              </section>

              {/* recompute + tamper */}
              <section className="space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <button type="button" disabled={check === 'busy'} onClick={() => runRecompute(tampered)}
                    className="flex h-8 items-center gap-1.5 rounded-lg bg-accent px-3 text-[12px] font-medium text-white hover:bg-accent-hover disabled:opacity-60">
                    <Fingerprint size={13} aria-hidden />
                    {check === 'busy' ? t('aud.integrity.verifying') : t('aud.drawer.recompute')}
                  </button>
                  {!tampered ? (
                    <button type="button" onClick={() => { setTampered(true); setCheck('idle'); }}
                      className="flex h-8 items-center gap-1.5 rounded-lg border border-ev-conflict/40 px-3 text-[12px] font-medium text-ev-conflict hover:bg-[#C2492B]/5">
                      <AlertTriangle size={13} aria-hidden /> {t('aud.drawer.tamper')}
                    </button>
                  ) : (
                    <button type="button" onClick={() => { setTampered(false); setCheck('idle'); }}
                      className="flex h-8 items-center gap-1.5 rounded-lg border border-line px-3 text-[12px] font-medium text-ink-2 hover:bg-surface-2">
                      {t('aud.drawer.reset')}
                    </button>
                  )}
                </div>
                {check === 'match' && (
                  <motion.p initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-ev-verified/40 bg-ev-verified/10 px-2.5 py-1.5 text-[12px] font-medium text-ev-verified">
                    <Check size={12} aria-hidden /> {t('aud.drawer.match')}
                  </motion.p>
                )}
                {check === 'mismatch' && (
                  <motion.p initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }} role="alert"
                    className="inline-flex items-center gap-1.5 rounded-lg border border-ev-conflict/40 bg-[#C2492B]/10 px-2.5 py-1.5 text-[12px] font-medium text-ev-conflict">
                    <FileWarning size={12} aria-hidden /> {t('aud.drawer.mismatch')}
                  </motion.p>
                )}
              </section>
            </div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}
