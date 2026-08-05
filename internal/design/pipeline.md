# Seller Pipeline — `/pipeline`

**Purpose:** Kanban of the full seller journey. Moving a card across certain stages is a **policy-gated act** — the board makes autonomy tangible.

## Layout

- **Page header:** h1 "Seller Pipeline" + right controls: stage filter chips ("All · Ontario"), assignee filter, sort (Score / Last activity), view toggle (Board | List), primary CTA "New seller lead".
- **Board:** horizontal scroll of 10 columns (each 288px, surface-2 wells, rounded-xl). Column headers: stage name (meta uppercase) + count + total est. value (tabular, ink-3).

**Stages & seeded cards:**
1. **New lead (2):** "Priya Raghunathan — Kanata, Ottawa" (source chip "Web form", 2 h), "Leo Martins — Hamilton mountain" (source "Referral", 1 d).
2. **Qualified (1):** "Gurpreet Sandhu — 212 Millstone Dr, Mississauga" — consent chips per channel (Email Verified · SMS Assumption dashed · Voice Missing), score 74.
3. **Consultation booked (2):** "Eleanor Vance — 9 Argyle Cres, Ottawa" (estate-sale chip amber "Probate context"), "The Bouchard Family — Orleans".
4. **Dossier ready (1):** "Nadia & Marc Pelletier — 48 Wrenwood Ave, Toronto" — thumbnail `property-wrenwood-exterior.jpg`, valuation chip "$1.18M–$1.31M" (EvidenceChip Estimate), confidence 87%.
5. **Strategy proposed (1):** "Aisha Rahman — Yonge & Eglinton condo" (pending-seller-review chip).
6. **Approved (0):** empty well with dashed placeholder "No opportunities — approved strategies land here."
7. **Live listing (1):** "48 Wrenwood Ave" variant card (this demo flow also shows a separate live listing: "22 Foxbar Rd — $1,849,000", LIVE StatusPill emerald, 6 days on market).
8. **Offer review (1):** "48 Wrenwood Ave — 2 offers received" red-orange attention dot.
9. **Under contract (1):** "15 Bessborough Dr — conditional, financing due Fri" amber.
10. **Closed (0):** empty placeholder.

**Card anatomy:** address (body-sm 600) + contact name (ink-3) · optional property thumbnail (48px rounded) · lead score figure + tiny ConfidenceBar · 1–2 evidence chips (consent state, estimate, missing) · task count + avatar stack · FreshnessIndicator if stale.

## Animation

- **Mount:** columns slide in from right with 50ms stagger (`x: 24→0, opacity 0→1`, 280ms); cards cascade within columns 35ms.
- **Drag (dnd-kit):** pickup → card scales 1.03, shadow-md, tilts 1.5°; hovered column well highlights accent-tint; drop → 200ms settle spring.
- **Policy-gated drop:** dropping into "Approved" or beyond triggers the gate sheet (below) sliding up from bottom center (spring 380/34) — the card animates into the column only after approval, otherwise returns to origin with a 240ms ease-back and a reason toast.
- **Hover:** card lift -1px, border darkens; column headers' counts tick with a 200ms number-flip when changed.

## Interactions

- **Policy gate sheet** on gated moves: shows what's required ("Moving to Approved requires: payload-bound strategy approval · broker of record sign-off · A4 human commit"), the PolicyGatePanel checklist live-evaluated, and Approve/Cancel. If the user lacks authority → BlockedAction with exact reason ("Requires role: Broker of Record").
- Card click → Seller 360 (or dossier if stage ≥ Dossier ready). Quick menu (`…`): "Request missing info", "Re-run lead score", "View audit trail".
- List view: dense DataTable with same stages as StatusPills, sortable columns (score, value, last activity, owner).
- Consent chips on cards are hoverable: popover shows per-channel consent evidence summary + link to Seller 360 consent tab.

## States

Loading: column skeletons. Empty stage: dashed placeholder text (per stage). Stale card: FreshnessIndicator amber/red with "Refresh" quick action. fr-CA: stage names fully translated (« Nouvelle piste », « Qualifié », « Inscription active »…); column width flexible for +20%.

## Assets

`property-wrenwood-exterior.jpg`, `property-millstone.jpg`, `property-argyle.jpg` (card thumbnails); avatars for owner stacks.
