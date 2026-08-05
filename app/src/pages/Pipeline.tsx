import { useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { AnimatePresence, motion } from 'framer-motion';
import {
  DndContext, DragOverlay, PointerSensor, useDraggable, useDroppable,
  useSensor, useSensors,
} from '@dnd-kit/core';
import type { DragEndEvent, DragStartEvent } from '@dnd-kit/core';
import {
  Plus, ChevronDown, LayoutGrid, List, MoreHorizontal, ShieldAlert, RefreshCw, X,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useT } from '@/lib/i18n';
import { trpc } from '@/providers/trpc';
import { useJourney, formatCadCompact, relativeAge } from '@/lib/i18n/journey';
import type { JourneyKey } from '@/lib/i18n/journey';
import { EvidenceChip } from '@/components/evidence/EvidenceChip';
import { ConfidenceBar } from '@/components/evidence/ConfidenceBar';
import { FreshnessIndicator, freshnessFromAge } from '@/components/evidence/FreshnessIndicator';
import { StatusPill } from '@/components/evidence/StatusPill';
import { PolicyGatePanel } from '@/components/evidence/PolicyGatePanel';
import type { GateCheck } from '@/components/evidence/PolicyGatePanel';
import { EmptyState } from '@/components/evidence/EmptyState';
import { STAGES, STAGE_KEY, STAGE_TONE, propertyPhoto } from './pipelineMeta';
import type { Stage } from './pipelineMeta';
import { useNow } from '@/lib/useNow';

/* ── Stages ─────────────────────────────────────────────────────── */

/** Moves into these stages cross the governance boundary (backend-gated). */
const GATED = new Set<Stage>(['approved', 'live_listing']);
/** Stage index at/after which a card routes to the dossier instead of Seller 360. */
const DOSSIER_STAGE_IDX = STAGES.indexOf('dossier_ready');

/* Demo est. values per stage (tabular column totals, seed-universe realism). */
const STAGE_VALUE: Partial<Record<Stage, number>> = {
  new_lead: 1_500_000, qualified: 1_050_000, consultation_booked: 2_200_000,
  dossier_ready: 1_245_000, strategy_proposed: 925_000, live_listing: 1_849_000,
  offer_review: 1_245_000, under_contract: 1_120_000,
};

const AVATARS = ['/avatar-maya.png', '/avatar-sofia.png'];

interface BoardCard {
  contactId: number;
  name: string;
  stage: Stage;
  leadScore: number | null;
  leadScoreReasons: unknown;
  leadSource: string | null;
  isSrp: boolean;
  address: string | null;
  propertyId: number | null;
  updatedAt?: Date | null;
}

interface GateState {
  card: BoardCard;
  fromStage: Stage;
  toStage: Stage;
  failed?: { check: string; message: string; ruleIds: string[] }[];
}

/* ── Gate checklist (pre-submit preview; server re-evaluates at commit) ── */
function gateChecks(failed?: GateState['failed']): GateCheck[] {
  const base: [string, string, string][] = [
    ['tenant', 'Tenant scope', 'hrl-001'],
    ['actor', 'Actor identity', 'usr-mchen'],
    ['role', 'Role authorization', 'registrant'],
    ['jurisdiction', 'Jurisdiction', 'ON-TRESA'],
    ['brokerage_policy', 'Brokerage policy', 'pol-v2.3.1'],
    ['consent', 'CASL consent', 'expr-2026-06-22'],
    ['suppression', 'Suppression list', '0 hits'],
    ['purpose', 'Purpose limitation', 'seller-followup'],
    ['approval_freshness', 'Approval freshness', '26 h < 72 h'],
    ['data_freshness', 'Data freshness', '2 h'],
    ['payload_destination_binding', 'Payload↔destination binding', 'sha256:9f2c…e41a'],
    ['budget_frequency', 'Budget / frequency cap', 'n/a'],
    ['idempotency', 'Idempotency key', 'idem-pipeline-move'],
    ['audit_fields', 'Audit fields complete', '14 fields'],
  ];
  return base.map(([id, label, detail]) => {
    const hit = failed?.find((f) => f.check === id);
    return {
      id,
      label,
      detail: hit ? (hit.ruleIds[0] ?? detail) : detail,
      status: hit ? ('fail' as const) : ('pass' as const),
    };
  });
}

/* ── Card ───────────────────────────────────────────────────────── */

function CardBody({ card, t, lang, overlay }: { card: BoardCard; t: (k: JourneyKey) => string; lang: 'en' | 'fr'; overlay?: boolean }) {
  const now = useNow();
  const photo = propertyPhoto(card.address);
  const reasons = Array.isArray(card.leadScoreReasons) ? (card.leadScoreReasons as string[]) : [];
  return (
    <div
      className={cn(
        'w-full rounded-xl border border-line bg-surface p-2.5 text-left shadow-card transition-[border-color,transform] duration-140',
        !overlay && 'hover:-translate-y-px hover:border-line-strong',
        overlay && 'rotate-[1.5deg] scale-[1.03] shadow-lift',
      )}
    >
      <div className="flex items-start gap-2">
        {photo && <img src={photo} alt="" className="h-12 w-12 shrink-0 rounded-lg border border-line object-cover" />}
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-semibold leading-4 text-ink">{card.address ?? card.name}</p>
          <p className="truncate text-[12px] text-ink-3">{card.address ? card.name : t('common.na')}</p>
        </div>
      </div>
      <div className="mt-2 flex items-center justify-between gap-2">
        {typeof card.leadScore === 'number' ? (
          <span className="flex items-center gap-2">
            <span className="tnum font-serif text-[18px] font-semibold leading-none text-ink">{card.leadScore}</span>
            <ConfidenceBar value={card.leadScore} color="#0E5A50" showLabel={false} />
          </span>
        ) : <span />}
        <span className="flex -space-x-1.5">
          {AVATARS.slice(0, 2).map((a) => (
            <img key={a} src={a} alt="" className="h-5 w-5 rounded-full border border-surface object-cover" />
          ))}
        </span>
      </div>
      <div className="mt-2 flex flex-wrap gap-1">
        {card.leadSource && <EvidenceChip state="external" label={card.leadSource} animate={false} />}
        {card.isSrp && <EvidenceChip state="assumption" label="SRP" animate={false} />}
        {reasons.slice(0, 1).map((r) => (
          <EvidenceChip key={r} state="ai" label={r} animate={false} />
        ))}
      </div>
      {card.updatedAt && (
        <div className="mt-2">
          <FreshnessIndicator
            label={relativeAge(card.updatedAt, lang)}
            level={freshnessFromAge((now - new Date(card.updatedAt).getTime()) / 3_600_000)}
            exact={new Date(card.updatedAt).toLocaleString()}
          />
        </div>
      )}
    </div>
  );
}

function DraggableCard({
  card, onOpen, onQuickMove, t, lang, moveLabel,
}: {
  card: BoardCard;
  onOpen: () => void;
  onQuickMove: (to: Stage) => void;
  t: (k: JourneyKey) => string;
  lang: 'en' | 'fr';
  moveLabel: (s: Stage) => string;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `card-${card.contactId}`,
    data: { stage: card.stage },
  });
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div ref={setNodeRef} className={cn('relative', isDragging && 'opacity-30')}>
      <div {...listeners} {...attributes}>
        <button type="button" onClick={onOpen} className="block w-full">
          <CardBody card={card} t={t} lang={lang} />
        </button>
      </div>
      {/* Keyboard-move alternative + quick actions */}
      <div className="absolute right-1.5 top-1.5">
        <button
          type="button"
          aria-label={t('pl.moveCard')}
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((v) => !v)}
          className="rounded-md p-1 text-ink-3 hover:bg-surface-2 hover:text-ink focus-visible:outline-2 focus-visible:outline-accent"
        >
          <MoreHorizontal size={14} aria-hidden />
        </button>
        <AnimatePresence>
          {menuOpen && (
            <motion.div
              role="menu"
              className="absolute right-0 top-full z-30 mt-1 w-52 rounded-xl border border-line bg-surface p-1 shadow-lift"
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 4 }}
              transition={{ duration: 0.14 }}
            >
              <p className="ns-meta px-2 pb-1 pt-1.5">{t('pl.move')}</p>
              {STAGES.filter((s) => s !== card.stage).map((s) => (
                <button
                  key={s}
                  type="button"
                  role="menuitem"
                  onClick={() => { setMenuOpen(false); onQuickMove(s); }}
                  className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-[12.5px] text-ink hover:bg-surface-2"
                >
                  {GATED.has(s) && <ShieldAlert size={12} className="shrink-0 text-ev-conflict" aria-hidden />}
                  {moveLabel(s)}
                </button>
              ))}
              <div className="my-1 h-px bg-line" />
              <Link to={`/audit?subjectType=contact&subjectId=${card.contactId}`} role="menuitem" onClick={() => setMenuOpen(false)} className="block rounded-lg px-2 py-1.5 text-[12.5px] text-accent hover:bg-surface-2">
                {t('pl.menu.audit')}
              </Link>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

