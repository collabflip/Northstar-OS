import { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { motion } from 'framer-motion';
import { ArrowDown, ArrowUp, RefreshCw, Search, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useNow } from '@/lib/useNow';
import { trpc } from '@/providers/trpc';
import { useJourney, relativeAge } from '@/lib/i18n/journey';
import type { JourneyKey } from '@/lib/i18n/journey';
import { EvidenceChip } from '@/components/evidence/EvidenceChip';
import type { EvidenceState } from '@/components/evidence/EvidenceChip';
import { ConfidenceBar } from '@/components/evidence/ConfidenceBar';
import { FreshnessIndicator, freshnessFromAge } from '@/components/evidence/FreshnessIndicator';
import { StatusPill } from '@/components/evidence/StatusPill';
import { EmptyState } from '@/components/evidence/EmptyState';
import { STAGES, STAGE_KEY, STAGE_TONE } from './pipelineMeta';
import type { Stage } from './pipelineMeta';

type SortCol = 'score' | 'activity';

/** Compact per-row consent chips (seed-scale table; one cached query per row). */
function ConsentCell({ contactId, t }: { contactId: number; t: (k: JourneyKey) => string }) {
  const consents = trpc.consents.byContact.useQuery({ contactId });
  if (consents.isLoading) {
    return <span className="inline-block h-5 w-24 animate-pulse rounded-md bg-line/60" />;
  }
  const rows = consents.data ?? [];
  if (rows.length === 0) {
    return <EvidenceChip state="missing" label={t('consent.missing')} animate={false} />;
  }
  const chips = rows.slice(0, 3).map((c) => {
    let state: EvidenceState = 'verified';
    let label = `${c.channel} · ${t('consent.express')}`;
    if (c.status === 'expired') {
      state = 'blocked';
      label = `${c.channel} · ${t('consent.expired')}`;
    } else if (c.status === 'withdrawn') {
      state = 'blocked';
      label = `${c.channel} · ${t('consent.withdrawn')}`;
    } else if (c.basis === 'implied') {
      state = 'estimate';
      label = `${c.channel} · ${t('consent.implied')}`;
    } else {
      label = `${c.channel} · ${t('consent.express')}`;
    }
    return <EvidenceChip key={c.id} state={state} label={label} animate={false} />;
  });
  return (
    <span className="flex flex-wrap items-center gap-1">
      {chips}
      {rows.length > 3 && <span className="text-[11px] text-ink-3">+{rows.length - 3}</span>}
    </span>
  );
}

export default function Sellers() {
  const { t, lang } = useJourney();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const q = params.get('q') ?? '';
  const stage = (params.get('stage') ?? '') as Stage | '';
  const sort = (params.get('sort') === 'activity' ? 'activity' : 'score') as SortCol;
  const dir = params.get('dir') === 'asc' ? 'asc' : 'desc';
  const now = useNow();

  const sellers = trpc.contacts.list.useQuery({ kind: 'seller', stage: stage || undefined });
  const [searchDraft, setSearchDraft] = useState(q);

  const setParam = (k: string, v: string) => {
    const next = new URLSearchParams(params);
    if (v) next.set(k, v);
    else next.delete(k);
    setParams(next, { replace: true });
  };

  const toggleSort = (col: SortCol) => {
    const next = new URLSearchParams(params);
    if (sort === col) next.set('dir', dir === 'desc' ? 'asc' : 'desc');
    else {
      next.set('sort', col);
      next.set('dir', 'desc');
    }
    setParams(next, { replace: true });
  };

  const rows = useMemo(() => {
    let arr = [...(sellers.data ?? [])];
    const needle = q.trim().toLowerCase();
    if (needle) {
      arr = arr.filter((c) =>
        [c.firstName, c.lastName, c.preferredName, c.email, c.leadSource]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()
          .includes(needle),
      );
    }
    arr.sort((a, b) => {
      const av = sort === 'score' ? (a.leadScore ?? -1) : new Date(a.updatedAt ?? 0).getTime();
      const bv = sort === 'score' ? (b.leadScore ?? -1) : new Date(b.updatedAt ?? 0).getTime();
      return dir === 'desc' ? bv - av : av - bv;
    });
    return arr;
  }, [sellers.data, q, sort, dir]);

  const sortIcon = (col: SortCol) =>
    sort === col ? (dir === 'desc' ? <ArrowDown size={11} aria-hidden /> : <ArrowUp size={11} aria-hidden />) : null;

  return (
    <div className="p-6">
      {/* Header */}
      <header className="mb-4 flex flex-wrap items-center gap-3">
        <h1 className="text-[22px] font-semibold leading-7 tracking-[-0.01em] text-ink">{t('sl.title')}</h1>
        <span className="tnum text-[12px] text-ink-3">
          {rows.length} {t('sl.count')}
        </span>
        <div className="flex-1" />
        <form
          role="search"
          onSubmit={(e) => {
            e.preventDefault();
            setParam('q', searchDraft);
          }}
          className="flex h-8 items-center gap-2 rounded-lg border border-line bg-surface px-2.5 focus-within:border-accent"
        >
          <Search size={13} className="text-ink-3" aria-hidden />
          <input
            type="search"
            value={searchDraft}
            onChange={(e) => setSearchDraft(e.target.value)}
            onBlur={() => setParam('q', searchDraft)}
            placeholder={t('sl.search')}
            aria-label={t('sl.search')}
            className="w-52 bg-transparent text-[13px] text-ink placeholder:text-ink-3 focus:outline-none"
          />
          {q && (
            <button
              type="button"
              aria-label={t('sl.clearFilters')}
              onClick={() => {
                setSearchDraft('');
                setParam('q', '');
              }}
              className="text-ink-3 hover:text-ink"
            >
              <X size={12} aria-hidden />
            </button>
          )}
        </form>
      </header>

      {/* Stage filter chips */}
      <div className="mb-3 flex flex-wrap gap-1.5" role="group" aria-label={t('sl.col.stage')}>
        <button
          type="button"
          onClick={() => setParam('stage', '')}
          aria-pressed={!stage}
          className={cn(
            'inline-flex h-6 items-center rounded-full border px-2.5 text-[12px] font-medium',
            !stage ? 'border-accent/30 bg-accent-tint text-accent' : 'border-line bg-surface text-ink-2 hover:border-line-strong',
          )}
        >
          {t('sl.allStages')}
        </button>
        {STAGES.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setParam('stage', stage === s ? '' : s)}
            aria-pressed={stage === s}
            className={cn(
              'inline-flex h-6 items-center rounded-full border px-2.5 text-[12px] font-medium',
              stage === s ? 'border-accent/30 bg-accent-tint text-accent' : 'border-line bg-surface text-ink-2 hover:border-line-strong',
            )}
          >
            {t(STAGE_KEY[s])}
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="ns-card overflow-x-auto">
        {sellers.isLoading ? (
          <table className="w-full min-w-[860px]">
            <tbody>
              {Array.from({ length: 5 }).map((_, i) => (
                <tr key={i} className="border-b border-line/60">
                  {Array.from({ length: 7 }).map((__, j) => (
                    <td key={j} className="px-3 py-3"><span className="block h-4 animate-pulse rounded bg-line/60" /></td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        ) : sellers.isError ? (
          <EmptyState
            title={t('sl.error')}
            action={
              <button type="button" onClick={() => sellers.refetch()} className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-accent px-3 text-[13px] font-medium text-white hover:bg-accent-hover">
                <RefreshCw size={13} aria-hidden />
                {t('common.retry')}
              </button>
            }
          />
        ) : rows.length === 0 ? (
          <EmptyState
            title={t('sl.empty')}
            description={t('sl.emptyHint')}
            action={
              <button
                type="button"
                onClick={() => {
                  setSearchDraft('');
                  setParams(new URLSearchParams(), { replace: true });
                }}
                className="inline-flex h-8 items-center rounded-lg border border-line bg-surface px-3 text-[13px] font-medium text-ink-2 hover:bg-surface-2"
              >
                {t('sl.clearFilters')}
              </button>
            }
          />
        ) : (
          <table className="w-full min-w-[860px] text-left text-[13px]">
            <thead className="sticky top-0 bg-surface">
              <tr className="border-b border-line">
                <th scope="col" className="px-3 py-2 text-[11px] font-medium uppercase tracking-[0.04em] text-ink-3">{t('sl.col.name')}</th>
                <th scope="col" className="px-3 py-2 text-[11px] font-medium uppercase tracking-[0.04em] text-ink-3">{t('sl.col.stage')}</th>
                <th scope="col" className="px-3 py-2">
                  <button type="button" onClick={() => toggleSort('score')} className="inline-flex items-center gap-1 text-[11px] font-medium uppercase tracking-[0.04em] text-ink-3 hover:text-ink">
                    {t('sl.col.score')} {sortIcon('score')}
                  </button>
                </th>
                <th scope="col" className="px-3 py-2 text-[11px] font-medium uppercase tracking-[0.04em] text-ink-3">{t('sl.col.consent')}</th>
                <th scope="col" className="px-3 py-2 text-[11px] font-medium uppercase tracking-[0.04em] text-ink-3">{t('sl.col.language')}</th>
                <th scope="col" className="px-3 py-2 text-[11px] font-medium uppercase tracking-[0.04em] text-ink-3">{t('sl.col.source')}</th>
                <th scope="col" className="px-3 py-2">
                  <button type="button" onClick={() => toggleSort('activity')} className="inline-flex items-center gap-1 text-[11px] font-medium uppercase tracking-[0.04em] text-ink-3 hover:text-ink">
                    {t('sl.col.freshness')} {sortIcon('activity')}
                  </button>
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((c, i) => {
                const ageH = (now - new Date(c.updatedAt ?? c.createdAt).getTime()) / 3_600_000;
                return (
                  <motion.tr
                    key={c.id}
                    initial={{ y: 8, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    transition={{ duration: 0.2, delay: i * 0.03 }}
                    onClick={() => navigate(`/sellers/${c.id}`)}
                    onKeyDown={(e) => e.key === 'Enter' && navigate(`/sellers/${c.id}`)}
                    tabIndex={0}
                    aria-label={`${t('sl.row.open')} — ${c.preferredName ?? `${c.firstName} ${c.lastName}`}`}
                    className="cursor-pointer border-b border-line/60 last:border-0 hover:bg-accent-tint/40 focus-visible:outline-2 focus-visible:outline-accent"
                  >
                    <td className="px-3 py-2.5">
                      <p className="font-medium text-ink">{c.preferredName ?? `${c.firstName} ${c.lastName}`}</p>
                      {c.email && <p className="text-[12px] text-ink-3">{c.email}</p>}
                    </td>
                    <td className="px-3 py-2.5">
                      <StatusPill label={t(STAGE_KEY[c.stage as Stage])} tone={STAGE_TONE[c.stage as Stage]} />
                    </td>
                    <td className="px-3 py-2.5">
                      {typeof c.leadScore === 'number' ? (
                        <span className="flex items-center gap-2">
                          <span className="tnum font-medium text-ink">{c.leadScore}</span>
                          <ConfidenceBar value={c.leadScore} color="#0E5A50" showLabel={false} />
                        </span>
                      ) : (
                        <span className="text-ink-3">{t('common.na')}</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5"><ConsentCell contactId={c.id} t={t} /></td>
                    <td className="px-3 py-2.5">
                      <span className={cn('inline-flex h-5 items-center rounded-md border px-1.5 text-[11px] font-medium', c.language === 'fr-CA' ? 'border-accent/30 bg-accent-tint text-accent' : 'border-line bg-surface-2 text-ink-2')}>
                        {c.language === 'fr-CA' ? 'fr-CA' : 'EN'}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-ink-2">{c.leadSource ?? t('common.na')}</td>
                    <td className="px-3 py-2.5">
                      <FreshnessIndicator
                        label={relativeAge(c.updatedAt ?? c.createdAt, lang)}
                        level={freshnessFromAge(ageH)}
                        exact={new Date(c.updatedAt ?? c.createdAt).toLocaleString(lang === 'fr' ? 'fr-CA' : 'en-CA')}
                      />
                    </td>
                  </motion.tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
