# Property Dossier — `/properties/:id`

**Demo record:** 48 Wrenwood Ave, Toronto ON M4S 2H7 (Davisville Village).

**Purpose:** The evidence-grounded intelligence heart of the product. Every material statement is typed, sourced, and expandable. Permanently labeled as **decision support — not an appraisal**.

## Layout

- **Breadcrumb:** Pipeline / Pelletier / Property Dossier.
- **Permanent banner (Banner `info`, accent-tint, always on top):** "Decision support for a licensed registrant. This dossier is not an appraisal, a guaranteed sale price, or a final pricing opinion." (fr: « Outil d'aide à la décision… ») — dismiss: never.
- **Header block:** left — `property-wrenwood-exterior.jpg` (rounded-xl, 200px) + h1 "48 Wrenwood Ave" + meta "Davisville Village, Toronto · Detached 2-storey · MLS mock listing HLD-2041" + StatusPill "Dossier ready". Right — **valuation headline card** (paper bg, serif):
  - Source Serif 4 figure: **$1,180,000 – $1,310,000** with point estimate $1,245,000 (tabular).
  - ConfidenceBar 87% + EvidenceChip Estimate + FreshnessIndicator "Comps refreshed 2 h ago" + "Why this?" button.
- **Tab bar:** Profile · Market Context · Comparables · Valuation · Evidence & Issues · Timeline.

### Tab: Profile (default)

- **Normalized property profile grid (8 cols):** spec rows as label/value with evidence chips per row: Lot 33 × 122 ft (Third-party: municipal record MPAC-mock), 4 bd / 3 ba (Verified: agent input), Finished basement (Assumption dashed — "seller stated, no permit found"), Parking: private drive 2 (Verified), Taxes $8,940/yr (Third-party). Each row hover → "Why this?" affordance.
- **Side rail (4 cols):**
  - **Missing information card:** MissingSlot list — "2024 utility costs", "Waterproofing documentation", "Survey (existing?)". Each with "Request from seller" (A1 draft) or "Add manually".
  - **Contradictions card** (red-orange left border): "Lot depth: municipal record 122 ft vs. old listing 125 ft — unresolved" EvidenceChip Conflict, CTA "Resolve" opens reconciliation dialog (choose value + record rationale → audit).
  - **Agent runs card:** last agent executions — Dossier Agent, Market Intelligence, Comparable Selection — AgentRunCard list (confidence, evidence count, versions, duration).

### Tab: Market Context

- **Neighbourhood card:** `comp-map.png` (rounded, 16:10) + key stats grid: Davisville detached median $1.62M (Third-party, source "Board feed — mock", freshness), days-on-market median 14 (Estimate), months of inventory 1.8 (Estimate), 90-day trend sparkline (accent line chart, CSS/SVG).
- **Trend narrative** (Generated chip): 3-sentence plain-language summary with inline citations; expandable "Why this?".

### Tab: Comparables

- **Comparable set table:** 5 sold comps + 2 excluded. Columns: Address · Sold price (tabular) · Sold date · Distance · Bed/Ba · Adjustment net · Relevance score (mini bar) · Evidence chip.
  - e.g. "31 Wrenwood Ave — $1,290,000 — May 2025 — 120 m — 4/3 — +$12k adj — 92".
  - Excluded rows greyed with reason chips: "Excluded: estate sale, atypical condition" / "Excluded: >1.5 km".
- **Selection reasoning panel** (accent left border, AI chip): numbered rationale per comp ("Selected: same street, same vintage, adjusted +$12k for finished basement"); adjustment rationale table (factor, direction, magnitude, basis chip).
- **Map card:** `comp-map.png` with pins 1–5; hovering a table row highlights the pin (scale 1.2, 160ms).

### Tab: Valuation

- **Range visualization:** horizontal range bar (surface-2 track) with low–high band (amber tint), point-estimate marker (accent), list-price reference tick; confidence 87% labeled.
- **Basis table:** each driver (comp median, adjustments, market trend, condition premium) with contribution + evidence type.
- **Assumptions list** (dashed chips): "Interior condition assumed good based on 2021 renovation photos", "No material latent defects".
- **Sensitivity note:** "±$40k if finished-basement status unverified."

### Tab: Evidence & Issues

- **Evidence ledger table:** every material statement → source name, type chip, retrieved-at, confidence, lineage (agent→tool→source mono IDs), audit link. Filterable by evidence type (chip multi-select).
- **Open questions for the agent:** checklist ("Confirm waterproofing scope", "Verify survey existence") — checking one creates a task (A2).

### Tab: Timeline

Property & listing timeline: municipal record syncs, prior listing (2019, expired), renovation permit events, dossier regeneration runs. TimelineItem pattern.

## Animation

- **Mount:** header image fades + scales 1.03→1 (500ms); valuation figure counts up 800ms (serif numerals, tnum); range bar draws left→right 700ms; confidence bar fills.
- **Tabs:** underline slide spring; content 8px rise + fade 160ms.
- **Comp table:** rows stagger 30ms; row hover highlights row + map pin simultaneously.
- **EvidenceDrawer:** spring from right 420px; lineage chain nodes cascade 25ms.
- **Contradiction card:** red-orange border has one-time attention glow on first view (box-shadow fade 1.2s, then static).

## Interactions

- Every evidence chip / "Why this?" opens the EvidenceDrawer scoped to that statement (source, freshness, confidence, lineage, policy rules).
- "Resolve" contradiction dialog: pick value, free-text rationale, submit → writes audit event + toast; resolved state flips chip to Verified with history link.
- "Request from seller" generates an A1 bilingual draft (seller prefers fr-CA → French default preview) with approve-to-send (A2).
- Range bar markers hoverable with exact values.

## States

Stale data variant (banner warning "Market data 9 days old — refresh recommended" + Refresh button, A2); missing-media placeholder for photos not yet uploaded; role restrictions unchanged (all agent roles view; edits logged).

## Assets

`property-wrenwood-exterior.jpg`, `comp-map.png`.
