# Offer Comparison Room — `/offers`

**Purpose:** Upload offers (PDF/image), extract and normalize terms, compare side-by-side with **page-cited provenance for every cell** — while making it visually impossible to forget that only a human can act on offers.

## Layout

- **Permanent banner (Banner `escalation`, red-orange, top, non-dismissible):** "Northstar never submits, accepts, rejects, discloses, amends, or counters an offer. Any action on these documents requires exact human authorization — A4, licensed registrant." (fr: « Northstar ne présente, n'accepte, ne rejette ni ne contre une offre… »)
- **Page header:** h1 "Offer Room — 48 Wrenwood Ave" · meta "2 offers · irrevocability countdown live" · CTA "Upload offer (PDF or image)".
- **Upload zone:** dashed dropzone card (EmptyState style when no offers): "Drag offer PDFs or photos here — scanned locally, malware-checked, stored encrypted" with truthful processing chips (Extraction: OCR + structured parse · every field cites its page).
- **Comparison grid (the core):** rows = terms, columns = offers. Sticky first column (term labels, 220px) + sticky header row (offer identities).

**Offer columns:**
- **Offer A — "Whitfield (buyer)"** · received Jun 10, 18:42 · irrevocable until **Jun 11, 21:00** (live countdown chip, amber when < 6 h) · extraction confidence 94%.
- **Offer B — "D'Souza"** · received Jun 10, 20:05 · irrevocable until Jun 12, 12:00 · confidence 91%.

**Term rows (each cell: value + CitationRef `[p.2 §1.3]`):**
Price ($1,225,000 vs $1,198,000 — delta chip +$27k emerald on A) · Deposit ($60,000 vs $50,000; "within 24 h of acceptance" both) · Completion date (Aug 15 vs Jul 30) · Possession (same day, both) · Irrevocability (dates above) · Conditions: A — Financing 5 days + Inspection 3 days (amber chips); B — Financing only 3 days · Sale-of-property condition: none / none ✓ · Inclusions (appliances listed, CitationRef each) · Exclusions ("dining chandelier" B only) · Rental items ("hot water tank — rental" both, Verified) · Warranties (none stated — MissingSlot muted) · Adjustments (standard) · Schedules attached (A, B, C vs A, B) · Unusual clauses (A: "escalation clause — cap $1,260,000" red-orange Conflict chip + flag; B: none) · **Missing fields/signatures** (B: "Witness signature missing on p.6" — Conflict chip, escalation note) · Contradictions (A: "deposit line vs schedule A mismatch $60k/$55k — verify" red-orange).

- **Cell click → source popover:** extracted text snippet + page thumbnail placeholder + "Open document at p.2" (opens in-app PDF viewer pane, right drawer 480px, page highlighted).
- **Right rail (360px):**
  1. **"Questions for your licensed agent" card** (accent border, Generated chip): AI-generated, plain-language, e.g. "Is the escalation clause enforceable as drafted?", "Does the 24 h deposit timeline create risk if acceptance occurs Friday evening?", "How should we weigh a higher price with two conditions vs lower with one?" — each with citation to the triggering cell.
  2. **Extraction QA card:** confidence per offer, fields needing human verification list (3), "Mark verified" checkboxes (writes audit).
  3. **Actions card (deliberately austere):** "Record seller decision" (A4 — opens exact-authorization sheet: decision type, exact payload, countersign by registrant) · everything else greyed with lock: "Submit / Accept / Reject / Counter — unavailable in software by design."
- **Seller-brief generator:** "Prepare seller briefing" (A1) → generates a plain-language comparison summary doc (Generated chip) with human-review placeholder banner before it can be shared.

## Animation

- **Mount:** banner slides down 200ms first (it matters most); grid columns stagger 80ms; cells cascade 15ms down each column.
- **Upload:** file card appears with progress ring; extraction simulation: cell skeletons shimmer, then values pop in with citation chips staggering (600ms total) — communicates "extraction is real work".
- **Countdown chip:** tabular digits tick each second; under 2 h it shifts to red-orange with a soft pulse.
- **Cell hover:** citation chip lifts; click → popover spring 380/34 with snippet fade-in.
- **Row hover:** entire term row highlights surface-2; delta chips pop.
- **Conflict cells:** red-orange left tick inside cell; first view draws attention with one 600ms glow.

## Interactions

- "Mark verified" turns cell chips Verified (emerald) and logs actor/timestamp; unverified cells keep Third-party/Estimate typing.
- Every CitationRef deep-links to the exact page/section in the document viewer (scroll + highlight 300ms).
- Recording a seller decision requires: decision type, the exact offer identity, free-text instruction, registrant countersign — then writes a sealed audit event; the UI repeats the no-guarantee language at the confirmation step.
- Bilingual: term labels + questions panel fully fr-CA; documents remain in source language (truthful note).

## States

No offers (dropzone EmptyState); extraction failed (error card with retry + "enter manually" fallback table); low-confidence fields (amber underline + tooltip "verify against source"); expired irrevocability (grey "expired" chip, row desaturates).

## Assets

None — documents render as styled page thumbnails (CSS), icons via lucide (`FileText`, `FileWarning`, `Scale`, `Clock`, `Lock`).
