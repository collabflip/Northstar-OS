# Audit Explorer — `/audit`

**Purpose:** Tamper-evident memory of the whole system. Every action — human, agent, or system — with payload hashes, policy decisions, and model/prompt versions. Dense, mono-forward, trustworthy.

## Layout

- **Page header:** h1 "Audit Explorer" · integrity chip: "Chain verified — `evt_9c41…` head · 12,842 events" (emerald, with recompute action) · CTA "Export (signed)".
- **Filter bar (sticky):** date range picker · actor type chips (Human / Agent / System) · actor select · action type select (approvals, sends, policy decisions, workflow, auth, data access) · rule ID input (mono) · free text · "Verify chain" ghost button. Active filters render as removable chips under the bar.

### Main: event table (full width, dense 13px)

Columns: Timestamp (mono tabular, ms) · Event ID (mono, truncated, copy-on-click) · Actor (avatar + name or agent chip with model/prompt version) · Action (body-sm 600) · Object (link: `listing/HLD-2041`, `contact/sandhu`) · Payload hash (mono `9f2c…b7` + verify icon) · Policy decision (Allowed emerald / Blocked red-orange pill + rule IDs) · Prev hash link (chain icon).

**Seeded rows (descending):**
1. `14:03:12.441` · System · "Worker restarted — workflow `txn_15bess` resumed from checkpoint #18" · policy n/a · chain ✓.
2. `14:02:58.102` · `compliance-sentinel` (k3-policy@1.2.0) · "FINTRAC receipt-of-funds record queued" · Allowed · rule `FINTRAC-ROF-001`.
3. `13:58:20.774` · Maya Chen · "Approved payload `pay_7c2…` — consultation follow-up SMS" · destination `sms:+19055550182` · hash ✓ · 14/14 checks.
4. `13:55:01.310` · `content-brand-agent` (k3-content@2.1.0) · "Generated listing copy v2 · 6 evidence citations" · policy A1 draft.
5. `13:41:44.908` · System · "Duplicate webhook ignored — `wh_deposit_conf` (idempotency `idem_41d…`)" · Verified chip.
6. `13:12:09.552` · Daniel Okafor · "Rejected listing copy v1 — reason: overstated claims" · red-orange.
7. `12:58:31.207` · `conversational-lead-agent` · "Escalated thread — negotiation detected (rule `ESC-NEG-001`)" · Blocked-to-human.

### Event detail drawer (right, 480px)

Click any row: full JSON-pretty payload (syntax-tinted, mono 12px, collapsible nodes), actor block (with agent version + prompt version + token/cost when agent), evidence references (links to dossier statements), policy evaluation dump (each check with rule version + evaluated values), hash chain segment (prev → this → next with verify buttons), "Recompute hash" action proving tamper-evidence live (shows ✓ match; a demo "tamper simulator" toggle flips one byte and recompute fails red-orange — the integrity proof made tangible).

### Integrity strip (bottom)

Horizontal hash-chain sparkline: blocks of 50 events as ticks; hovering shows segment head hash; a "Verify full chain" button runs progressive verification with a scanning animation and result chip "12,842/12,842 verified · 0 gaps · 0 forks".

## Animation

- **Mount:** filter bar fades; rows cascade 15ms (fast — dense screen); integrity chip's check draws in 300ms.
- **Filtering:** rows exit/enter with 120ms fade; count label number-flips.
- **Drawer:** spring from right; JSON sections stagger 30ms; hash chain segment animates link-by-link (3 × 200ms) with check draw-ins.
- **Chain verification:** progress sweep left→right 1.2s with tick highlights, result chip pops; tamper sim: affected block flashes red-orange, downstream links break visually (links turn dashed red-orange) — restored on reset.
- **Row hover:** mono hashes reveal copy icon; copied → checkmark swap 800ms.

## Interactions

- All filter combinations compose; URL-reflective (shareable filtered views).
- Every object link deep-links to its screen (seller, dossier, approval) — audit is the connective tissue.
- Export produces a signed manifest (shows mono signature field + "verification instructions" note).
- Role-aware: FINTRAC-queue events render as "restricted event — details withheld" rows for unauthorized roles (the row exists; content doesn't — truthful about existence, fail-closed on content).

## States

Empty filter result (`empty-inbox.svg` + "No events match — widen the filters"); verification in progress; verification failure state (red-orange banner, "do not rely on this log — contact security", runbook link).

## Assets

`empty-inbox.svg`; avatars for actor cells. Everything else type/mono/icon (`Fingerprint`, `Link2`, `ShieldCheck`, `FileJson`).