function Column({
  stage, cards, children, count, t, lang, index,
}: {
  stage: Stage;
  cards: BoardCard[];
  children: React.ReactNode;
  count: number;
  t: (k: JourneyKey) => string;
  lang: 'en' | 'fr';
  index: number;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: stage });
  const value = STAGE_VALUE[stage];
  return (
    <motion.section
      initial={{ x: 24, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      transition={{ duration: 0.28, delay: index * 0.05, ease: 'easeOut' }}
      className={cn(
        'flex w-72 shrink-0 flex-col rounded-xl border p-2 transition-colors duration-150',
        isOver ? 'border-accent/40 bg-accent-tint' : 'border-line bg-surface-2',
      )}
      aria-label={t(STAGE_KEY[stage])}
    >
      <header className="flex items-baseline justify-between gap-2 px-1.5 pb-2 pt-1">
        <h3 className="text-[11px] font-medium uppercase tracking-[0.04em] text-ink-3">
          {t(STAGE_KEY[stage])}
          <span className="tnum ml-1.5 text-ink-2">{count}</span>
        </h3>
        {value != null && count > 0 && (
          <span className="tnum text-[11px] text-ink-3">{formatCadCompact(value, lang)}</span>
        )}
      </header>
      <div ref={setNodeRef} className="flex min-h-24 flex-1 flex-col gap-2">
        {cards.length === 0 ? (
          <p className="flex flex-1 items-center justify-center rounded-lg border border-dashed border-line-strong px-3 py-6 text-center text-[12px] text-ink-3">
            {stage === 'approved' ? t('pl.emptyStage') : t('pl.emptyStageGeneric')}
          </p>
        ) : children}
      </div>
    </motion.section>
  );
}

/* ── Page ───────────────────────────────────────────────────────── */

export default function Pipeline() {
  const { t, lang } = useJourney();
  const { t: ts } = useT();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const view = params.get('view') === 'list' ? 'list' : 'board';
  const sortBy = params.get('sort') === 'activity' ? 'activity' : 'score';

  const board = trpc.pipeline.board.useQuery();
  const contacts = trpc.contacts.list.useQuery({ kind: 'seller' });
  const utils = trpc.useUtils();

  const [activeCard, setActiveCard] = useState<BoardCard | null>(null);
  const [gate, setGate] = useState<GateState | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [newLeadOpen, setNewLeadOpen] = useState(false);
  const [leadForm, setLeadForm] = useState({ firstName: '', lastName: '', email: '' });

  const showToast = (msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast(null), 3600);
  };

  const moveCard = trpc.pipeline.moveCard.useMutation({
    onSuccess: async (res) => {
      await utils.pipeline.board.invalidate();
      await utils.contacts.list.invalidate();
      if (res.moved) {
        setGate(null);
        showToast(t('pl.toast.moved'));
      } else {
        setGate((g) => (g ? { ...g, failed: res.reasons as GateState['failed'] } : g));
        showToast(`${t('pl.toast.blocked')} — ${t('pl.gate.returned')}`);
      }
    },
  });

  const createLead = trpc.contacts.create.useMutation({
    onSuccess: async () => {
      await utils.pipeline.board.invalidate();
      await utils.contacts.list.invalidate();
      setNewLeadOpen(false);
      setLeadForm({ firstName: '', lastName: '', email: '' });
    },
  });

  /* Merge freshness from contacts.list into board cards. */
  const cards = useMemo<BoardCard[]>(() => {
    const updatedById = new Map<number, Date | null>();
    for (const c of contacts.data ?? []) updatedById.set(c.id, c.updatedAt ?? null);
    return (board.data?.cards ?? []).map((c) => ({
      ...c,
      stage: c.stage as Stage,
      updatedAt: updatedById.get(c.contactId) ?? null,
    }));
  }, [board.data, contacts.data]);

  const sorted = useMemo(() => {
    const arr = [...cards];
    if (sortBy === 'score') arr.sort((a, b) => (b.leadScore ?? -1) - (a.leadScore ?? -1));
    else arr.sort((a, b) => new Date(b.updatedAt ?? 0).getTime() - new Date(a.updatedAt ?? 0).getTime());
    return arr;
  }, [cards, sortBy]);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  const requestMove = (card: BoardCard, to: Stage) => {
    if (to === card.stage) return;
    if (GATED.has(to)) {
      setGate({ card, fromStage: card.stage, toStage: to });
    } else {
      moveCard.mutate({ contactId: card.contactId, toStage: to });
    }
  };

  const onDragStart = (e: DragStartEvent) => {
    const card = cards.find((c) => `card-${c.contactId}` === e.active.id);
    setActiveCard(card ?? null);
  };

  const onDragEnd = (e: DragEndEvent) => {
    const card = cards.find((c) => `card-${c.contactId}` === e.active.id);
    setActiveCard(null);
    if (!card || !e.over) return;
    const to = e.over.id as Stage;
    if (STAGES.includes(to)) requestMove(card, to);
  };

  const openCard = (card: BoardCard) => {
    const stageIdx = STAGES.indexOf(card.stage);
    if (stageIdx >= DOSSIER_STAGE_IDX && card.propertyId) navigate(`/properties/${card.propertyId}`);
    else navigate(`/sellers/${card.contactId}`);
  };

  const setParam = (k: string, v: string) => {
    const next = new URLSearchParams(params);
    next.set(k, v);
    setParams(next, { replace: true });
  };

  const loading = board.isLoading;
  const errored = board.isError;

  return (
    <div className="flex h-full flex-col p-6">
      {/* Header */}
      <header className="mb-4 flex flex-wrap items-center gap-3">
        <h1 className="text-[22px] font-semibold leading-7 tracking-[-0.01em] text-ink">{t('pl.title')}</h1>
        <div className="flex items-center gap-1.5">
          {[t('pl.filter.all'), t('pl.filter.ontario')].map((chip, i) => (
            <span
              key={chip}
              className={cn(
                'inline-flex h-6 items-center rounded-full border px-2.5 text-[12px] font-medium',
                i === 0 ? 'border-accent/30 bg-accent-tint text-accent' : 'border-line bg-surface text-ink-2',
              )}
            >
              {chip}
            </span>
          ))}
          <button type="button" className="inline-flex h-6 items-center gap-1 rounded-full border border-line bg-surface px-2.5 text-[12px] font-medium text-ink-2 hover:border-line-strong">
            {t('pl.filter.assignee')}
            <ChevronDown size={12} aria-hidden />
          </button>
        </div>
        <div className="flex-1" />
        <div className="flex items-center gap-2">
          <div role="group" aria-label={t('pl.sort.score')} className="flex h-8 items-center rounded-lg border border-line bg-surface-2 p-0.5 text-[12px] font-medium">
            {(['score', 'activity'] as const).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setParam('sort', s)}
                aria-pressed={sortBy === s}
                className={cn('h-7 rounded-md px-2.5', sortBy === s ? 'bg-surface text-ink shadow-card' : 'text-ink-3 hover:text-ink-2')}
              >
                {s === 'score' ? t('pl.sort.score') : t('pl.sort.activity')}
              </button>
            ))}
          </div>
          <div role="group" aria-label={t('pl.view.board')} className="flex h-8 items-center rounded-lg border border-line bg-surface-2 p-0.5">
            {(['board', 'list'] as const).map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => setParam('view', v)}
                aria-pressed={view === v}
                aria-label={v === 'board' ? t('pl.view.board') : t('pl.view.list')}
                className={cn('flex h-7 items-center gap-1 rounded-md px-2 text-[12px] font-medium', view === v ? 'bg-surface text-ink shadow-card' : 'text-ink-3 hover:text-ink-2')}
              >
                {v === 'board' ? <LayoutGrid size={13} aria-hidden /> : <List size={13} aria-hidden />}
                {v === 'board' ? t('pl.view.board') : t('pl.view.list')}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => setNewLeadOpen(true)}
            className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-accent px-3 text-[13px] font-medium text-white hover:bg-accent-hover"
          >
            <Plus size={14} aria-hidden />
            {ts('action.newSellerLead')}
          </button>
        </div>
      </header>

      {/* Body */}
      {loading ? (
        <div className="flex gap-3 overflow-x-auto pb-4" aria-label={t('pl.loading.board')}>
          {STAGES.map((s) => (
            <div key={s} className="w-72 shrink-0 rounded-xl border border-line bg-surface-2 p-2">
              <div className="mb-2 h-4 w-24 animate-pulse rounded bg-line" />
              <div className="space-y-2">
                <div className="h-24 animate-pulse rounded-xl bg-line/60" />
                <div className="h-24 animate-pulse rounded-xl bg-line/40" />
              </div>
            </div>
          ))}
        </div>
      ) : errored ? (
        <div className="ns-card">
          <EmptyState
            title={t('pl.error')}
            action={
              <button type="button" onClick={() => board.refetch()} className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-accent px-3 text-[13px] font-medium text-white hover:bg-accent-hover">
                <RefreshCw size={13} aria-hidden />
                {t('common.retry')}
              </button>
            }
          />
        </div>
      ) : view === 'board' ? (
        <DndContext sensors={sensors} onDragStart={onDragStart} onDragEnd={onDragEnd}>
          <div className="flex flex-1 gap-3 overflow-x-auto pb-4">
            {STAGES.map((stage, i) => {
              const stageCards = sorted.filter((c) => c.stage === stage);
              return (
                <Column key={stage} stage={stage} cards={stageCards} count={stageCards.length} t={t} lang={lang} index={i}>
                  {stageCards.map((card, ci) => (
                    <motion.div
                      key={card.contactId}
                      initial={{ y: 12, opacity: 0 }}
                      animate={{ y: 0, opacity: 1 }}
                      transition={{ duration: 0.24, delay: i * 0.05 + ci * 0.035 }}
                    >
                      <DraggableCard
                        card={card}
                        onOpen={() => openCard(card)}
                        onQuickMove={(to) => requestMove(card, to)}
                        t={t}
                        lang={lang}
                        moveLabel={(s) => t(STAGE_KEY[s])}
                      />
                    </motion.div>
                  ))}
                </Column>
              );
            })}
          </div>
          <DragOverlay>{activeCard ? <CardBody card={activeCard} t={t} lang={lang} overlay /> : null}</DragOverlay>
        </DndContext>
      ) : (
        /* List view */
        <div className="ns-card overflow-x-auto">
          <table className="w-full min-w-[760px] text-left text-[13px]">
            <thead>
              <tr className="border-b border-line">
                {[t('pl.contact'), t('pl.stage'), t('pl.score'), t('pl.value'), t('pl.lastActivity'), t('pl.source')].map((h) => (
                  <th key={h} scope="col" className="px-3 py-2 text-[11px] font-medium uppercase tracking-[0.04em] text-ink-3">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sorted.map((card) => (
                <tr
                  key={card.contactId}
                  onClick={() => openCard(card)}
                  className="cursor-pointer border-b border-line/60 last:border-0 hover:bg-accent-tint/40"
                >
                  <td className="px-3 py-2.5">
                    <p className="font-medium text-ink">{card.name}</p>
                    {card.address && <p className="text-[12px] text-ink-3">{card.address}</p>}
                  </td>
                  <td className="px-3 py-2.5"><StatusPill label={t(STAGE_KEY[card.stage])} tone={STAGE_TONE[card.stage]} /></td>
                  <td className="tnum px-3 py-2.5 font-medium text-ink">{card.leadScore ?? t('common.na')}</td>
                  <td className="tnum px-3 py-2.5 text-ink-2">{STAGE_VALUE[card.stage] ? formatCadCompact(STAGE_VALUE[card.stage]!, lang) : t('common.na')}</td>
                  <td className="px-3 py-2.5 text-ink-3">{card.updatedAt ? relativeAge(card.updatedAt, lang) : t('common.na')}</td>
                  <td className="px-3 py-2.5 text-ink-2">{card.leadSource ?? t('common.na')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Policy gate sheet */}
      <AnimatePresence>
        {gate && (
          <>
            <motion.div
              className="fixed inset-0 z-40 bg-ink/20"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              transition={{ duration: 0.18 }}
              onClick={() => setGate(null)}
              aria-hidden
            />
            <motion.div
              role="dialog"
              aria-modal="true"
              aria-label={t('pl.gate.title')}
              className="fixed bottom-0 left-1/2 z-50 w-[520px] max-w-[94vw] -translate-x-1/2 rounded-t-2xl border border-line bg-surface p-4 shadow-lift"
              initial={{ y: 320, x: '-50%' }}
              animate={{ y: 0, x: '-50%' }}
              exit={{ y: 320, x: '-50%' }}
              transition={{ type: 'spring', stiffness: 380, damping: 34 }}
            >
              <div className="mb-3 flex items-start justify-between gap-3">
                <div>
                  <h2 className="flex items-center gap-2 text-[16px] font-semibold text-ink">
                    <ShieldAlert size={16} className="text-ev-conflict" aria-hidden />
                    {t('pl.gate.title')}
                  </h2>
                  <p className="mt-1 text-[13px] text-ink-2">
                    {gate.card.name} · {t(STAGE_KEY[gate.fromStage])} → <strong>{t(STAGE_KEY[gate.toStage])}</strong>
                  </p>
                </div>
                <button type="button" onClick={() => setGate(null)} aria-label={ts('action.close')} className="rounded-md p-1.5 text-ink-3 hover:bg-surface-2 hover:text-ink">
                  <X size={16} />
                </button>
              </div>
              <p className="mb-3 rounded-lg bg-surface-2 p-2.5 text-[12.5px] leading-[18px] text-ink-2">
                {t('pl.gate.requirements')}
              </p>
              {gate.failed && gate.failed.length > 0 && (
                <div className="mb-3 rounded-lg border border-ev-conflict/30 bg-[#C2492B]/5 p-2.5">
                  <p className="mb-1 text-[12px] font-semibold text-ev-conflict">{t('pl.gate.blocked')}</p>
                  <ul className="space-y-1 text-[12px] text-ink-2">
                    {gate.failed.map((f) => (
                      <li key={f.check}>
                        <code className="font-mono text-[11px] text-ink-3">{f.check}</code> — {f.message}
                        {f.ruleIds.length > 0 && <code className="ml-1 font-mono text-[11px] text-ev-conflict">{f.ruleIds.join(', ')}</code>}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              <PolicyGatePanel checks={gateChecks(gate.failed)} />
              <div className="mt-3 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setGate(null)}
                  className="inline-flex h-8 items-center rounded-lg border border-line bg-surface px-3 text-[13px] font-medium text-ink-2 hover:bg-surface-2"
                >
                  {t('pl.gate.cancel')}
                </button>
                <button
                  type="button"
                  disabled={moveCard.isPending}
                  onClick={() => moveCard.mutate({ contactId: gate.card.contactId, toStage: gate.toStage })}
                  className="inline-flex h-8 items-center rounded-lg bg-accent px-3 text-[13px] font-medium text-white hover:bg-accent-hover disabled:opacity-50"
                >
                  {moveCard.isPending ? '…' : t('pl.gate.approveMove')}
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* New seller lead dialog */}
      <AnimatePresence>
        {newLeadOpen && (
          <>
            <motion.div className="fixed inset-0 z-40 bg-ink/20" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setNewLeadOpen(false)} aria-hidden />
            <motion.div
              role="dialog"
              aria-modal="true"
              aria-label={t('pl.newLead.title')}
              className="fixed left-1/2 top-1/2 z-50 w-[400px] max-w-[92vw] rounded-2xl border border-line bg-surface p-4 shadow-lift"
              initial={{ opacity: 0, scale: 0.96, x: '-50%', y: '-50%' }}
              animate={{ opacity: 1, scale: 1, x: '-50%', y: '-50%' }}
              exit={{ opacity: 0, scale: 0.96, x: '-50%', y: '-50%' }}
              transition={{ type: 'spring', stiffness: 380, damping: 34 }}
            >
              <h2 className="mb-3 text-[16px] font-semibold text-ink">{t('pl.newLead.title')}</h2>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  createLead.mutate({
                    firstName: leadForm.firstName,
                    lastName: leadForm.lastName,
                    email: leadForm.email || undefined,
                    kind: 'seller',
                    language: lang === 'fr' ? 'fr-CA' : 'en',
                  });
                }}
                className="space-y-2.5"
              >
                {(['firstName', 'lastName', 'email'] as const).map((f) => (
                  <label key={f} className="block">
                    <span className="mb-1 block text-[12px] font-medium text-ink-2">{t(`pl.newLead.${f}` as JourneyKey)}</span>
                    <input
                      type={f === 'email' ? 'email' : 'text'}
                      required={f !== 'email'}
                      value={leadForm[f]}
                      onChange={(e) => setLeadForm((v) => ({ ...v, [f]: e.target.value }))}
                      className="h-9 w-full rounded-lg border border-line bg-surface px-3 text-[13px] text-ink focus:border-accent focus:outline-none"
                    />
                  </label>
                ))}
                <div className="flex justify-end gap-2 pt-1">
                  <button type="button" onClick={() => setNewLeadOpen(false)} className="h-8 rounded-lg border border-line px-3 text-[13px] font-medium text-ink-2 hover:bg-surface-2">
                    {t('pl.gate.cancel')}
                  </button>
                  <button type="submit" disabled={createLead.isPending} className="h-8 rounded-lg bg-accent px-3 text-[13px] font-medium text-white hover:bg-accent-hover disabled:opacity-50">
                    {createLead.isPending ? '…' : t('pl.newLead.create')}
                  </button>
                </div>
              </form>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Toast */}
      <div aria-live="polite" className="pointer-events-none fixed bottom-6 left-1/2 z-[60] -translate-x-1/2">
        <AnimatePresence>
          {toast && (
            <motion.p
              initial={{ y: 16, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 16, opacity: 0 }}
              transition={{ duration: 0.22 }}
              className="rounded-lg border border-line bg-pine px-3.5 py-2 text-[13px] font-medium text-[#FAF8F4] shadow-lift"
            >
              {toast}
            </motion.p>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
