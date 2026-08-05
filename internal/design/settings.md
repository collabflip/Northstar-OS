# Settings — `/settings`

**Purpose:** Tenant control plane: jurisdiction, brokerage policy, language, model routing, autonomy ceiling, and **truthful integration status**. Where the product proves it never pretends a mock is live.

## Layout

- **Page header:** h1 "Settings" · tenant chip "Harbourline Realty Inc., Brokerage · tenant `hrl_01`".
- **Left settings nav (220px, sticky):** Jurisdiction & policy · Brokerage profile · Language · Autonomy · Model routing & privacy · Integrations · Team & roles · Notifications · Design language (evidence legend).
- **Right content column (max 760px):** one section open at a time (deep-linkable anchors).

### § Jurisdiction & policy (default)

- Province select card: **Ontario — production pack v2.3.1** (emerald "Active") with meta: 84 rules · last reviewed 2025-05-15 · owner: A. Haddad. Disabled cards for BC / Alberta / Quebec: "Interface + fixtures ready — pack not licensed for this tenant" (truthful grey, BlockedAction).
- **Rule browser table:** rule ID (mono) · name · source (RECO/TRESA, CASL, PIPEDA, FINTRAC) · effective/review dates · owner · version · status. Rows expandable: implementation control description, test scenarios count (e.g. "7 policy tests ✓"), escalation path. Filter by source.

### § Brokerage profile

Name, RECO registration # (mono), address, brand color dot (pine), logo slot, broker of record (Daniel, avatar), team identification text used in advertising (preview chip in EN/fr), mandatory-forms checklist (OREA-mock forms with status).

### § Language

- Org default: English / **Français (Canada)** segmented control; per-user override note.
- **Live preview card:** the same UI sentence rendered EN + fr-CA side-by-side ("This dossier is decision support, not an appraisal." / « Ce dossier est un outil d'aide à la décision, et non une évaluation. ») demonstrating +20% expansion fit; parity chip "Bilingual parity: 100% of strings externalized · 0 missing keys".

### § Autonomy (signature section)

- **Current ceiling selector:** five stacked level cards (radio), each: AutonomyBadge + name + 2-line plain description + examples of allowed actions + required approver. A0 Observe · A1 Draft · **A2 Reversible execution (current)** · A3 Bounded campaign · A4 Human-only commit (A4 is not selectable as a ceiling — it's a category, explained in meta text: "A4 acts always require humans; setting a ceiling never enables them").
- Change control: switching ceiling shows summary of affected pending actions (e.g. "1 campaign would pause") + requires broker-of-record confirm (BlockedAction for Maya) → writes policy version + audit event.
- **Explainer panel:** "Fail-closed: when authority or evidence is missing, stale, or ambiguous, the action does not happen — and tells you why." with a mini PolicyGatePanel illustration.

### § Model routing & privacy

- **Canada-hosted inference toggle** (emerald ON): "Sensitive tasks route to Canada-hosted providers only" with routing table: task sensitivity → provider (mono endpoint IDs) · PII redaction ✓ · high-sensitivity tokenization ✓ · provider training on tenant data: **disabled** (locked ON, system-managed).
- Model registry mini-table: model/prompt versions in use (`k3-sellerbrief@1.4.2`, `k3-content@2.1.0`, `k3-policy@1.2.0`) with eval pass-rate chips (truthful: "golden suite 96/100 — report" link).
- Gateway guardrails list: prompt-injection scan ✓ · exfiltration scan ✓ · tool allowlist ✓ · token/cost caps shown (mono values).

### § Integrations (truthfulness showcase)

Table: Integration · Status chip · Detail · Action.
- Email/SMS provider — **Mock** amber — "No real messages leave this environment · contract-tested" · "Configure provider".
- Listing data (REALTOR.ca DDF) — **Not connected** grey — "Adapter + contract tests ready · requires board authorization" · "View onboarding checklist".
- Calendar sync — **Connected** emerald — "Maya's calendar · last sync 12 min ago".
- Document storage — **Connected (local S3-compatible)** — "Encrypted at rest".
- Voice — **Not configured** grey.
Rule (meta under table): "A mock is always labeled mock. Nothing here claims a live connection it doesn't have."

### § Team & roles

Members table (avatar, name, role, autonomy ceiling override, MFA status); invite flow; role descriptions drawer (10 roles from spec with permission summaries).

### § Notifications

Digest cadence, escalation routing (who gets FINTRAC/exception alerts), quiet hours.

### § Design language

The **EvidenceLegend** rendered in full: all 10 chips with descriptions + an interactive "Why this?" demo drawer + accessibility note (icon+label, never color alone). This documents the system in-product.

## Animation

- **Mount:** section content staggers cards 40ms; settings nav underline slides on change (layoutId).
- **Autonomy cards:** selecting animates border to accent + check draw-in; the affected-actions summary expands height-animated; confirm button enters with 160ms delay (deliberate friction).
- **Toggles:** thumb springs 200ms; Canada-hosted toggle shows a brief routing-table row shimmer as "re-routing" visual confirmation.
- **Rule rows:** expand with `AnimatePresence`; test-scenario chips pop 20ms stagger.
- **Integration status chips:** pulse once on mount only for the amber Mock chip (draws the eye to honesty).

## Interactions

- Every change: inline save states, optimistic where reversible (A2-style undo toast), audit-written (row appears in `/audit` — cross-link toast "Logged · view").
- Role gating: jurisdiction pack change, autonomy ceiling, FINTRAC settings → broker-of-record or authorized roles; others see read-only + lock.
- Language section updates UI language live on toggle (instant re-render of shell strings).

## States

Save success/error inline; disconnected-integration detail drawer with the onboarding checklist; fr-CA full parity across all settings labels.

## Assets

Avatars (`avatar-daniel.png`, `avatar-amir.png`, `avatar-sofia.png`, `avatar-maya.png`), `logo.svg` (brand slot). No generated imagery.
