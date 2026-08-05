# Approval Inbox — `/approvals`

**Purpose:** The human-authority heart of the system. Every approval is **payload-bound**: you approve *this exact payload to this exact destination*, with the full policy gate visible. Fail-closed by design.

## Layout

- **Page header:** h1 "Approvals" + meta "3 waiting · oldest 26 h" + filter chips: All · Content · Campaigns · Communications · Pricing · and a freshness filter.
- **Two-pane:** left list (380px) / right detail (fluid). List rows: type icon + title + destination + age chip + AutonomyBadge + StatusPill (Waiting / Expiring soon amber). Selected row: accent-tint background.

**Seeded items:**
1. **"Publish listing copy — 48 Wrenwood Ave"** · Destination: MLS-mock + portal · A4 · expires in 46 h.
2. **"Launch bounded campaign — Spring seller seminar follow-up"** · Destination: Email via mock provider · A3 · budget $1,500.
3. **"Send consultation follow-up SMS — Gurpreet Sandhu"** · Destination: +1 905-555-0182 · A2 · CASL basis: express consent.

### Detail pane (selected item)

Sections stacked in a white card with generous padding (max 880px):

1. **Summary header:** title, requested-by (AgentRunCard mini: `content-brand-agent`, model `k3-content@2.1.0`, prompt `listing-copy@3.0`), created/expires timestamps, EvidenceChip Generated.
2. **Exact payload (DiffView):** for the listing copy — field-by-field diff against current: `headline`: old (strikethrough red-tint) "Charming family home" → new (emerald-tint) "Sun-filled Davisville detached on a 33 × 122 ft lot"; body copy block with inline diff highlighting; every factual sentence carries a CitationRef `[dossier §profile]` popover ("Lot dimensions — municipal record, retrieved Jun 8").
3. **Destination binding card:** exact destinations listed (mono): `mls-mock:listing/HLD-2041/remarks`, `portal:property/48-wrenwood`, recipient counts, payload hash `sha256:9f2c…b7` mono — with copy button.
4. **PolicyGatePanel:** 14-row commit-time checklist, live statuses: Tenant ✓ · Actor: Maya Chen ✓ · Role: registrant ✗ *"Publishing listing remarks requires broker-of-record counter-signature"* · Jurisdiction ON ✓ · Brokerage policy v2.3 ✓ · Consent n/a · Payload↔destination binding ✓ · Data freshness ✓ (2 h) · Approval freshness ✓ · Idempotency key ✓ `idem_8f3…` … Rows with issues expanded with the rule source (mono policy ID `ON-ADV-014`, tooltip: rule name + version).
5. **A4 counter-signature callout** (red-orange border): "A4 — Human-only commit. Requires Daniel Okafor (Broker of Record). Request countersign" button (or, when signed in as Daniel: enabled Approve).
6. **Decision bar (sticky bottom of detail):** "Approve exact payload" (primary, disabled if gate fails — BlockedAction with reason popover) · "Approve with edits" (creates new payload version v2, re-hashes, resets freshness) · "Reject with reason" (destructive-outline; reason required, chip-select: Factual concern / Brand / Compliance / Other + note) · snooze.
7. **History strip:** previous versions (v1 rejected by Daniel — reason "Overstated renovation claims — removed 'stunning'", v2 current) as small cards; each links to audit events.

**Campaign item variant:** payload shows audience definition (size 412 contacts, all express-consent Verified), content family, budget cap $1,500, frequency cap 2/week, schedule window, suppression list hash, autonomy A3 badge — gates emphasized: budget/frequency checks with mono values.

**SMS item variant:** message text EN + fr-CA preview, CASL classification chip "CEM — express consent", sender ID line, unsubscribe line present ✓, quiet-hours check ✓.

## Animation

- **Mount:** list rows stagger 35ms; detail sections stagger 50ms (`y: 10→0`).
- **Item switch:** detail cross-fades 180ms, DiffView lines highlight sweep (background tint animates across rows 400ms stagger 30ms).
- **Approve flow:** button → inline confirmation morph (payload hash re-displayed for 800ms "final check" step) → success: card collapses left-list row with checkmark flip (BadgeCheck, 300ms), toast "Approved & queued — audit event `evt_7c2…`" with View link.
- **Reject:** reason panel expands height-animated; submit → row exits with 200ms fade, StatusPill flips to Rejected red-orange.
- **Gate rows:** status icons draw in (stroke-dash animation 300ms) when detail opens.

## Interactions

- Approve is impossible without all hard gates passing; hovering disabled Approve shows BlockedAction popover listing exactly which checks failed and who can resolve them.
- "Approve with edits" opens inline editor; saving regenerates the hash live (hash visibly recomputes, mono field flickers then settles).
- Every policy rule row links to `/audit` (decision log) and `/compliance` (rule detail).
- Keyboard: `j/k` move selection, `a` approve (if allowed), `r` reject.

## States

Empty: `empty-inbox.svg` + "Nothing waiting — the queue is clear." Expired approval: amber banner "Approval expired — payload must be re-reviewed" (fresh re-check enforced). Role variant: as Maya the A4 item shows "Request countersign"; as Daniel it's actionable — perfect demo switch.

## Assets

`empty-inbox.svg`, `avatar-daniel.png` (countersign card). No imagery otherwise — density is the design.
