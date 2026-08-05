# Compliance Dashboard — `/compliance`

**Purpose:** The govern-layer cockpit: CASL consent health, DNCL flags, FINTRAC restricted queue, policy decisions, retention jobs, breach readiness. Truthful, role-aware, and calm — compliance is normal operations here, not a scare screen.

## Layout

- **Page header:** h1 "Compliance" · jurisdiction chip "Ontario policy pack v2.3.1 · reviewed 2025-05-15" · meta "Software supports compliance workflows — it does not guarantee legal compliance" (truthful disclaimer, persistent meta line, not a scary banner).
- **Role gate:** FINTRAC sections render only for authorized roles (Amir / Daniel). Others see locked grey cards with "Restricted — FINTRAC compliance officer" and the access decision logged on view attempt (shown subtly: "Your view of this notice was logged").

### Row 1 — KPI strip (5 tiles)

CASL contacts with valid express/implied consent **1,847** (emerald) · Consents expiring ≤ 30 d **14** (amber) · DNCL flags **0** · FINTRAC queue **1** (restricted tile — lock for unauthorized) · Policy decisions (7 d) **3,204** (meta: 97.6% pass).

### Row 2 (7 + 5)

**Left — CASL consent health card:**
- Stacked bar by consent state: Express 1,420 · Implied 389 · Expired 26 · Suppressed 38 (colors: emerald / slate / amber / grey).
- **Expiring-soon table:** 14 rows — contact, channel, basis (implied: inquiry), expiry date (tabular), CTA "Request re-consent" (A1 draft → A2 send). Row: "Gurpreet Sandhu — SMS — implied — expires Jun 22".
- Suppression list summary: `supp_2025-06` · 38 entries · hash mono · "System-managed under CASL — manual removal disabled" lock row.

**Right — DNCL & voice card:**
- DNCL check status: "Last registry sync Jun 1 — mock provider" (truthful chip) · 0 flags · internal do-not-call list 3 entries.
- Voice policy tiles: calling hours 9:00–21:30 local ✓ · AI voice disclosure required ✓ · recording notice template `voice-notice@v1`.

### Row 2b — FINTRAC queue (restricted card, full width)

For Amir/Daniel only: queue table with columns: File · Trigger (Receipt of funds / Third-party determination / PEP-HIO review) · Status (Awaiting review / Escalated) · Age · Action ("Open file" → detail drawer). Seeded row: "15 Bessborough Dr — receipt-of-funds record — awaiting review — 2 d". Anti-tipping-off note (meta, ink-3): "Statuses in this queue are not visible to other roles; client-facing language is system-controlled." Beneath: meta "Beneficial-ownership and STR escalation workflows active · retention: 5 years".
For others: locked card with lock icon, one line, nothing more (fail-closed, minimal disclosure).

### Row 3 (6 + 6)

**Left — Policy decisions log card:** recent commit-time decisions table: Time · Actor · Action · Rule(s) (mono IDs `CASL-EXP-003`, `ON-ADV-014`) · Decision (Allowed emerald / Blocked red-orange with reason) · Audit link. Filter chips: Allowed / Blocked / by rule. Rows show blocked examples with exact reasons ("SMS send blocked — consent expired", "Campaign send blocked — frequency cap reached").

**Right — Privacy & retention card:**
- **Retention jobs list:** "Contact PII purge — nightly — last run 02:00 ✓ next 02:00" · "Media rights expiry check — daily ✓" · "Audit archive — monthly ✓" with StatusPills and durations.
- **Privacy requests:** 1 open — "Access request #PR-2025-004 — due Jul 4 (PIPEDA 30-day)" amber countdown; workflow steps mini-timeline (verified identity ✓ → export compiling → review → deliver).
- **Legal holds:** none active (calm state).
- **Breach response status card:** "No active incidents" emerald · last tabletop drill Mar 2025 · runbook link · notification-threshold meta.

## Animation

- **Mount:** tiles count up 500ms stagger 40ms; consent stacked bar segments animate width sequentially 600ms; tables cascade 25ms.
- **Restricted cards:** lock icons settle with a 200ms fade; no flashy treatment (deliberate sobriety).
- **Decision log:** new entries (demo) append at top with 240ms slide + fade; decision pills pop.
- **Hover:** table rows highlight; rule IDs show tooltip popovers (rule name, source, version, review date) 160ms.
- **Countdowns:** tabular tick, amber shift under 7 days.

## Interactions

- Re-consent requests batch-select → single A1 draft review → A2 send; each send appears in the decisions log immediately.
- Rule tooltips link to `/audit` filtered by rule ID; policy pack version chip opens Settings → jurisdiction section.
- Privacy request detail drawer shows the full export/correction/deletion workflow with owners and due dates.
- Everything truthful: mock-provider markers on DNCL sync and registry checks.

## States

Role-locked sections (primary variant in demo when signed in as Maya); all-clear state (all KPIs emerald, calm empty-ish tables); incident state variant (red-orange banner + active runbook checklist) for completeness.

## Assets

`avatar-amir.png`. Icons otherwise (`ShieldCheck`, `PhoneOff`, `Lock`, `Archive`, `FileClock`).
