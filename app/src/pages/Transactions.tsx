import { Link } from 'react-router';
import { motion } from 'framer-motion';
import { format, formatDistanceToNowStrict } from 'date-fns';
import { AlertTriangle, ChevronRight, Clock, FileWarning, Landmark } from 'lucide-react';
import { useOps } from '@/lib/i18n/ops';
import type { OpsKey } from '@/lib/i18n/ops';
import { formatCAD } from '@/lib/i18n';
import { trpc } from '@/providers/trpc';
import { EmptyState } from '@/components/evidence/EmptyState';
import { StatusPill } from '@/components/evidence/StatusPill';
import type { StatusTone } from '@/components/evidence/StatusPill';

const STATUS_TONE: Record<string, StatusTone> = {
  conditional: 'amber',
  firm: 'emerald',
  lawyer_handoff: 'accent',
  closed: 'neutral',
  collapsed: 'red',
};

export default function Transactions() {
  const { t, lang, dfLocale } = useOps();
  const txns = trpc.transactions.list.useQuery(undefined, { retry: 1 });
  const props = trpc.properties.list.useQuery(undefined, { retry: 1 });

  const addressOf = (propertyId: number | null) => {
    const p = props.data?.find((x) => x.id === propertyId);
    return p ? `${p.addressLine1}, ${p.city}` : `#${propertyId ?? '—'}`;
  };

  return (
    <div className="p-6">
      <header className="mb-4">
        <h1 className="text-[22px] font-semibold leading-7 tracking-[-0.01em] text-ink">{t('tl.title')}s</h1>
      </header>

      {txns.isLoading && (
        <div className="rounded-xl border border-line bg-surface p-4 shadow-card" aria-busy="true">
          {Array.from({ length: 3 }, (_, i) => (
            <div key={i} className="mb-2 h-14 animate-pulse rounded-lg bg-surface-2" style={{ opacity: 1 - i * 0.2 }} />
          ))}
        </div>
      )}

      {txns.isError && (
        <div className="rounded-xl border border-ev-conflict/40 bg-surface p-4">
          <p className="flex items-center gap-2 text-[14px] font-semibold text-ev-conflict">
            <FileWarning size={15} aria-hidden /> {t('ops.errorTitle')}
          </p>
          <p className="mt-1 text-[13px] text-ink-2">{t('ops.errorBody')}</p>
          <button type="button" onClick={() => txns.refetch()} className="mt-2 rounded-lg border border-line px-3 py-1 text-[12px] font-medium text-accent hover:bg-accent-tint">
            {t('ops.retry')}
          </button>
        </div>
      )}

      {!txns.isLoading && !txns.isError && (txns.data ?? []).length === 0 && (
        <div className="rounded-xl border border-line bg-surface shadow-card">
          <EmptyState title={t('txns.empty.title')} description={t('txns.empty.body')} />
        </div>
      )}

      {(txns.data ?? []).length > 0 && (
        <div className="overflow-x-auto rounded-xl border border-line bg-surface shadow-card">
          <table className="w-full border-collapse text-[13px]">
            <thead>
              <tr className="border-b border-line text-left">
                {(['txns.col.property', 'txns.col.parties', 'txns.col.accepted', 'txns.col.status', 'txns.col.nextDeadline', 'txns.col.exceptions'] as OpsKey[]).map((k) => (
                  <th key={k} scope="col" className="px-3 py-2.5 text-[11px] font-medium uppercase tracking-[0.04em] text-ink-3">{t(k)}</th>
                ))}
                <th scope="col" className="w-8" />
              </tr>
            </thead>
            <tbody>
              {(txns.data ?? []).map((x, i) => (
                <motion.tr
                  key={x.id}
                  initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}
                  className="border-b border-line/70 transition-colors last:border-b-0 hover:bg-surface-2/60"
                >
                  <td className="px-3 py-2.5">
                    <Link to={`/transactions/${x.id}`} className="flex items-center gap-2 font-medium text-ink hover:text-accent">
                      <Landmark size={14} className="shrink-0 text-accent" aria-hidden />
                      {addressOf(x.propertyId)}
                    </Link>
                  </td>
                  <td className="px-3 py-2.5 text-ink-2">
                    <span className="block text-[12px]">{t('txns.seller')}: {x.sellerName ?? '—'}</span>
                    <span className="block text-[12px]">{t('txns.buyer')}: {x.buyerName ?? '—'}</span>
                  </td>
                  <td className="tnum px-3 py-2.5 text-ink">
                    {x.acceptedPrice != null ? formatCAD(x.acceptedPrice, lang) : '—'}
                    {x.acceptedAt && (
                      <span className="block text-[11px] text-ink-3">{format(new Date(x.acceptedAt), 'd MMM yyyy', { locale: dfLocale })}</span>
                    )}
                  </td>
                  <td className="px-3 py-2.5">
                    <StatusPill label={t(`txn.status.${x.status}` as OpsKey)} tone={STATUS_TONE[x.status] ?? 'neutral'} />
                  </td>
                  <DeadlineCell id={x.id} />
                  <ExceptionCell id={x.id} />
                  <td className="px-2 py-2.5">
                    <Link to={`/transactions/${x.id}`} aria-label={`${t('tl.title')} #${x.id}`} className="text-ink-3 hover:text-accent">
                      <ChevronRight size={15} />
                    </Link>
                  </td>
                </motion.tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function DeadlineCell({ id }: { id: number }) {
  const { t, dfLocale } = useOps();
  const q = trpc.transactions.byId.useQuery({ id }, { retry: 1 });
  if (q.isLoading) return <td className="px-3 py-2.5"><span className="block h-4 w-28 animate-pulse rounded bg-surface-2" /></td>;
  const next = q.data?.health.nextDeadline;
  const conds = q.data?.health.conditionsRemaining ?? 0;
  if (!next) return <td className="px-3 py-2.5 text-[12px] text-ink-3">{t('txns.noDeadline')}</td>;
  const due = new Date(next.dueAt);
  return (
    <td className="px-3 py-2.5">
      <span className="flex items-center gap-1.5 text-[12px] font-medium text-ink">
        <Clock size={12} className="text-ev-estimate" aria-hidden />
        <span className="max-w-44 truncate">{next.title}</span>
      </span>
      <span className="tnum block text-[11px] text-ev-estimate">
        {format(due, 'EEE d MMM · HH:mm', { locale: dfLocale })} ({formatDistanceToNowStrict(due, { locale: dfLocale, addSuffix: true })})
      </span>
      <span className="block text-[11px] text-ink-3">{t('txns.conditionsLeft', { n: conds })}</span>
    </td>
  );
}

function ExceptionCell({ id }: { id: number }) {
  const q = trpc.transactions.byId.useQuery({ id }, { retry: 1 });
  if (q.isLoading) return <td className="px-3 py-2.5"><span className="block h-4 w-8 animate-pulse rounded bg-surface-2" /></td>;
  const ex = q.data?.health.exceptions ?? [];
  if (ex.length === 0) return <td className="px-3 py-2.5 text-[12px] text-ink-3">0</td>;
  return (
    <td className="px-3 py-2.5">
      <StatusPill label={String(ex.length)} tone="red" />
      <span className="mt-0.5 flex max-w-52 items-start gap-1 text-[11px] text-ev-conflict">
        <AlertTriangle size={11} className="mt-0.5 shrink-0" aria-hidden />
        <span className="truncate" title={ex[0].reason}>{ex[0].title}</span>
      </span>
    </td>
  );
}
