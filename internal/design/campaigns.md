# Campaign Studio — `/campaigns`

**Purpose:** Bounded, policy-wrapped campaigns. The studio makes A3 "bounded campaign" concrete: audiences, content families, budgets, frequency caps, schedules, suppression — all visible, all enforced.

## Layout

- **Page header:** h1 "Campaigns" + autonomy notice chip "Ceiling: A3 — bounded campaigns" + CTA "New campaign".
- **Campaign list cards (grid, 2-col):** each card: name, StatusPill (Draft / Active emerald / Paused / Completed), channel chips, budget bar (spent/cap, amber fill), audience size, schedule window, AutonomyBadge A3.

**Seeded campaigns:**
1. **"Spring seller seminar — follow-up"** — Active · Email · audience 412 (all express consent) · budget $486 / $1,500 cap · frequency 2/wk · schedule Jun 2–30.
2. **"Davisville listing announcement"** — Approved, scheduled Jun 13 · Email + Social · audience 1,180 · budget $220 / $800.
3. **"Investor list nurture"** — **Paused by policy** (red-orange): "12 contacts moved to suppression — review required".

### Campaign detail (drawer over list, 720px right drawer)

**"Spring seller seminar — follow-up"** open by default:
1. **Bounds summary card** (the signature element): a bordered "operating envelope" — Audience: 412 contacts, express CASL consent only (Verified chip) · Content family: `seminar-followup@v3` (mono) · Budget cap $1,500 · Frequency cap 2/week/contact · Schedule Jun 2–30, quiet hours 9 am–8 pm ET · Channels: Email · Suppression list: `supp_2025-06@hash 3fa1…` locked. Header: "The agent operates only inside this envelope — anything outside fails closed."
2. **Performance strip:** sent 812 · delivered 801 · opened 47% · replied 6 · unsubscribed 3 (auto-suppressed, Verified chip) — KPI tiles with tabular figures and tiny trend bars.
3. **Content variants:** accordion of email variants EN/fr with Generated chips, approval StatusPills, preview modal (rendered email: header with brokerage ID + unsubscribe line highlighted as compliance-mandated, locked).
4. **Audience panel:** definition chips ("Attended seminar May 30", "Express consent valid", "Not on DNCL/suppression") + count waterfall (1,204 → 412 after filters, each filter a row with counts).
5. **Policy & audit card:** PolicyGatePanel summary (last send batch: 14/14 ✓), last 5 send events with mono idempotency keys, link to `/audit`.
6. **Controls:** Pause (reversible, A2), Edit bounds (requires re-approval → routes to `/approvals`, StatusPill flips "Bounds change pending"), End campaign.

**Paused-by-policy campaign detail:** banner explains the exact rule ("Suppression change mid-flight requires human review — CASL-SUP-002") with Review CTA; resume is BlockedAction until reviewed.

### New campaign flow (modal wizard, 4 steps, 640px)

Step indicator top: 1 Audience → 2 Content family → 3 Bounds (budget/frequency/schedule/channels) → 4 Review & request approval. Each step: shadcn form controls, live "envelope preview" card on the right that fills as you configure; final step shows the full payload + hash + PolicyGatePanel preview + "Request approval (A3/A4 as required)".

## Animation

- **Mount:** campaign cards stagger 50ms (`y:12→0`); budget bars fill 600ms.
- **Drawer:** spring from right; envelope card fields cascade 25ms.
- **Waterfall:** bars animate width sequentially (400ms each, eased) when panel opens.
- **Pause:** StatusPill color transition 200ms, card desaturates (opacity 0.85) with toast + Undo (10s window, A2 reversible).
- **Wizard:** step transitions slide x 24px + fade 200ms; envelope preview values tick-update with number-flip animation.
- **Frequency cap meter:** on hover of any contact count, shows cap math tooltip popover 160ms.

## Interactions

- Any bounds edit → invalidates approval (stale state) and requires fresh payload-bound approval; hash visibly recomputed.
- Unsubscribe events auto-append to suppression (shown as immutable Verified rows; manual removal is Blocked — "Suppression entries are system-managed under CASL").
- Truthful channel status: email provider chip "Mock provider — no real email leaves this environment" (Banner `truthful` in detail drawer).
- French toggle flips all content previews (fr-CA variants shown side-by-side in preview modal).

## States

Draft (envelope incomplete → "Request approval" BlockedAction listing missing bounds); Active; Paused-by-user; Paused-by-policy (red-orange); Completed (read-only, audit links); Empty list state with "New campaign" CTA card.

## Assets

None beyond icons (`Megaphone`, `Mail`, `Wallet`, `Gauge`, `CalendarRange`, `ShieldCheck`). Density-driven screen.
