import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router';
import { AnimatePresence, motion } from 'framer-motion';
import {
  MessageSquare, Mail, Phone, Globe, ShieldAlert, Lock, UserCheck,
  Send, Sparkles, RefreshCw, Trash2, ChevronRight, Bot, Flag, X,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { trpc } from '@/providers/trpc';
import { useActionsT } from '@/lib/i18n/actions';
import type { ActionsKey } from '@/lib/i18n/actions';
import { EvidenceChip } from '@/components/evidence/EvidenceChip';
import type { EvidenceState } from '@/components/evidence/EvidenceChip';
import { AutonomyBadge } from '@/components/evidence/AutonomyBadge';
import { StatusPill } from '@/components/evidence/StatusPill';
import { Banner } from '@/components/evidence/Banner';
import { BlockedAction } from '@/components/evidence/BlockedAction';
import { CitationRef } from '@/components/evidence/CitationRef';
import { ConfidenceBar } from '@/components/evidence/ConfidenceBar';
import { EmptyState } from '@/components/evidence/EmptyState';

/* ── types & helpers ─────────────────────────────────────────────── */

const CHANNEL_ICON: Record<string, LucideIcon> = {
  sms: MessageSquare,
  email: Mail,
  dm: Globe,
  voice: Phone,
};

const CHANNEL_KEY: Record<string, ActionsKey> = {
  sms: 'cv.channel.sms',
  email: 'cv.channel.email',
  dm: 'cv.channel.dm',
  voice: 'cv.channel.voice',
};

type Tab = 'all' | 'needs_review' | 'escalated' | 'scheduled';

interface MessageRow {
  id: number;
  direction: 'inbound' | 'outbound';
  body: string;
  groundedEvidenceIds: unknown;
  aiDisclosed: boolean;
  isAiDraft: boolean;
  escalation: unknown;
  status: 'received' | 'draft' | 'sent' | 'blocked';
  createdAt: Date;
}

function msgTime(d: Date): string {
  return new Date(d).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

function initials(name: string): string {
  return name.split(' ').map((p) => p[0]).slice(0, 2).join('').toUpperCase();
}

/* ── page ────────────────────────────────────────────────────────── */

export default function Conversations() {
  const { t } = useActionsT();
  const listQ = trpc.conversations.list.useQuery();
  const [tab, setTab] = useState<Tab>('all');
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [transferred, setTransferred] = useState<Record<number, boolean>>({});

  const rows = useMemo(() => {
    const all = listQ.data ?? [];
    if (tab === 'all') return all;
    if (tab === 'scheduled') return [];
    return all.filter((r) => r.conversation.status === tab);
  }, [listQ.data, tab]);

  const counts = useMemo(() => {
    const all = listQ.data ?? [];
    return {
      needs_review: all.filter((r) => r.conversation.status === 'needs_review').length,
      escalated: all.filter((r) => r.conversation.status === 'escalated').length,
    };
  }, [listQ.data]);

  const selectedRow = rows.find((r) => r.conversation.id === selectedId) ?? rows[0] ?? null;

  const TABS: { id: Tab; key: ActionsKey; count?: number }[] = [
    { id: 'all', key: 'cv.tab.all' },
    { id: 'needs_review', key: 'cv.tab.needsReview', count: counts.needs_review },
    { id: 'escalated', key: 'cv.tab.escalated', count: counts.escalated },
    { id: 'scheduled', key: 'cv.tab.scheduled' },
  ];

  return (
    <div className="grid min-h-0 flex-1 grid-cols-1 gap-0 lg:grid-cols-[320px_minmax(0,1fr)] xl:grid-cols-[320px_minmax(0,1fr)_360px]">
      {/* ── inbox list ── */}
      <motion.aside
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.22 }}
        className="flex min-h-0 flex-col border-r border-line bg-surface"
      >
        <div className="flex shrink-0 flex-wrap gap-1 border-b border-line p-2">
          {TABS.map((tb) => (
            <button
              key={tb.id}
              type="button"
              onClick={() => setTab(tb.id)}
              aria-pressed={tab === tb.id}
              className={cn(
                'h-7 rounded-full px-2.5 text-[12px] font-medium transition-colors',
                tab === tb.id ? 'bg-accent-tint text-accent' : 'text-ink-2 hover:bg-surface-2',
              )}
            >
              {t(tb.key)}
              {typeof tb.count === 'number' && tb.count > 0 && (
                <span className="tnum ml-1 rounded-full bg-surface px-1 text-[10px]">{tb.count}</span>
              )}
            </button>
          ))}
        </div>

        {listQ.isLoading ? (
          <div className="space-y-2 p-3">
            {[0, 1, 2, 3].map((i) => <div key={i} className="h-[68px] animate-pulse rounded-xl bg-surface-2" />)}
          </div>
        ) : listQ.isError ? (
          <EmptyState title={t('cv.error.title')} description={t('cv.error.desc')} />
        ) : rows.length === 0 ? (
          <EmptyState title={t('cv.empty.title')} description={t('cv.empty.desc')} />
        ) : (
          <ul className="min-h-0 flex-1 space-y-1 overflow-y-auto p-2">
            {rows.map((row, i) => {
              const c = row.conversation;
              const isSel = selectedRow?.conversation.id === c.id;
              const isJonah = row.contactName.toLowerCase().includes('jonah');
              const highIntent = (row.leadScore ?? 0) >= 80;
              const ChannelIcon = CHANNEL_ICON[c.channel] ?? MessageSquare;
              return (
                <motion.li
                  key={c.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.2, delay: i * 0.035 }}
                >
                  <button
                    type="button"
                    onClick={() => setSelectedId(c.id)}
                    aria-current={isSel}
                    className={cn(
                      'flex w-full items-start gap-2.5 rounded-xl border p-2.5 text-left transition-colors',
                      isSel ? 'border-accent/40 bg-accent-tint' : 'border-transparent hover:bg-surface-2',
                    )}
                  >
                    {isJonah ? (
                      <img src="/avatar-jonah.png" alt="" className="h-9 w-9 shrink-0 rounded-full border border-line object-cover" />
                    ) : (
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-pine text-[11px] font-semibold text-[#FAF8F4]">
                        {initials(row.contactName)}
                      </span>
                    )}
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-1.5">
                        <span className="truncate text-[13px] font-semibold text-ink">{row.contactName}</span>
                        {c.status === 'escalated' && <Flag size={11} className="shrink-0 text-ev-conflict" aria-hidden />}
                      </span>
                      <span className="mt-0.5 block truncate text-[12px] text-ink-3">{row.lastMessage?.body ?? '—'}</span>
                      <span className="mt-1 flex flex-wrap items-center gap-1">
                        <span className="inline-flex items-center gap-1 rounded-md bg-surface-2 px-1.5 py-0.5 text-[10px] font-medium text-ink-2">
                          <ChannelIcon size={10} aria-hidden />
                          {t(CHANNEL_KEY[c.channel] ?? 'cv.channel.sms')}
                        </span>
                        {highIntent && (
                          <span className="tnum inline-flex items-center gap-1 rounded-md bg-[#9A6A1B]/10 px-1.5 py-0.5 text-[10px] font-medium text-ev-estimate">
                            <span className="h-1.5 w-1.5 rounded-full bg-ev-estimate" aria-hidden />
                            {t('cv.intent.high')} {row.leadScore}
                          </span>
                        )}
                        <span className="tnum text-[10px] text-ink-3">2 h</span>
                      </span>
                    </span>
                    {c.status === 'needs_review' && <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-accent" aria-label="unread" />}
                  </button>
                </motion.li>
              );
            })}
          </ul>
        )}
      </motion.aside>

      {/* ── thread ── */}
      {selectedRow ? (
        <ThreadPane
          key={selectedRow.conversation.id}
          conversationId={selectedRow.conversation.id}
          contactName={selectedRow.contactName}
          leadScore={selectedRow.leadScore}
          transferred={!!transferred[selectedRow.conversation.id]}
          onTransfer={() => setTransferred((prev) => ({ ...prev, [selectedRow.conversation.id]: true }))}
        />
      ) : (
        <div className="hidden items-center justify-center lg:flex">
          <EmptyState title={t('cv.empty.title')} description={t('cv.empty.desc')} />
        </div>
      )}
    </div>
  );
}

/* ── thread pane ─────────────────────────────────────────────────── */

function ThreadPane({
  conversationId,
  contactName,
  leadScore,
  transferred,
  onTransfer,
}: {
  conversationId: number;
  contactName: string;
  leadScore: number | null;
  transferred: boolean;
  onTransfer: () => void;
}) {
  const { t } = useActionsT();
  const utils = trpc.useUtils();
  const threadQ = trpc.conversations.thread.useQuery({ id: conversationId });
  const contactId = threadQ.data?.contact?.id ?? 0;
  const consentsQ = trpc.consents.byContact.useQuery({ contactId }, { enabled: contactId > 0 });

  const [composer, setComposer] = useState('');
  const [discardedDrafts, setDiscardedDrafts] = useState<number[]>([]);
  const [sendBlockedReasons, setSendBlockedReasons] = useState<string[] | null>(null);
  const [sentNotice, setSentNotice] = useState(false);
  const [whyOpen, setWhyOpen] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const conversation = threadQ.data?.conversation;
  const messages = (threadQ.data?.messages ?? []) as MessageRow[];
  const escalated = conversation?.status === 'escalated' && !transferred;

  const activeDraft = messages.find((m) => m.isAiDraft && m.status === 'draft' && !discardedDrafts.includes(m.id)) ?? null;
  const refusedDraft = messages.find((m) => m.isAiDraft && m.status === 'blocked' && !discardedDrafts.includes(m.id)) ?? null;

  const draftReply = trpc.conversations.draftReply.useMutation({
    onSuccess: async () => {
      await utils.conversations.thread.invalidate({ id: conversationId });
      await utils.conversations.list.invalidate();
    },
  });

  const sendMessage = trpc.conversations.sendMessage.useMutation({
    onSuccess: async (res) => {
      if (res.sent) {
        setComposer('');
        setSendBlockedReasons(null);
        setSentNotice(true);
        window.setTimeout(() => setSentNotice(false), 4000);
        await utils.conversations.thread.invalidate({ id: conversationId });
        await utils.conversations.list.invalidate();
      } else {
        setSendBlockedReasons((res.reasons ?? []).map((r) => `${r.check}: ${r.message}`));
      }
    },
    onError: (err) => setSendBlockedReasons([err.message]),
  });

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages.length, activeDraft?.id]);

  const doSend = (body: string) => {
    if (!body.trim()) return;
    sendMessage.mutate({ conversationId, body: body.trim(), idempotencyKey: `msg_${conversationId}_${crypto.randomUUID()}` });
  };

  const ChannelIcon = CHANNEL_ICON[conversation?.channel ?? 'sms'] ?? MessageSquare;

  return (
    <>
      <motion.section
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.22, delay: 0.06 }}
        className="flex min-h-0 flex-col bg-paper"
      >
        {/* thread header */}
        <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-line bg-surface px-4 py-2.5">
          <p className="text-[14px] font-semibold text-ink">{contactName}</p>
          <span className="inline-flex items-center gap-1 rounded-md bg-surface-2 px-1.5 py-0.5 text-[10.5px] font-medium text-ink-2">
            <ChannelIcon size={10} aria-hidden />
            {t(CHANNEL_KEY[conversation?.channel ?? 'sms'] ?? 'cv.channel.sms')}
          </span>
          {(consentsQ.data ?? []).slice(0, 3).map((c) => (
            <EvidenceChip
              key={c.id}
              state={c.status === 'active' ? 'verified' : c.status === 'expired' ? 'missing' : 'conflict'}
              label={`${c.channel} · ${c.basis === 'express' ? t('cv.consent.express') : t('cv.consent.implied')}${c.status !== 'active' ? ` (${t('cv.consent.expired')})` : ''}`}
              animate={false}
            />
          ))}
          {consentsQ.data?.length === 0 && <EvidenceChip state="assumption" label={`${conversation?.channel} · ${t('cv.consent.implied')}`} animate={false} />}
          <div className="ml-auto flex items-center gap-2">
            {transferred ? (
              <StatusPill label={t('cv.transferred')} tone="emerald" />
            ) : (
              <button
                type="button"
                onClick={onTransfer}
                className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-accent px-3 text-[12.5px] font-medium text-accent hover:bg-accent-tint"
              >
                <UserCheck size={13} aria-hidden />
                {t('cv.transfer')}
              </button>
            )}
          </div>
        </div>

        {/* escalation banner */}
        <AnimatePresence>
          {escalated && (
            <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.24 }} className="shrink-0 px-4 pt-3">
              <Banner
                variant="escalation"
                title={t('cv.escalation.title')}
                action={
                  <span className="relative">
                    <button type="button" onClick={() => setWhyOpen((v) => !v)} aria-expanded={whyOpen} className="text-[12px] font-medium text-ev-conflict underline">
                      {t('act.whyEscalated')}
                    </button>
                    {whyOpen && (
                      <span className="absolute right-0 top-full z-30 mt-1 block w-72 rounded-lg border border-line bg-surface p-2.5 font-mono text-[11px] leading-4 text-ink-2 shadow-lift">
                        {t('cv.escalation.rule')}
                      </span>
                    )}
                  </span>
                }
              >
                {t('cv.escalation.negotiation')}
              </Banner>
            </motion.div>
          )}
        </AnimatePresence>

        {/* messages */}
        <div ref={scrollRef} className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-4">
          {threadQ.isLoading ? (
            <div className="space-y-3">
              {[0, 1, 2].map((i) => <div key={i} className={cn('h-14 animate-pulse rounded-2xl bg-surface-2', i % 2 ? 'ml-auto w-2/3' : 'w-1/2')} />)}
            </div>
          ) : (
            <AnimatePresence initial={false}>
              {messages
                .filter((m) => !(m.isAiDraft && (m.status === 'draft' || (m.status === 'blocked' && m.body.startsWith('[DRAFT REFUSED]')))))
                .map((m) => {
                  const isEscalationNotice = m.status === 'blocked' && !!m.escalation;
                  if (isEscalationNotice) {
                    return (
                      <motion.div key={m.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }}>
                        <Banner variant="escalation" title={t('cv.msg.escalatedTag')}>
                          {m.body.replace('[ESCALATED] ', '')}
                        </Banner>
                      </motion.div>
                    );
                  }
                  const inbound = m.direction === 'inbound';
                  return (
                    <motion.div
                      key={m.id}
                      initial={{ opacity: 0, y: 8, scale: 0.98 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      transition={{ duration: 0.2 }}
                      className={cn('flex flex-col', inbound ? 'items-start' : 'items-end')}
                    >
                      <div
                        className={cn(
                          'max-w-[75%] rounded-2xl px-3.5 py-2.5 text-[13px] leading-[19px]',
                          inbound ? 'rounded-bl-md bg-surface-2 text-ink' : 'rounded-br-md bg-accent-tint text-ink',
                        )}
                      >
                        {m.body}
                        {Array.isArray(m.groundedEvidenceIds) && (m.groundedEvidenceIds as string[]).length > 0 && (
                          <span className="mt-1 block">
                            {(m.groundedEvidenceIds as string[]).map((ev) => (
                              <CitationRef key={ev} ref={ev} quote={`Grounded in dossier fact ${ev}`} documentName="Property dossier" documentHref="/properties/1" />
                            ))}
                          </span>
                        )}
                      </div>
                      <span className="mt-1 flex items-center gap-1.5 text-[10.5px] text-ink-3">
                        {msgTime(m.createdAt)}
                        {m.aiDisclosed && !inbound && (
                          <span className="inline-flex items-center gap-1 rounded-md bg-ev-generated/10 px-1.5 py-0.5 font-medium text-ev-generated">
                            <Bot size={10} aria-hidden />
                            {t('cv.aiTag')}
                          </span>
                        )}
                      </span>
                    </motion.div>
                  );
                })}
            </AnimatePresence>
          )}
        </div>

        {/* AI disclosure strip (persistent) */}
        <div className="shrink-0 border-t border-line bg-surface px-4 py-2">
          <p className="flex items-start gap-2 text-[11.5px] leading-4 text-ink-2">
            <Sparkles size={12} className="mt-0.5 shrink-0 text-ev-generated" aria-hidden />
            <span className="min-w-0 flex-1">{t('cv.disclosure')}</span>
            <EvidenceChip state="generated" animate={false} />
          </p>
        </div>

        {/* composer area */}
        <div className="shrink-0 border-t border-line bg-surface px-4 pb-4 pt-3">
          {sentNotice && (
            <p className="mb-2 flex items-center gap-1.5 text-[12px] font-medium text-ev-verified" role="status">
              <UserCheck size={13} aria-hidden />
              {t('cv.sent')}
            </p>
          )}

          {/* AI draft card */}
          <AnimatePresence>
            {activeDraft && !escalated && (
              <motion.div
                key={activeDraft.id}
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ type: 'spring', stiffness: 380, damping: 34 }}
                className="mb-3 overflow-hidden"
              >
                <div className="rounded-xl border border-ev-generated/50 bg-[#6E6A86]/5 p-3">
                  <div className="mb-1.5 flex items-center gap-2">
                    <EvidenceChip state="generated" label={t('cv.draft.title')} animate={false} />
                    <AutonomyBadge level="A1" showLabel={false} />
                  </div>
                  <p className="text-[13px] leading-[19px] text-ink">
                    {activeDraft.body}{' '}
                    {Array.isArray(activeDraft.groundedEvidenceIds) &&
                      (activeDraft.groundedEvidenceIds as string[]).map((ev, i) => (
                        <motion.span key={ev} initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: i * 0.02 }}>
                          <CitationRef ref={ev} quote={`Approved evidence ${ev} — property dossier, retrieved Jun 8`} documentName="Property dossier — DEMO-ON-PROPERTY-001" documentHref="/properties/1" />
                        </motion.span>
                      ))}
                  </p>
                  <p className="tnum mt-2 text-[11.5px] text-ink-3">
                    {t('cv.draft.grounded')} {(activeDraft.groundedEvidenceIds as string[] | null)?.length ?? 0} {t('cv.draft.sources')} · {t('cv.draft.confidence')} · {t('cv.draft.a1note')}
                  </p>
                  <div className="mt-2.5 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => doSend(activeDraft.body)}
                      disabled={sendMessage.isPending}
                      className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-accent px-3 text-[12.5px] font-medium text-white hover:bg-accent-hover disabled:opacity-50"
                    >
                      <Send size={12} aria-hidden />
                      {t('cv.draft.sendAsIs')}
                    </button>
                    <button
                      type="button"
                      onClick={() => setComposer(activeDraft.body)}
                      className="h-8 rounded-lg border border-line px-3 text-[12.5px] font-medium text-ink-2 hover:border-line-strong"
                    >
                      {t('act.edit')}
                    </button>
                    <button
                      type="button"
                      onClick={() => draftReply.mutate({ conversationId })}
                      disabled={draftReply.isPending}
                      className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-line px-3 text-[12.5px] font-medium text-ink-2 hover:border-line-strong disabled:opacity-50"
                    >
                      <RefreshCw size={12} aria-hidden />
                      {t('cv.draft.regenerate')}
                    </button>
                    <button
                      type="button"
                      onClick={() => setDiscardedDrafts((prev) => [...prev, activeDraft.id])}
                      className="inline-flex h-8 items-center gap-1.5 rounded-lg px-3 text-[12.5px] font-medium text-ink-3 hover:bg-surface-2"
                    >
                      <Trash2 size={12} aria-hidden />
                      {t('cv.draft.discard')}
                    </button>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* refused draft (grounded-or-refused guardrail) */}
          {refusedDraft && !escalated && (
            <div className="mb-3 rounded-xl border border-line-strong bg-surface-2 p-3">
              <div className="mb-1 flex items-center gap-2">
                <EvidenceChip state="blocked" label={t('cv.draft.refused')} animate={false} />
                <Lock size={12} className="text-ink-3" aria-hidden />
              </div>
              <p className="text-[12.5px] leading-[18px] text-ink-2">{refusedDraft.body.replace('[DRAFT REFUSED] ', '')}</p>
              <p className="mt-1 text-[11.5px] text-ink-3">{t('cv.draft.refusedBody')}</p>
              <button
                type="button"
                onClick={() => setDiscardedDrafts((prev) => [...prev, refusedDraft.id])}
                className="mt-2 text-[12px] font-medium text-ink-3 hover:text-ink"
              >
                {t('cv.draft.discard')}
              </button>
            </div>
          )}

          {sendBlockedReasons && (
            <Banner variant="warning" title={t('cv.blocked.policy')} className="mb-2" action={
              <button type="button" onClick={() => setSendBlockedReasons(null)} aria-label="dismiss" className="rounded-md p-0.5 text-ink-3 hover:bg-surface-2 hover:text-ink">
                <X size={13} aria-hidden />
              </button>
            }>
              <ul className="list-disc pl-4 font-mono text-[11px]">
                {sendBlockedReasons.map((r, i) => <li key={i}>{r}</li>)}
              </ul>
            </Banner>
          )}

          {escalated ? (
            <div className="flex items-center gap-3 rounded-xl border border-line bg-surface-2 px-4 py-3">
              <Lock size={15} className="shrink-0 text-ink-3" aria-hidden />
              <div className="min-w-0 flex-1">
                <p className="text-[13px] font-medium text-ink-2">{t('cv.composer.locked')}</p>
                <p className="text-[11.5px] text-ink-3">{t('cv.escalation.negotiation')}</p>
              </div>
              <AutonomyBadge level="A4" showLabel={false} />
            </div>
          ) : (
            <div className="rounded-xl border border-line bg-surface focus-within:ring-2 focus-within:ring-accent">
              <textarea
                value={composer}
                onChange={(e) => setComposer(e.target.value)}
                placeholder={t('cv.composer.placeholder')}
                rows={3}
                className="w-full resize-none rounded-t-xl bg-transparent px-3.5 py-2.5 text-[13px] text-ink placeholder:text-ink-3 focus:outline-none"
              />
              <div className="flex flex-wrap items-center gap-2 border-t border-line px-3 py-2">
                <select
                  aria-label={t('cv.composer.templates')}
                  className="h-7 rounded-md border border-line bg-surface px-1.5 font-mono text-[11px] text-ink-2"
                  onChange={(e) => {
                    if (e.target.value) setComposer(e.target.value);
                    e.target.selectedIndex = 0;
                  }}
                >
                  <option value="">{t('cv.composer.templates')}</option>
                  <option value="Thanks for your question — I'll confirm the details and follow up shortly. (tpl_followup@1.2)">tpl_followup@1.2</option>
                  <option value="The 2024 property taxes for DEMO-ON-PROPERTY-001 are approximately $8,940 (MPAC record). Happy to walk through the carrying costs. (tpl_taxes@2.0)">tpl_taxes@2.0</option>
                  <option value="Saturday showings run 10 am–4 pm. Shall I book you a slot? (tpl_showing@1.0)">tpl_showing@1.0</option>
                </select>
                <span className="inline-flex items-center gap-1 text-[11px] text-ink-3">
                  <ChannelIcon size={11} aria-hidden />
                  {t('cv.composer.channel')}: {t(CHANNEL_KEY[conversation?.channel ?? 'sms'] ?? 'cv.channel.sms')}
                </span>
                {!activeDraft && (
                  <button
                    type="button"
                    onClick={() => draftReply.mutate({ conversationId })}
                    disabled={draftReply.isPending}
                    className="inline-flex h-7 items-center gap-1 rounded-md border border-ev-generated/40 px-2 text-[11px] font-medium text-ev-generated hover:bg-ev-generated/10 disabled:opacity-50"
                  >
                    <Sparkles size={11} aria-hidden />
                    {draftReply.isPending ? t('act.loading') : t('cv.draft.title')}
                  </button>
                )}
                <div className="ml-auto">
                  {conversation?.channel === 'sms' && consentsQ.data?.every((c) => c.status !== 'active') && consentsQ.data.length > 0 ? (
                    <BlockedAction label={t('act.send')} reason={t('cv.blocked.consent')} />
                  ) : (
                    <button
                      type="button"
                      onClick={() => doSend(composer)}
                      disabled={!composer.trim() || sendMessage.isPending}
                      className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-accent px-4 text-[12.5px] font-medium text-white hover:bg-accent-hover active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <Send size={12} aria-hidden />
                      {t('act.send')}
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </motion.section>

      {/* ── context rail ── */}
      <ContextRail
        contactName={contactName}
        leadScore={leadScore}
        consents={consentsQ.data ?? []}
        messages={messages}
        draftEvidenceIds={Array.isArray(activeDraft?.groundedEvidenceIds) ? (activeDraft.groundedEvidenceIds as string[]) : []}
      />
    </>
  );
}

/* ── context rail ────────────────────────────────────────────────── */

interface ConsentRow {
  id: number;
  channel: 'email' | 'sms' | 'voice' | 'dm';
  basis: 'express' | 'implied' | 'none';
  status: 'active' | 'expired' | 'withdrawn';
  expiresAt: Date | null;
}

const GROUNDING_SOURCES: { id: string; label: string }[] = [
  { id: 'HLD-2041', label: 'Listing record HLD-2041 (mock board feed)' },
  { id: 'dossier-profile', label: 'Dossier §profile — beds/baths/sqft' },
  { id: 'mpac-tax-2024', label: 'MPAC-mock — 2024 taxes $8,940' },
  { id: 'mpac-lot', label: 'MPAC-mock — lot 33 × 122 ft' },
];

function ContextRail({
  contactName,
  leadScore,
  consents,
  messages,
  draftEvidenceIds,
}: {
  contactName: string;
  leadScore: number | null;
  consents: ConsentRow[];
  messages: MessageRow[];
  draftEvidenceIds: string[];
}) {
  const { t } = useActionsT();
  const isJonah = contactName.toLowerCase().includes('jonah');
  const timeline = messages.slice(-5).reverse();

  return (
    <motion.aside
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22, delay: 0.12 }}
      className="hidden min-h-0 space-y-3 overflow-y-auto border-l border-line bg-surface p-4 xl:block"
    >
      {/* contact card */}
      <section className="ns-card p-4">
        <p className="ns-meta mb-2">{t('cv.rail.contact')}</p>
        <div className="flex items-center gap-3">
          {isJonah ? (
            <img src="/avatar-jonah.png" alt="" className="h-11 w-11 rounded-full border border-line object-cover" />
          ) : (
            <span className="flex h-11 w-11 items-center justify-center rounded-full bg-pine text-[13px] font-semibold text-[#FAF8F4]">
              {initials(contactName)}
            </span>
          )}
          <div className="min-w-0">
            <p className="truncate text-[13.5px] font-semibold text-ink">{contactName}</p>
            <Link to="/sellers" className="inline-flex items-center gap-1 text-[11.5px] font-medium text-accent hover:underline">
              {t('cv.rail.viewRecord')}
              <ChevronRight size={11} aria-hidden />
            </Link>
          </div>
        </div>
        {typeof leadScore === 'number' && (
          <div className="mt-3">
            <p className="ns-meta mb-1">{t('cv.rail.intentScore')}</p>
            <ConfidenceBar value={leadScore} basis="Engagement recency, repeat views, pre-approval on file" />
          </div>
        )}
      </section>

      {/* consent card */}
      <section className="ns-card p-4">
        <p className="ns-meta mb-2">{t('cv.rail.consent')}</p>
        {consents.length === 0 ? (
          <p className="text-[12px] text-ink-3">—</p>
        ) : (
          <ul className="space-y-1.5">
            {consents.map((c) => {
              const state: EvidenceState = c.status === 'active' ? 'verified' : c.status === 'expired' ? 'missing' : 'conflict';
              return (
                <li key={c.id} className="flex items-center justify-between gap-2">
                  <EvidenceChip
                    state={state}
                    label={`${c.channel} · ${c.basis === 'express' ? t('cv.consent.express') : t('cv.consent.implied')}`}
                    animate={false}
                  />
                  {c.expiresAt && (
                    <span className="tnum shrink-0 text-[10.5px] text-ink-3">
                      {new Date(c.expiresAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* property context */}
      <section className="ns-card p-4">
        <p className="ns-meta mb-2">{t('cv.rail.property')}</p>
        <Link to="/properties/1" className="block overflow-hidden rounded-lg border border-line transition-colors hover:border-line-strong">
          <img src="/property-demo-001-exterior.jpg" alt="DEMO-ON-PROPERTY-001" className="aspect-[16/7] w-full object-cover" loading="lazy" />
          <div className="p-2.5">
            <p className="text-[12.5px] font-semibold text-ink">DEMO-ON-PROPERTY-001</p>
            <p className="tnum text-[11.5px] text-ink-3">$1,245,000 · Toronto</p>
          </div>
        </Link>
      </section>

      {/* grounding panel */}
      <section className="ns-card p-4">
        <p className="ns-meta mb-2">{t('cv.rail.grounding')}</p>
        <ul className="space-y-1.5">
          {GROUNDING_SOURCES.map((src) => {
            const used = draftEvidenceIds.some((id) => src.id.includes(id) || id.includes(src.id));
            return (
              <li
                key={src.id}
                className={cn(
                  'rounded-lg border px-2.5 py-1.5 text-[11.5px] leading-4',
                  used ? 'border-accent/40 bg-accent-tint text-ink' : 'border-line bg-surface-2 text-ink-2',
                )}
              >
                <code className="font-mono">{src.id}</code>
                <span className="block text-ink-3">{src.label}</span>
                {used && <span className="mt-0.5 inline-block text-[10px] font-medium text-accent">{t('cv.rail.groundingUsed')}</span>}
              </li>
            );
          })}
        </ul>
      </section>

      {/* timeline mini */}
      <section className="ns-card p-4">
        <p className="ns-meta mb-2">{t('cv.rail.timeline')}</p>
        {timeline.length === 0 ? (
          <p className="text-[12px] text-ink-3">—</p>
        ) : (
          <ul className="space-y-2">
            {timeline.map((m) => (
              <li key={m.id} className="flex items-start gap-2 text-[11.5px]">
                <span className={cn('mt-1 h-1.5 w-1.5 shrink-0 rounded-full', m.direction === 'inbound' ? 'bg-ev-external' : 'bg-accent')} aria-hidden />
                <div className="min-w-0">
                  <p className="truncate text-ink-2">{m.body}</p>
                  <p className="tnum text-[10px] text-ink-3">{msgTime(m.createdAt)}</p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <p className="flex items-start gap-1.5 px-1 text-[11px] leading-4 text-ink-3">
        <ShieldAlert size={11} className="mt-0.5 shrink-0" aria-hidden />
        {t('cv.afterHours')}
      </p>
    </motion.aside>
  );
}
