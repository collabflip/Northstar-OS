import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { AnimatePresence, motion } from 'framer-motion';
import {
  addDays, addMonths, endOfMonth, endOfWeek, format, isSameDay, isSameMonth,
  isToday, startOfMonth, startOfWeek,
} from 'date-fns';
import {
  CalendarClock, ChevronLeft, ChevronRight, Clock, FileWarning, Globe, Home,
  Lock, MessageSquare, Phone, Scale, Upload, Users, X,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useNow } from '@/lib/useNow';
import { useT } from '@/lib/i18n';
import { useOps } from '@/lib/i18n/ops';
import { trpc } from '@/providers/trpc';
import { Banner } from '@/components/evidence/Banner';
import { BlockedAction } from '@/components/evidence/BlockedAction';
import { StatusPill } from '@/components/evidence/StatusPill';
import { EvidenceChip } from '@/components/evidence/EvidenceChip';
import { EmptyState } from '@/components/evidence/EmptyState';

/* ── Types & mock provider ─────────────────────────────────────────── */

type EventType = 'showing' | 'consultation' | 'openHouse' | 'lawyerCall' | 'deadline';
type EventStatus = 'confirmed' | 'tentative' | 'needsConfirmation';

interface CalEvent {
  id: string;
  type: EventType;
  title: string;
  address?: string;
  start: Date;
  end: Date;
  status: EventStatus;
  attendee?: { name: string; avatar?: string };
  chips?: string[];
  source: 'mock' | 'trpc';
  highIntent?: boolean;
  linkedException?: boolean;
}

/** Truthful label: seeded showings come from the MockCalendarProvider (local only). */
const MOCK_PROVIDER = 'MockCalendarProvider';

const TYPE_ICON: Record<EventType, typeof Home> = {
  showing: Users,
  consultation: MessageSquare,
  openHouse: Home,
  lawyerCall: Scale,
  deadline: FileWarning,
};

const TYPE_CLS: Record<EventType, string> = {
  showing: 'border-accent/40 bg-accent-tint text-pine',
  consultation: 'border-ev-external/30 bg-[#54677A]/10 text-ink',
  openHouse: 'border-accent/40 bg-accent-tint text-pine',
  lawyerCall: 'border-ev-conflict/40 bg-[#C2492B]/5 text-ink border-l-2 border-l-ev-conflict',
  deadline: 'border-ev-estimate/40 bg-[#9A6A1B]/10 text-ink',
};

function at(day: Date, h: number, m = 0): Date {
  const d = new Date(day);
  d.setHours(h, m, 0, 0);
  return d;
}

/** Seeded mock events for the current week (Mon–Sun), labeled MockCalendarProvider. */
function seedMockEvents(anchor: Date): CalEvent[] {
  const mon = startOfWeek(anchor, { weekStartsOn: 1 });
  const tue = addDays(mon, 1);
  const wed = addDays(mon, 2);
  const thu = addDays(mon, 3);
  const sat = addDays(mon, 5);
  return [
    {
      id: 'mcal_showing_whitfield', type: 'showing', title: 'Showing — Jonah Whitfield',
      address: 'DEMO-ON-PROPERTY-001, Toronto', start: at(tue, 13, 30), end: at(tue, 14, 0),
      status: 'confirmed', attendee: { name: 'Jonah Whitfield', avatar: '/avatar-jonah.png' },
      highIntent: true, source: 'mock',
    },
    {
      id: 'mcal_consult_vance', type: 'consultation', title: 'Consultation — Eleanor Vance estate',
      address: 'DEMO-ON-PROPERTY-003, Ottawa', start: at(wed, 10, 0), end: at(wed, 10, 45),
      status: 'confirmed', attendee: { name: 'Eleanor Vance' }, chips: ['probate'], source: 'mock',
    },
    {
      id: 'mcal_lawyer_vance', type: 'lawyerCall', title: 'Lawyer call — Vance file exception review',
      start: at(thu, 15, 0), end: at(thu, 15, 30), status: 'confirmed', linkedException: true, source: 'mock',
    },
    {
      id: 'mcal_open_demo001', type: 'openHouse', title: 'Open house — DEMO-ON-PROPERTY-001',
      address: 'DEMO-ON-PROPERTY-001, Toronto', start: at(sat, 14, 0), end: at(sat, 16, 0),
      status: 'needsConfirmation', chips: ['signInReady'], source: 'mock',
    },
  ];
}

/* ── Small shared bits ─────────────────────────────────────────────── */

