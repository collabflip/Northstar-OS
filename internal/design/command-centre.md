# Agent Command Centre — `/`

**Purpose:** The daily cockpit. In one glance: what moved, what needs *me*, what the AI recommends, and what's blocked by policy. This is the default landing screen after sign-in.

## Layout

Standard app shell. Content: 24px padding, 12-col grid.
- **Page header:** h1 "Good morning, Maya" (time-aware; fr: « Bonjour, Maya ») + meta subline "Tuesday, June 10 · Harbourline Realty Inc. · Ontario policy pack v2.3.1" + right-aligned "Evidence" legend button and primary CTA "New seller lead".
- **Row 1 — KPI strip (4 cards, equal width):**
  1. Active seller opportunities — figure `7`, delta "+2 this week", mini 7-day bar sparkline (accent bars, 24px tall).
  2. Approvals waiting on you — figure `3`, amber dot, subline "Oldest: 26 h".
  3. High-intent leads (72 h) — figure `2`, subline "Scored ≥ 80".
  4. Compliance items — figure `1`, red-orange dot, subline "CASL consent expiring".
- **Row 2 (8+4 cols):**
  - **Left (8): Pipeline snapshot** — horizontal stage bar of the 10 pipeline stages with counts (New lead 2 · Qualified 1 · Consultation booked 2 · Dossier ready 1 · Strategy proposed 1 · Approved 0 · Live listing 1 · Offer review 1 · Under contract 1 · Closed 0). Each stage is a compact pill; clicking routes to `/pipeline` filtered to that stage.
  - **Right (4): Autonomy status card** — current ceiling `A2 — Reversible execution` with AutonomyBadge, meta "Set by broker of record", link "Request change → Settings". Below: mini PolicyGate summary "Last commit-time check: 14/14 passed" emerald.
- **Row 3 (4+4+4 cols): three work columns.**
  - **"Needs your approval" (4):** stacked approval cards — e.g. "Publish listing copy — 48 Wrenwood Ave" (AutonomyBadge A4, EvidenceChip Generated, age chip "26 h"), "Launch spring seller campaign" (A3, amber budget chip "$1,500 cap"), "Send follow-up SMS — Gurpreet Sandhu" (A2, Blocked? no — Approve). Each: title, destination line, age, quick Approve/Review buttons; card click → `/approvals` item.
  - **"High-intent leads" (4):** lead cards — Jonah Whitfield, `avatar-jonah.png`, score figure `88` with ConfidenceBar and EvidenceChip AI, reason line "Viewed Wrenwood listing 4× · asked about offer deadline", CTA "Open conversation". Second: "Priya Raghunathan — requested valuation, Ottawa" score 81.
  - **"AI recommended next actions" (4):** numbered recommendation list, each with EvidenceChip AI + expandable "Why this?" (opens EvidenceDrawer). Items: "Book Pelletier strategy review — dossier confidence reached 87%", "Request missing utility-cost info for 212 Millstone Dr" (EvidenceChip Missing), "Refresh comparables for 9 Argyle Cres — data 9 days old" (FreshnessIndicator red-orange).
- **Row 4 (7+5 cols):**
  - **Today's schedule (7):** compact agenda list — 10:00 Pelletier consultation prep (task), 13:30 Showing — 48 Wrenwood (Jonah Whitfield), 15:00 Call with lawyer re: Vance estate (exception flagged amber). Each row: time (mono, tabular), title, StatusPill, linked record.
  - **Compliance alerts (5):** stacked alert rows with left borders by severity — "CASL express consent expires in 12 days for 2 contacts" (amber, CTA "Review"), "FINTRAC queue: 1 file awaiting review" (red-orange, restricted: shows only to authorized roles; others see a grey locked row "Restricted — compliance officer"), "DNCL: no new flags" (emerald calm state).

## Animation

- **Mount:** KPI cards stagger 50ms (`y:12→0, opacity 0→1`, 240ms); figures count up 0→value over 600ms; sparkline bars grow from baseline with 30ms stagger.
- **Work columns:** each column cascades its cards with 40ms stagger on mount.
- **Recommendation expand:** height animates (Framer `AnimatePresence`, spring 380/34); chevron rotates 180° in 160ms.
- **Hover:** all cards lift -1px + border darkens 140ms; KPI sparkline bars brighten on hover.
- **Alert rows:** severity dot has a slow 2.4s pulse on the red-orange FINTRAC row only (accessibility: pulse stops with reduced-motion).

## Interactions

- Every card is clickable through to its screen; every evidence chip opens the EvidenceDrawer scoped to that statement.
- "Approve" quick-action on the A2 SMS card opens the payload-bound approval sheet inline (diff + PolicyGatePanel) without leaving the page.
- KPI "Approvals waiting" pulses a subtle amber ring until count is 0 (state-driven, not decorative).
- Empty states: if approvals clear → `empty-inbox.svg` + "All caught up — nothing waiting on you."

## States

Loading skeletons per card (final layout preserved); error state per panel with retry; role variants — broker of record sees an extra "Brokerage overview" KPI row (agents' pipelines); seller role never sees this screen (routes to `/portal`).

## Assets

`avatar-jonah.png`, `empty-inbox.svg`, `logo.svg`. All else icon/type-driven.
