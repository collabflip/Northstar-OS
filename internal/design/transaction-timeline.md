# Transaction Timeline — `/transactions/:id`

**Demo record:** 15 Bessborough Dr, Toronto — accepted offer, conditional period. Coordinator: Sofia Tremblay.

**Purpose:** Condition tracking, deadlines, documents, owners, exceptions, and lawyer handoff — with visible proof that the workflow **survives restarts without duplicating actions**.

## Layout

- **Page header:** h1 "Transaction — 15 Bessborough Dr" · parties meta (Seller: A. Nguyen · Buyer: K. Osei · $1,075,000 accepted Jun 6) · StatusPill "Conditional" amber.
- **Durable-workflow badge (signature element, header right):** card with `Workflow` icon: "Workflow `txn_15bess@v1` · **Durable — survives restarts**" emerald chip + "Last checkpoint 14 min ago · 0 duplicate actions · idempotency enforced" + "Demo: simulate worker restart" button (ghost; runs a live demonstration: banner "Worker restarted at 14:03:12 — workflow resumed from checkpoint #18 — 0 duplicated sends" appears, Verified chip).
- **Health strip (4 mini tiles):** Conditions remaining 2 · Next deadline **Financing — Fri Jun 13, 17:00 (3 d 2 h)** live countdown · Documents 8/11 · Exceptions 1 (red-orange dot).

### Main: two columns (8 + 4)

**Left — vertical master timeline (TimelineItem, grouped by phase):**
1. **Offer accepted (Jun 6)** ✓ — sealed audit link, payload hash mono.
2. **Deposit due (Jun 7, 24 h)** ✓ emerald — "Receipt of funds recorded · FINTRAC receipt-of-funds record created" Verified chip.
3. **Home inspection (Jun 10)** ✓ — inspector booking confirmation; report uploaded (doc chip).
4. **Financing condition (due Jun 13, 17:00)** — active amber; owner: buyer's rep; reminder schedule chip "reminded Jun 9 · next reminder Jun 12 (deduped)".
5. **Status: awaiting waiver/fulfilment** — pending grey; on fulfilment → firm sale animation.
6. **Lawyer handoff (Jun 16)** — task card: "Send executed APS + amendments to Harrison & Lee LLP" owner Sofia, checklist of 4 attachments (3/4 ready, "Status certificate — requested, waiting" MissingSlot amber).
7. **Closing (Jul 28)** — future, ghosted.

Each node: icon by type, timestamp (tabular), owner avatar, evidence chips, expandable detail (payloads, reminders sent with idempotency keys mono, policy checks).

**Left lower — exception alert card (red-orange border):** "Inspection report notes possible knob-and-tube wiring (p.7). Buyer may request amendment. Escalated to Maya — A4 human handling. AI will not draft negotiation language." with "Open related conversation" and "Log outcome" actions.

**Right rail:**
1. **Deadline calendar card:** mini month with deadline diamonds + list (Financing Jun 13 · Lawyer docs Jun 16 · Closing Jul 28); each links to timeline node.
2. **Document checklist card:** 11 docs with StatusPills (Received Verified / Requested / Missing muted): APS executed ✓ · Deposit receipt ✓ · Inspection report ✓ · Status certificate — requested · …; upload button per missing row.
3. **Responsible owners card:** RACI-lite list (Sofia — coordination; Maya — client comms; Lawyer — legal; Lender — financing) with contact actions (consent-aware).
4. **Client update card:** last seller update sent Jun 9 (fr template `txn-update@v2`, Verified consent) · "Send update" A2 with payload preview.
5. **Workflow event log card (mono-dense):** last 6 runner events: `chkpt_18 saved · remind_finance sent (idem_41d…) · webhook deposit_confirmed processed (dedup hit: 1 duplicate ignored)` — the dedupe line gets a Verified chip; "View full log → /audit".

### Closing checklist (collapsible bottom section, post-firm preview)

Ghosted checklist of 9 closing tasks (keys, funds, final walk-through, post-closing follow-up 30/90-day) that activates on firm status.

## Animation

- **Mount:** timeline nodes cascade 40ms with connecting line drawing downward (800ms); countdown digits tick; health tiles count up.
- **Restart simulation (the demo moment):** clicking it runs a staged sequence — badge greys ("restarting…" 600ms) → red-orange flash frame → emerald recovery banner slides in, checkpoint number increments, "0 duplicate actions" chip pops with BadgeCheck draw-in 300ms. Event log appends new mono lines with typewriter stagger.
- **Condition fulfilled:** node flips amber→emerald with check draw-in; connecting segment fills; StatusPill morphs; confetti-free (brand discipline) — instead the health strip tiles tick satisfyingly.
- **Exception card:** subtle one-time border glow on mount; resolve action collapses it 240ms into the timeline as a resolved node.
- **Hover:** nodes lift; owner avatars show role popovers.

## Interactions

- Reminder sending is A2 with dedup proof (idempotency key shown before send; "already sent" state if webhook raced).
- Document upload attaches provenance (uploaded-by, hash) automatically.
- "Log outcome" on exceptions requires registrant role (BlockedAction otherwise).
- Every node links to its audit events; workflow log deep-filters `/audit`.

## States

Loading skeletons; firm-sale state (banner emerald "Firm — conditions fulfilled"); exception-heavy state (multiple alert cards stack); terminated transaction (grey, archive mode, audit preserved).

## Assets

`avatar-sofia.png`, `avatar-maya.png`. No other imagery — data-dense screen.