function CountdownHairline({ day }: { day: Date }) {
  const now = new Date();
  if (!isSameDay(now, day)) return null;
  const top = ((now.getHours() - 8) * 60 + now.getMinutes()) * (720 / 720);
  if (now.getHours() < 8 || now.getHours() >= 20) return null;
  return (
    <motion.div
      className="pointer-events-none absolute left-0 right-0 z-10 flex items-center"
      style={{ top }}
      initial={{ scaleY: 0 }}
      animate={{ scaleY: 1 }}
      transition={{ duration: 0.4 }}
      aria-hidden
    >
      <span className="h-px w-full bg-ev-conflict" />
      <span className="tnum absolute -top-2 right-1 rounded bg-ev-conflict px-1 text-[9px] font-semibold text-white">
        {format(now, 'HH:mm')}
      </span>
    </motion.div>
  );
}

function EventBlock({ ev, onOpen, dim }: { ev: CalEvent; onOpen: (e: CalEvent) => void; dim?: boolean }) {
  const { t } = useOps();
  const now = useNow();
  const Icon = TYPE_ICON[ev.type];
  const startMin = (ev.start.getHours() - 8) * 60 + ev.start.getMinutes();
  const durMin = Math.max(30, (ev.end.getTime() - ev.start.getTime()) / 60000);
  const past = ev.end.getTime() < now;
  return (
    <motion.button
      type="button"
      layoutId={ev.id}
      onClick={() => onOpen(ev)}
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: past ? 0.6 : 1, scale: 1 }}
      transition={{ duration: 0.18 }}
      className={cn(
        'absolute inset-x-0.5 z-[5] overflow-hidden rounded-md border px-1.5 py-1 text-left hover:brightness-[1.03] hover:shadow-card',
        TYPE_CLS[ev.type],
        ev.status === 'tentative' && 'border-dashed',
        dim && 'opacity-30',
      )}
      style={{ top: startMin, height: Math.min(durMin, 720 - startMin) }}
    >
      <p className="flex items-center gap-1 text-[11px] font-semibold leading-3.5">
        <Icon size={11} className="shrink-0" aria-hidden />
        <span className="truncate">{ev.title}</span>
      </p>
      {ev.address && durMin >= 45 && <p className="mt-0.5 truncate text-[10px] text-ink-3">{ev.address}</p>}
      <p className="tnum mt-0.5 text-[10px] text-ink-3">
        {format(ev.start, 'HH:mm')}–{format(ev.end, 'HH:mm')}
      </p>
      {ev.type === 'deadline' && (
        <span className="absolute right-1 top-1 h-2 w-2 rotate-45 bg-ev-estimate motion-safe:animate-pulse" aria-label={t('cal.type.deadline')} />
      )}
    </motion.button>
  );
}

/* ── Page ──────────────────────────────────────────────────────────── */

type View = 'week' | 'month' | 'agenda';

