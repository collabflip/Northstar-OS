# Seller 360 Profile — `/sellers/:id`

**Demo record:** Nadia & Marc Pelletier — sellers of 48 Wrenwood Ave, Toronto (`sel_01H...`).

**Purpose:** Everything about the seller relationship in one grounded view: identity, consent evidence per channel, motivation, score with explanation, and what to do next.

## Layout

- **Breadcrumb:** Sellers / Nadia & Marc Pelletier.
- **Profile header card:** `avatar-pelletier.png` (64px) · h1 "Nadia & Marc Pelletier" · meta row: preferred language chip "fr-CA preferred" · relationship chip "Owners (confirmed)" EvidenceChip Verified · source "Web valuation form · May 28" · FreshnessIndicator "Contact record updated 3 h ago". Right side: **Lead score block** — Source Serif figure `86` /100 with ConfidenceBar (accent) + EvidenceChip AI + "Why this score?" link + recommended-next-action card: "Book strategy review" with one-click "Book consultation" button (A2, allowed).
- **Tab bar** (underline style, active accent 2px): Overview · Consent & Communication · Timeline · Property · Briefing.

### Tab: Overview (default)

Two columns (7+5):
- **Left:**
  - **Contact card:** phone, email (both with per-channel consent mini-chips inline), preferred name "Nadia", language fr-CA, address of record.
  - **Motivation & timing card:** "Downsizing — children have moved out" (EvidenceChip Verified, source: intake call summary), desired timing "60–90 days" (Verified), occupancy "Owner-occupied" (Third-party), renovations list ("Kitchen 2021 · Roof 2019" Verified with doc links), mortgage context line (plain: "Seller mentioned mortgage-free status — not verified, no financial advice given", EvidenceChip Assumption dashed).
  - **Open items card:** MissingSlot rows — "Utility annual costs — Missing" with "Request from seller" button (drafts an A1 message), "Basement waterproofing details — Missing".
- **Right:**
  - **Agent briefing card** (violet-grey left border, EvidenceChip Generated): 5-bullet concise briefing ("Motivated but anxious about timing… prefers French communication… decision-maker is Marc on price, Nadia on presentation…"), footer: model/prompt version mono `k3-sellerbrief@1.4.2`, "Why this?" link.
  - **Recommended next action card:** AI recommendation with rationale expandable, autonomy badge A2, "Schedule" button.
  - **Activity snapshot:** last 5 timeline events.

### Tab: Consent & Communication

- **Channel consent matrix:** rows per channel (Email / SMS / Voice / Mail): status chip (Express consent — Verified emerald; Implied — expires 2025-12-02 amber; Voice — Missing muted), evidence column ("Web form submission #W-1042, 2025-05-28 14:03, IP logged"), CASL basis text, expiry date, "View evidence" drawer link.
- **Suppression & preferences:** "Do not contact before 9 am ET" preference chip; suppression status "Not suppressed" emerald.
- **Communication log:** per-channel last contact + template used (mono template IDs).

### Tab: Timeline

Vertical TimelineItem list, filterable by actor (All / Human / Agent / System): intake form submitted (System), Consent Resolver verified email consent (Agent chip `consent-resolver`), consultation booked (Maya), dossier generated (Agent), strategy approval requested → Daniel. Each event: timestamp, actor chip, evidence chip, expandable payload summary, audit hash link (mono, routes to `/audit` filtered).

### Tab: Property

Linked property card: `property-wrenwood-exterior.jpg` thumbnail, address, stage StatusPill "Dossier ready", valuation range chip, "Open dossier →" button.

### Tab: Briefing

Full-page agent briefing: generated narrative sections (Situation / Priorities / Risks / Suggested approach), each paragraph carrying its evidence chips inline; "Regenerate" is A1 (allowed), "Send to seller" is **Blocked — A4** with reason ("Client-facing strategy documents require human review and send").

## Animation

- **Mount:** header card fades/rises 200ms; tabs' content staggers cards 40ms; score figure counts 0→86 over 700ms; ConfidenceBar fills 500ms.
- **Tab switch:** content cross-fade 160ms + 8px rise; active tab underline slides (layoutId spring 320/30).
- **Consent matrix rows:** hover reveals "View evidence" affordance; drawer opens spring from right.
- **MissingSlot:** dashed border subtly brightens on hover; "Request from seller" shows inline draft composer expanding with `AnimatePresence` height animation.

## Interactions

- Language chip toggles the *record's* preferred language (preview of outbound templates switches to French).
- Lead score "Why this score?" opens EvidenceDrawer with factor breakdown: motivation 30/30, timing 22/25, engagement 19/25, property fit 15/20 — each bar animated, each with source.
- All timeline events deep-link to audit.

## States

Loading skeletons; consent-expired variant (banner warning + re-consent CTA); role restriction: FINTRAC-related notes hidden unless authorized; empty timeline (new lead) shows starter checklist.

## Assets

`avatar-pelletier.png`, `property-wrenwood-exterior.jpg`.