export default function CalendarPage() {
  const { t: gt } = useT();
  const { t, dfLocale } = useOps();
  const [view, setView] = useState<View>('week');
  const [anchor, setAnchor] = useState(() => new Date());
  const now = useNow();
  const [filters, setFilters] = useState<Set<EventType>>(new Set(['showing', 'consultation', 'openHouse', 'deadline']));
  const [selected, setSelected] = useState<CalEvent | null>(null);
  const [bookingOpen, setBookingOpen] = useState(false);
  const [extraEvents, setExtraEvents] = useState<CalEvent[]>([]);

  // Real data: condition/closing deadlines from transactions via tRPC.
  const txns = trpc.transactions.list.useQuery(undefined, { retry: 1 });

  const weekStart = startOfWeek(anchor, { weekStartsOn: 1 });
  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)), [weekStart]);

  const events = useMemo<CalEvent[]>(() => {
    const mock = [...seedMockEvents(anchor), ...extraEvents];
    const real: CalEvent[] = (txns.data ?? [])
      .filter((x) => x.status === 'conditional' && x.closingAt)
      .map((x) => ({
        id: `txn_${x.id}_closing`, type: 'deadline' as const,
        title: `Condition period — txn #${x.id}`,
        address: x.sellerName ? `${x.sellerName} → ${x.buyerName}` : undefined,
        start: new Date(x.closingAt!), end: addDays(new Date(x.closingAt!), 0),
        status: 'confirmed' as const, source: 'trpc' as const,
      }));
    return [...mock, ...real].filter((e) => filters.has(e.type) || (e.type === 'lawyerCall' && filters.has('consultation')));
  }, [anchor, extraEvents, txns.data, filters]);

  const upcoming48 = events
    .filter((e) => e.start.getTime() > now && e.start.getTime() < now + 48 * 3600_000)
    .sort((a, b) => a.start.getTime() - b.start.getTime());
  const pendingConf = events.filter((e) => e.status === 'needsConfirmation' && e.end.getTime() > now);
  const weekHasEvents = events.some((e) => e.start >= weekStart && e.start <= endOfWeek(anchor, { weekStartsOn: 1 }));

  const toggleFilter = (f: EventType) =>
    setFilters((prev) => {
      const next = new Set(prev);
      if (next.has(f)) next.delete(f); else next.add(f);
      return next;
    });

  return (
    <div className="p-6">
      {/* Header */}
      <header className="mb-4 flex flex-wrap items-center gap-3">
        <h1 className="text-[22px] font-semibold leading-7 tracking-[-0.01em] text-ink">{gt('nav.calendar')}</h1>
        <span
          className="inline-flex items-center gap-1 rounded-full border border-line bg-surface px-2 py-0.5 text-[11px] font-medium text-ink-2"
          title={t('cal.tzNote')}
        >
          <Globe size={11} aria-hidden /> {t('cal.timezone')}
        </span>

        {/* View toggle */}
        <div role="group" aria-label="View" className="flex h-7 items-center rounded-lg border border-line bg-surface-2 p-0.5">
          {(['week', 'month', 'agenda'] as const).map((v) => (
            <button
              key={v} type="button" onClick={() => setView(v)} aria-pressed={view === v}
              className={cn('h-6 rounded-md px-2.5 text-[11px] font-semibold capitalize transition-colors',
                view === v ? 'bg-surface text-ink shadow-card' : 'text-ink-3 hover:text-ink-2')}
            >
              {t(`cal.view.${v}` as const)}
            </button>
          ))}
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-1.5">
          {([
            ['showing', 'cal.filter.showings'],
            ['openHouse', 'cal.filter.openHouses'],
            ['consultation', 'cal.filter.consultations'],
            ['deadline', 'cal.filter.deadlines'],
          ] as [EventType, Parameters<typeof t>[0]][]).map(([f, key]) => (
            <button
              key={f} type="button" onClick={() => toggleFilter(f)} aria-pressed={filters.has(f)}
              className={cn('rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors',
                filters.has(f) ? 'border-accent/40 bg-accent-tint text-accent' : 'border-line bg-surface text-ink-3 hover:text-ink-2')}
            >
              {t(key)}
            </button>
          ))}
        </div>

        <div className="flex-1" />
        <button
          type="button" onClick={() => setBookingOpen(true)}
          className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-accent px-3 text-[13px] font-medium text-white hover:bg-accent-hover"
        >
          <CalendarClock size={14} aria-hidden /> {t('cal.book')}
        </button>
      </header>

      {/* Restricted-access notice — persistent, designed absence */}
      <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }}>
        <Banner variant="info" title={t('cal.restricted.title')} className="mb-3">
          {t('cal.restricted.body')}
        </Banner>
      </motion.div>

      {/* Booking source truthfulness */}
      <p className="mb-4 flex items-center gap-1.5 text-[12px] text-ink-3">
        <EvidenceChip state="external" label={MOCK_PROVIDER} animate={false} />
        {t('cal.mockProvider')}
      </p>

      <div className="flex gap-4">
        {/* Main calendar surface */}
        <div className="min-w-0 flex-1 rounded-xl border border-line bg-surface shadow-card">
          {/* Nav strip */}
          <div className="flex items-center gap-2 border-b border-line px-3 py-2">
            <button type="button" aria-label="Previous" onClick={() => setAnchor((d) => view === 'month' ? addMonths(d, -1) : addDays(d, -7))}
              className="rounded-md p-1 text-ink-2 hover:bg-surface-2"><ChevronLeft size={15} /></button>
            <p className="min-w-40 text-[13px] font-semibold text-ink">
              {view === 'month'
                ? format(anchor, 'LLLL yyyy', { locale: dfLocale })
                : `${format(days[0], 'd MMM', { locale: dfLocale })} – ${format(days[6], 'd MMM yyyy', { locale: dfLocale })}`}
            </p>
            <button type="button" aria-label="Next" onClick={() => setAnchor((d) => view === 'month' ? addMonths(d, 1) : addDays(d, 7))}
              className="rounded-md p-1 text-ink-2 hover:bg-surface-2"><ChevronRight size={15} /></button>
            <button type="button" onClick={() => setAnchor(new Date())}
              className="ml-1 rounded-md border border-line px-2 py-0.5 text-[11px] font-medium text-ink-2 hover:bg-surface-2">
              {t('cal.today')}
            </button>
          </div>

          <AnimatePresence mode="wait">
            <motion.div key={view} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }}>
              {view === 'week' && (
                weekHasEvents ? (
                  <div className="grid grid-cols-[44px_repeat(7,1fr)]">
                    {/* Hour gutter */}
                    <div className="relative border-r border-line">
                      {Array.from({ length: 13 }, (_, i) => (
                        <div key={i} className="tnum relative h-[60px] pr-1 text-right text-[10px] text-ink-3">
                          <span className="absolute -top-1.5 right-1">{i === 0 ? '' : `${String(8 + i).padStart(2, '0')}:00`}</span>
                        </div>
                      ))}
                    </div>
                    {days.map((day) => (
                      <div key={day.toISOString()} className={cn('relative border-r border-line last:border-r-0', isToday(day) && 'bg-accent-tint/30')}>
                        <div className={cn('border-b border-line px-1.5 py-1 text-center', isToday(day) && 'bg-accent-tint/60')}>
                          <p className="text-[10px] font-medium uppercase tracking-[0.04em] text-ink-3">{format(day, 'EEE', { locale: dfLocale })}</p>
                          <p className={cn('tnum text-[14px] font-semibold', isToday(day) ? 'text-accent' : 'text-ink')}>{format(day, 'd')}</p>
                        </div>
                        <div className="relative h-[720px]">
                          {Array.from({ length: 12 }, (_, i) => (
                            <div key={i} className="h-[60px] border-b border-line/60" aria-hidden />
                          ))}
                          <CountdownHairline day={day} />
                          {events.filter((e) => isSameDay(e.start, day)).map((ev) => (
                            <EventBlock key={ev.id} ev={ev} onOpen={setSelected} />
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <EmptyState
                    title={t('cal.emptyWeek')} description={t('cal.emptyWeekBody')}
                    action={
                      <button type="button" onClick={() => setBookingOpen(true)}
                        className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-accent px-3 text-[13px] font-medium text-white hover:bg-accent-hover">
                        <CalendarClock size={14} aria-hidden /> {t('cal.book')}
                      </button>
                    }
                  />
                )
              )}

              {view === 'month' && <MonthView anchor={anchor} events={events} onOpen={setSelected} />}
              {view === 'agenda' && <AgendaView anchor={anchor} events={events} onOpen={setSelected} />}
            </motion.div>
          </AnimatePresence>
        </div>

        {/* Right mini-panel */}
        <aside className="hidden w-[300px] shrink-0 space-y-3 xl:block">
          <div className="rounded-xl border border-line bg-surface p-3 shadow-card">
            <h3 className="mb-2 flex items-center gap-1.5 text-[13px] font-semibold text-ink">
              <Clock size={13} className="text-accent" aria-hidden /> {t('cal.upcoming48')}
            </h3>
            {upcoming48.length === 0 && <p className="text-[12px] text-ink-3">{t('ops.empty')}</p>}
            <ul className="space-y-1.5">
              {upcoming48.slice(0, 4).map((ev) => {
                const Icon = TYPE_ICON[ev.type];
                return (
                  <li key={ev.id}>
                    <button type="button" onClick={() => setSelected(ev)} className="flex w-full items-start gap-2 rounded-lg border border-line px-2 py-1.5 text-left hover:bg-surface-2">
                      <Icon size={13} className="mt-0.5 shrink-0 text-accent" aria-hidden />
                      <span className="min-w-0">
                        <span className="block truncate text-[12px] font-medium text-ink">{ev.title}</span>
                        <span className="tnum block text-[11px] text-ink-3">{format(ev.start, 'EEE d MMM · HH:mm', { locale: dfLocale })}</span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>

          <div className="rounded-xl border border-line bg-surface p-3 shadow-card">
            <h3 className="mb-2 text-[13px] font-semibold text-ink">{t('cal.pendingConf')}</h3>
            {pendingConf.length === 0 && <p className="text-[12px] text-ink-3">{gt('misc.empty.caughtUp')}</p>}
            <ul className="space-y-2">
              {pendingConf.map((ev) => (
                <li key={ev.id} className="rounded-lg border border-ev-estimate/30 bg-[#9A6A1B]/5 p-2">
                  <p className="truncate text-[12px] font-medium text-ink">{ev.title}</p>
                  <p className="tnum text-[11px] text-ink-3">{format(ev.start, 'EEE d MMM · HH:mm', { locale: dfLocale })}</p>
                  <div className="mt-1.5 flex gap-1.5">
                    <button type="button" className="rounded-md border border-accent/40 bg-accent-tint px-2 py-0.5 text-[11px] font-medium text-accent hover:bg-accent-tint/70" title="A2 — reversible">
                      {t('cal.confirm')}
                    </button>
                    <button type="button" className="rounded-md border border-line bg-surface px-2 py-0.5 text-[11px] font-medium text-ink-2 hover:bg-surface-2" title="A2 — reversible">
                      {t('cal.reschedule')}
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </div>

          <MiniMonth anchor={anchor} onPick={(d) => { setAnchor(d); setView('week'); }} />
        </aside>
      </div>

      {/* Event detail popover (modal-style anchored card) */}
      <AnimatePresence>
        {selected && (
          <EventDetail ev={selected} onClose={() => setSelected(null)} />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {bookingOpen && (
          <BookingDialog
            onClose={() => setBookingOpen(false)}
            onBooked={(ev) => { setExtraEvents((p) => [...p, ev]); setBookingOpen(false); }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

/* ── Month view ────────────────────────────────────────────────────── */

function MonthView({ anchor, events, onOpen }: { anchor: Date; events: CalEvent[]; onOpen: (e: CalEvent) => void }) {
  const { dfLocale } = useOps();
  const start = startOfWeek(startOfMonth(anchor), { weekStartsOn: 1 });
  const end = endOfWeek(endOfMonth(anchor), { weekStartsOn: 1 });
  const cells: Date[] = [];
  for (let d = start; d <= end; d = addDays(d, 1)) cells.push(d);
  return (
    <div className="grid grid-cols-7">
      {cells.map((d, i) => {
        const dayEvents = events.filter((e) => isSameDay(e.start, d));
        return (
          <div
            key={d.toISOString()}
            className={cn(
              'min-h-[96px] border-b border-r border-line/70 p-1.5 [&:nth-child(7n)]:border-r-0',
              !isSameMonth(d, anchor) && 'bg-surface-2/50 text-ink-3',
              isToday(d) && 'bg-accent-tint/30',
            )}
          >
            <p className={cn('tnum text-[11px] font-semibold', isToday(d) ? 'text-accent' : 'text-ink-2')}>
              {i < 7 ? format(d, 'EEE d', { locale: dfLocale }) : format(d, 'd')}
            </p>
            <div className="mt-1 space-y-1">
              {dayEvents.slice(0, 3).map((ev) => (
                <button
                  key={ev.id} type="button" onClick={() => onOpen(ev)}
                  className={cn('block w-full truncate rounded border px-1 py-0.5 text-left text-[10px] font-medium', TYPE_CLS[ev.type])}
                >
                  {format(ev.start, 'HH:mm')} {ev.title}
                </button>
              ))}
              {dayEvents.length > 3 && <p className="text-[10px] text-ink-3">+{dayEvents.length - 3}</p>}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ── Agenda view ───────────────────────────────────────────────────── */

function AgendaView({ anchor, events, onOpen }: { anchor: Date; events: CalEvent[]; onOpen: (e: CalEvent) => void }) {
  const { t, dfLocale } = useOps();
  const weekStart = startOfWeek(anchor, { weekStartsOn: 1 });
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  return (
    <ul className="divide-y divide-line">
      {days.map((d) => {
        const dayEvents = events.filter((e) => isSameDay(e.start, d)).sort((a, b) => a.start.getTime() - b.start.getTime());
        return (
          <li key={d.toISOString()} className={cn('flex gap-4 px-4 py-3', isToday(d) && 'bg-accent-tint/20')}>
            <div className="w-24 shrink-0">
              <p className="text-[11px] font-medium uppercase tracking-[0.04em] text-ink-3">{format(d, 'EEE', { locale: dfLocale })}</p>
              <p className={cn('tnum text-[16px] font-semibold', isToday(d) ? 'text-accent' : 'text-ink')}>{format(d, 'd MMM', { locale: dfLocale })}</p>
            </div>
            <div className="min-w-0 flex-1 space-y-1.5">
              {dayEvents.length === 0 && <p className="py-1 text-[12px] text-ink-3">—</p>}
              {dayEvents.map((ev) => {
                const Icon = TYPE_ICON[ev.type];
                return (
                  <button key={ev.id} type="button" onClick={() => onOpen(ev)}
                    className="flex w-full items-center gap-2.5 rounded-lg border border-line px-2.5 py-1.5 text-left hover:bg-surface-2">
                    <Icon size={14} className="shrink-0 text-accent" aria-hidden />
                    <span className="tnum w-24 shrink-0 text-[12px] text-ink-2">{format(ev.start, 'HH:mm')}–{format(ev.end, 'HH:mm')}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px] font-medium text-ink">{ev.title}</span>
                      {ev.address && <span className="block truncate text-[11px] text-ink-3">{ev.address}</span>}
                    </span>
                    <StatusPill label={t(`cal.status.${ev.status}`)} tone={ev.status === 'confirmed' ? 'emerald' : 'amber'} />
                  </button>
                );
              })}
            </div>
          </li>
        );
      })}
    </ul>
  );
}

/* ── Mini month picker ─────────────────────────────────────────────── */

function MiniMonth({ anchor, onPick }: { anchor: Date; onPick: (d: Date) => void }) {
  const { t, dfLocale } = useOps();
  const [month, setMonth] = useState(anchor);
  const start = startOfWeek(startOfMonth(month), { weekStartsOn: 1 });
  const end = endOfWeek(endOfMonth(month), { weekStartsOn: 1 });
  const cells: Date[] = [];
  for (let d = start; d <= end; d = addDays(d, 1)) cells.push(d);
  return (
    <div className="rounded-xl border border-line bg-surface p-3 shadow-card">
      <div className="mb-1.5 flex items-center justify-between">
        <h3 className="text-[13px] font-semibold capitalize text-ink">{format(month, 'LLLL yyyy', { locale: dfLocale })}</h3>
        <div className="flex gap-0.5">
          <button type="button" aria-label="Previous month" onClick={() => setMonth((m) => addMonths(m, -1))} className="rounded p-0.5 text-ink-2 hover:bg-surface-2"><ChevronLeft size={13} /></button>
          <button type="button" aria-label="Next month" onClick={() => setMonth((m) => addMonths(m, 1))} className="rounded p-0.5 text-ink-2 hover:bg-surface-2"><ChevronRight size={13} /></button>
        </div>
      </div>
      <div className="grid grid-cols-7 gap-0.5" role="grid" aria-label={t('cal.minPicker')}>
        {cells.map((d) => (
          <button
            key={d.toISOString()} type="button" onClick={() => onPick(d)}
            className={cn(
              'tnum rounded py-0.5 text-center text-[11px] hover:bg-accent-tint',
              !isSameMonth(d, month) && 'text-ink-3/60',
              isSameDay(d, anchor) && 'bg-accent font-semibold text-white hover:bg-accent',
              isToday(d) && !isSameDay(d, anchor) && 'font-semibold text-accent',
            )}
          >
            {format(d, 'd')}
          </button>
        ))}
      </div>
    </div>
  );
}

/* ── Event detail ──────────────────────────────────────────────────── */

function EventDetail({ ev, onClose }: { ev: CalEvent; onClose: () => void }) {
  const { t, dfLocale } = useOps();
  const [cancelling, setCancelling] = useState(false);
  const [reason, setReason] = useState('');
  return (
    <motion.div
      className="fixed inset-0 z-50 flex items-start justify-center bg-ink/20 p-4 pt-24"
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      onClick={onClose} role="dialog" aria-modal="true" aria-label={ev.title}
    >
      <motion.div
        className="w-full max-w-md rounded-2xl border border-line bg-surface p-4 shadow-lift"
        initial={{ opacity: 0, scale: 0.96, y: 8 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.96, y: 8 }}
        transition={{ type: 'spring', stiffness: 380, damping: 34 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-2 flex items-start justify-between gap-2">
          <div>
            <h3 className="text-[15px] font-semibold text-ink">{ev.title}</h3>
            <p className="tnum mt-0.5 text-[12px] text-ink-3">
              {format(ev.start, 'EEEE d LLLL · HH:mm', { locale: dfLocale })}–{format(ev.end, 'HH:mm')}
            </p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="rounded-md p-1 text-ink-3 hover:bg-surface-2"><X size={15} /></button>
        </div>

        <div className="space-y-2 text-[13px]">
          {ev.address && <p className="text-ink-2">{ev.address}</p>}
          <div className="flex flex-wrap items-center gap-1.5">
            <StatusPill label={t(`cal.status.${ev.status}`)} tone={ev.status === 'confirmed' ? 'emerald' : 'amber'} />
            {ev.highIntent && <StatusPill label={t('cal.highIntent')} tone="amber" />}
            {ev.chips?.includes('probate') && <StatusPill label={t('cal.probate')} tone="slate" />}
            {ev.chips?.includes('signInReady') && <StatusPill label={t('cal.signInReady')} tone="accent" />}
            {ev.source === 'mock' && <EvidenceChip state="external" label={MOCK_PROVIDER} animate={false} />}
          </div>
          {ev.attendee && (
            <p className="flex items-center gap-2 text-ink-2">
              {ev.attendee.avatar && <img src={ev.attendee.avatar} alt="" className="h-6 w-6 rounded-full border border-line object-cover" />}
              {ev.attendee.name}
            </p>
          )}
          {ev.linkedException && <p className="text-ev-conflict">{t('cal.linkedException')}</p>}
          {ev.type === 'openHouse' && <p className="text-[12px] text-ink-3">{t('cal.consentNote')}</p>}

          {/* Deliberately restricted access section */}
          <p className="flex items-center gap-2 rounded-lg border border-dashed border-line-strong bg-surface-2 px-2.5 py-2 text-[12px] text-ev-blocked">
            <Lock size={13} className="shrink-0" aria-hidden /> {t('cal.accessRestrictedRow')}
          </p>

          <div className="flex flex-wrap gap-1.5 pt-1">
            <button type="button" className="rounded-lg border border-accent/40 bg-accent-tint px-2.5 py-1 text-[12px] font-medium text-accent" title="A2 — sends updated confirmation">
              {t('cal.confirm')}
            </button>
            <button type="button" className="rounded-lg border border-line px-2.5 py-1 text-[12px] font-medium text-ink-2 hover:bg-surface-2" title="A2 — sends updated confirmation">
              {t('cal.reschedule')}
            </button>
            <button type="button" onClick={() => setCancelling((v) => !v)} className="rounded-lg border border-ev-conflict/40 px-2.5 py-1 text-[12px] font-medium text-ev-conflict hover:bg-[#C2492B]/5">
              {t('cal.cancelNotice')}
            </button>
            <Link to="/conversations" className="rounded-lg border border-line px-2.5 py-1 text-[12px] font-medium text-ink-2 hover:bg-surface-2">
              {t('cal.openConversation')}
            </Link>
          </div>
          {cancelling && (
            <div className="rounded-lg border border-line bg-surface-2 p-2.5">
              <label className="mb-1 block text-[12px] font-medium text-ink-2" htmlFor="cancel-reason">{t('cal.cancelReason')}</label>
              <input
                id="cancel-reason" value={reason} onChange={(e) => setReason(e.target.value)}
                className="h-8 w-full rounded-lg border border-line bg-surface px-2 text-[13px] text-ink focus:outline-none focus:ring-2 focus:ring-accent"
              />
              <button type="button" disabled={reason.trim().length < 3}
                className="mt-2 rounded-lg bg-ev-conflict px-2.5 py-1 text-[12px] font-medium text-white disabled:cursor-not-allowed disabled:opacity-50">
                {t('cal.cancelNotice')}
              </button>
            </div>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}

/* ── Booking dialog ────────────────────────────────────────────────── */

interface ContactOpt { name: string; smsConsent: boolean; emailConsent: boolean }
const CONTACTS: ContactOpt[] = [
  { name: 'Jonah Whitfield', smsConsent: false, emailConsent: true },
  { name: 'Eleanor Vance', smsConsent: true, emailConsent: true },
  { name: 'Gurpreet Sandhu', smsConsent: true, emailConsent: true },
];
const PROPERTIES = ['DEMO-ON-PROPERTY-001, Toronto', 'DEMO-ON-PROPERTY-002, Mississauga', 'DEMO-ON-PROPERTY-003, Ottawa'];

function BookingDialog({ onClose, onBooked }: { onClose: () => void; onBooked: (ev: CalEvent) => void }) {
  const { t, dfLocale } = useOps();
  const [type, setType] = useState<'showing' | 'consultation' | 'openHouse'>('showing');
  const [contact, setContact] = useState<ContactOpt>(CONTACTS[0]);
  const [property, setProperty] = useState(PROPERTIES[0]);
  const [when, setWhen] = useState(() => format(addDays(new Date(), 1), "yyyy-MM-dd'T'10:00"));
  const [duration, setDuration] = useState(30);
  const start = new Date(when);
  const end = new Date(start.getTime() + duration * 60_000);

  const preview = t('cal.dialog.previewBody', {
    name: contact.name.split(' ')[0],
    type: t(`cal.type.${type}`).toLowerCase(),
    property,
    date: Number.isNaN(start.getTime()) ? '—' : format(start, 'EEE d MMM · HH:mm', { locale: dfLocale }),
  });

  return (
    <motion.div
      className="fixed inset-0 z-50 flex items-start justify-center bg-ink/20 p-4 pt-16"
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      onClick={onClose} role="dialog" aria-modal="true" aria-label={t('cal.dialog.title')}
    >
      <motion.div
        className="w-full max-w-[560px] rounded-2xl border border-line bg-surface p-5 shadow-lift"
        initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 12 }}
        transition={{ duration: 0.2 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-[16px] font-semibold text-ink">{t('cal.dialog.title')}</h3>
          <button type="button" onClick={onClose} aria-label="Close" className="rounded-md p-1 text-ink-3 hover:bg-surface-2"><X size={15} /></button>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label htmlFor="bk-type" className="mb-1 block text-[12px] font-medium text-ink-2">{t('cal.dialog.type')}</label>
            <select id="bk-type" value={type} onChange={(e) => setType(e.target.value as typeof type)}
              className="h-9 w-full rounded-lg border border-line bg-surface px-2 text-[13px] text-ink focus:outline-none focus:ring-2 focus:ring-accent">
              <option value="showing">{t('cal.type.showing')}</option>
              <option value="consultation">{t('cal.type.consultation')}</option>
              <option value="openHouse">{t('cal.type.openHouse')}</option>
            </select>
          </div>
          <div>
            <label htmlFor="bk-contact" className="mb-1 block text-[12px] font-medium text-ink-2">{t('cal.dialog.contact')}</label>
            <select id="bk-contact" value={contact.name} onChange={(e) => setContact(CONTACTS.find((c) => c.name === e.target.value) ?? CONTACTS[0])}
              className="h-9 w-full rounded-lg border border-line bg-surface px-2 text-[13px] text-ink focus:outline-none focus:ring-2 focus:ring-accent">
              {CONTACTS.map((c) => <option key={c.name} value={c.name}>{c.name}</option>)}
            </select>
            {/* Consent chips inline */}
            <div className="mt-1.5 flex flex-wrap gap-1">
              <StatusPill label="Email" tone={contact.emailConsent ? 'emerald' : 'red'} />
              <StatusPill label="SMS" tone={contact.smsConsent ? 'emerald' : 'red'} />
            </div>
          </div>
          <div>
            <label htmlFor="bk-prop" className="mb-1 block text-[12px] font-medium text-ink-2">{t('cal.dialog.property')}</label>
            <select id="bk-prop" value={property} onChange={(e) => setProperty(e.target.value)}
              className="h-9 w-full rounded-lg border border-line bg-surface px-2 text-[13px] text-ink focus:outline-none focus:ring-2 focus:ring-accent">
              {PROPERTIES.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="bk-when" className="mb-1 block text-[12px] font-medium text-ink-2">{t('cal.dialog.when')}</label>
            <input id="bk-when" type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)}
              className="h-9 w-full rounded-lg border border-line bg-surface px-2 text-[13px] text-ink focus:outline-none focus:ring-2 focus:ring-accent" />
          </div>
          <div>
            <label htmlFor="bk-dur" className="mb-1 block text-[12px] font-medium text-ink-2">{t('cal.dialog.duration')}</label>
            <select id="bk-dur" value={duration} onChange={(e) => setDuration(Number(e.target.value))}
              className="h-9 w-full rounded-lg border border-line bg-surface px-2 text-[13px] text-ink focus:outline-none focus:ring-2 focus:ring-accent">
              {[30, 45, 60, 120].map((m) => <option key={m} value={m}>{t('cal.dialog.minutes', { n: m })}</option>)}
            </select>
          </div>
        </div>

        {/* Channel confirmation preview */}
        <div className="mt-4 rounded-lg border border-line bg-surface-2 p-3">
          <p className="mb-1 text-[11px] font-medium uppercase tracking-[0.04em] text-ink-3">{t('cal.dialog.preview')}</p>
          <p className="text-[13px] leading-5 text-ink-2">{preview}</p>
          <div className="mt-2">
            {contact.smsConsent ? (
              <p className="flex items-center gap-1.5 text-[12px] text-ev-verified"><Phone size={12} aria-hidden /> SMS + email</p>
            ) : (
              <div className="flex flex-wrap items-center gap-2">
                <BlockedAction label="SMS" reason={`${t('cal.dialog.smsBlocked')} ${t('cal.dialog.smsRemediation')}`} />
                <p className="flex items-center gap-1.5 text-[12px] text-ev-verified"><Phone size={12} aria-hidden /> {t('cal.dialog.emailOk')}</p>
              </div>
            )}
          </div>
        </div>

        <div className="mt-4 flex items-center justify-between gap-2">
          <p className="text-[11px] text-ink-3">{t('cal.dialog.autonomyNote')}</p>
          <div className="flex gap-2">
            <button type="button" onClick={onClose} className="h-8 rounded-lg border border-line px-3 text-[13px] font-medium text-ink-2 hover:bg-surface-2">
              {t('cal.dialog.cancel')}
            </button>
            <button
              type="button"
              onClick={() => onBooked({
                id: `mcal_local_${Date.now()}`, type, title: `${t(`cal.type.${type}`)} — ${contact.name}`,
                address: property, start, end, status: 'tentative', attendee: { name: contact.name }, source: 'mock',
              })}
              className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-accent px-3 text-[13px] font-medium text-white hover:bg-accent-hover"
            >
              <Upload size={13} aria-hidden /> {t('cal.dialog.book')}
            </button>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}
