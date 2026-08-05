# Northstar SellerOS — Global Design Document

**Product type:** Production-grade, multi-tenant SaaS web **application** (not a marketing site). A calm, premium brokerage operations cockpit for licensed Canadian real-estate agents.
**Design thesis:** Trust is the product. Every surface is engineered for legibility — of evidence, uncertainty, autonomy, and policy. Ornament is rare; clarity is luxurious.
**Brand feel:** "Quiet authority under the north star." Linear/Stripe-grade restraint, adapted to a leading Canadian brokerage. Warm neutrals, deep north-star teal, ample whitespace, crisp hierarchy. No blue-purple gradients, no saturated full-bleed backgrounds, no flag clichés.

---

## 1. Tech Stack & Dependencies

- Node.js 20 · Vite 7 · React 19 + TypeScript · Tailwind CSS v3.4 · shadcn/ui
- **Framer Motion** — page transitions, drawers, list staggers, hover/tap micro-interactions, kanban drag
- **lucide-react** — all icons (no emoji)
- **@dnd-kit/core** — kanban drag-and-drop, checklist reorder
- **date-fns** — dates/times (EN + fr-CA locales)
- **Google Fonts** — Inter (UI sans), Source Serif 4 (display numerals / portal & dossier headlines)
- No Three.js/GSAP scroll storytelling in the app shell — restraint is the brand. Motion is functional, fast (120–320ms), and respects `prefers-reduced-motion`.

## 2. Color System

Warm-neutral paper base, white surfaces, deep forest-teal ink + accent. All colors are low-saturation; the only saturated moments are semantic (evidence/risk states).

### Core palette (Tailwind tokens)

| Token | Hex | Usage |
|---|---|---|
| `paper` | `#FAF8F4` | App background behind sidebar content |
| `surface` | `#FFFFFF` | Cards, panels, tables, drawers |
| `surface-2` | `#F4F1EA` | Inset wells, kanban columns, code/hash blocks |
| `ink` | `#1D1B17` | Primary text |
| `ink-2` | `#5B564C` | Secondary text |
| `ink-3` | `#8D877A` | Tertiary/meta text, placeholders |
| `line` | `#E7E2D6` | Borders, dividers |
| `line-strong` | `#D5CFC0` | Emphasized borders |
| `pine` | `#12312C` | Sidebar background, top-level brand ink |
| `pine-2` | `#1A423B` | Sidebar hover/active rail |
| `accent` | `#0E5A50` | Primary actions, links, active states (north-star teal) |
| `accent-hover` | `#0B4A42` | Hover on primary actions |
| `accent-tint` | `#E3EFEB` | Accent backgrounds/selected rows |
| `maple` | `#A8503B` | Warm clay accent — **seller portal & marketing warmth only**, never app chrome |

### Evidence & state palette (the signature system)

| State | Token | Hex | Treatment |
|---|---|---|---|
| Verified fact | `ev-verified` | `#1E7A4F` | Solid emerald-tint chip, `CheckCircle2` icon, emerald left border on blocks |
| Third-party data | `ev-external` | `#54677A` | Slate-tint chip, `Database` icon, slate left border |
| Estimate | `ev-estimate` | `#9A6A1B` | Amber-tint chip, `Sigma` icon, amber left border |
| Generated content | `ev-generated` | `#6E6A86` | Violet-grey chip, `Sparkles` icon, violet-grey left border |
| Assumption | `ev-assumption` | `#5B564C` | **Dashed-outline** chip, `HelpCircle` icon, dashed left border |
| Missing info | `ev-missing` | `#9B9587` | Muted chip "Missing", `CircleDashed` icon; the field itself renders as a dashed empty slot with a "Provide" affordance |
| Conflicting evidence | `ev-conflict` | `#C2492B` | Red-orange chip, `GitCompareArrows` icon; conflicting values shown side-by-side |
| AI recommendation | `ev-ai` | `#0E5A50` | Accent-tint chip with `Compass` icon, always expandable to rationale |
| Approved action | `ev-approved` | `#1E7A4F` | Emerald outline chip, `BadgeCheck` icon |
| Blocked action | `ev-blocked` | `#75706A` | Grey chip, `Lock` icon, **always** shows reason in tooltip/popover (fail-closed is explainable) |

Chip style: `h-5 px-1.5 rounded-md text-[11px] font-medium gap-1`, tint background at 10–12% alpha, 1px colored border at 30% alpha. Icon 12px. Never rely on color alone — every state has icon + label (WCAG).

### Autonomy-level palette (A0–A4)

| Level | Label | Chip color | Meaning |
|---|---|---|---|
| A0 | Observe | slate `#54677A` | Read, classify, summarize, recommend |
| A1 | Draft | `#6E6A86` | Creates drafts for review |
| A2 | Reversible execution | `#9A6A1B` | Sends approved templates to consented contacts; reversible |
| A3 | Bounded campaign | `#0E5A50` | Operates within approved budgets/caps/schedules |
| A4 | Human-only commit | `#C2492B` | Licensed acts; AI may never execute |

Autonomy badge: monospace `A2` + label, 1px border, info tooltip with full explanation. The current tenant autonomy ceiling appears in the top bar at all times.

## 3. Typography

- **UI sans:** `Inter` — all application text. Numeric data uses tabular figures: `font-feature-settings: "tnum"`.
- **Display serif:** `Source Serif 4` — dossier/portal headlines, valuation figures, portal marketing moments. Never used for controls or dense tables.

| Token | Spec | Usage |
|---|---|---|
| `display` | Source Serif 4, 34/40, 500, -0.01em | Valuation headline, portal H1, dossier title block |
| `h1` | Inter, 22/28, 600, -0.01em | Page titles |
| `h2` | Inter, 16/22, 600 | Section titles |
| `h3` | Inter, 14/20, 600 | Card titles |
| `body` | Inter, 14/20, 400 | Default |
| `body-sm` | Inter, 13/18, 400 | Dense content, table cells |
| `meta` | Inter, 12/16, 500 | Chips, timestamps, table headers (uppercase 11px, tracking 0.04em, ink-3) |
| `mono` | ui-monospace/SFMono, 12.5px | Hashes, policy IDs, idempotency keys, model/prompt versions |
| `figure` | Source Serif 4, 28/34, 600, tnum | KPI numerals |

French expansion: all labels survive +20–25% length. Buttons wrap or use `min-w-0 truncate`; nav labels have 2-line allowance in French; never fixed-width text containers below 96px.

## 4. Spacing, Layout & Chrome

- Spacing scale: 4px base — 4, 8, 12, 16, 20, 24, 32, 48.
- App shell: **left sidebar 248px** (collapsible to 64px icon rail), **top bar 56px**, content max-width none (fluid, inner padding 24px, dense pages 16px).
- Cards: `rounded-xl border border-line bg-surface shadow-[0_1px_2px_rgba(29,27,23,0.04)]`. No heavy drop shadows anywhere.
- Radius: chips 6px, buttons 8px, cards 12px, drawers/modals 16px.
- Focus: 2px `accent` ring with 2px offset, always visible (keyboard-first product).

### Sidebar (pine)

Deep `#12312C` rail. Top: north-star logo mark + "Northstar SellerOS" wordmark (Inter 14px 600, warm white) + tenant shortcode chip. Nav groups:

- **Operate:** Command Centre `/`, Pipeline `/pipeline`, Conversations `/conversations`, Calendar `/calendar`
- **Sell:** Sellers (list) `/sellers`, Approvals `/approvals` (count badge), Campaigns `/campaigns`, Offers `/offers`, Transactions `/transactions`
- **Govern:** Compliance `/compliance`, Audit `/audit`, Settings `/settings`
- Footer: autonomy ceiling badge (A0–A4), integration status dot (truthful: "Mock providers" amber dot / "Connected" emerald), user card (name, role, avatar), collapse toggle.

Active item: `pine-2` background, 3px `accent` left bar, warm-white text. Inactive: 65% warm white, hover 85%.

### Top bar (white, 56px, bottom border)

Breadcrumb/page context (left) · environment chip "Demo data — Ontario seed" (amber-tint, truthful) · global search `⌘K` · language toggle `EN | FR` (segmented, persists) · autonomy selector (shows current ceiling, `ShieldCheck` icon, opens explainer popover) · notifications bell (badge) · tenant switcher (brokerage name + crest dot) · user menu.

### Command palette (⌘K)

Center modal 560px, searches sellers, properties, approvals, conversations, audit events; grouped results with keyboard nav; actions section ("New seller lead", "Upload offer", "Book consultation").

## 5. Shared Components (the design system's core)

1. **EvidenceChip** — 10 variants per §2. Compact and inline; `tabular` labels; French labels included (`Vérifié`, `Tiers`, `Estimation`, `Généré`, `Hypothèse`, `Manquant`, `Conflit`, `Recommandation IA`, `Approuvé`, `Bloqué`).
2. **EvidenceLegend** — popover from any "Evidence" button; lists all 10 states with icons + one-line meaning. Also lives in Settings → Design language.
3. **EvidenceDrawer ("Why this?")** — right drawer 420px opened from any material statement. Contains: statement, evidence type chip, source name + link, retrieved-at timestamp + **FreshnessIndicator**, confidence bar (0–100%), lineage chain (agent → tool → source → policy decision, each a mono-ID link into Audit Explorer), assumptions list, unresolved conflicts, related policy rules.
4. **FreshnessIndicator** — `Updated 2h ago` with colored dot: emerald <24h, amber 1–7d, red-orange >7d or stale. Hover shows exact timestamp + sync cursor ID.
5. **AutonomyBadge** — A0–A4 chip; tooltip explains level; when an action exceeds the ceiling it renders **Blocked** with the exact missing authority.
6. **PolicyGatePanel** — the commit-time checklist (tenant, actor, role, jurisdiction, brokerage policy, consent, suppression, purpose, approval freshness, data freshness, payload↔destination binding, budget/frequency, idempotency key, audit fields). Each row: `Check`/`X`/`Minus` icon + label + mono detail. Used in Approvals, Campaigns, Conversations, Offers.
7. **ConfidenceBar** — 4px rounded bar, amber for estimates, with % label; tooltip: basis ("7 comparables, 2 excluded — see reasoning").
8. **Banner** — page-level strip: `info` (accent-tint), `warning` (amber), `escalation` (red-orange, `ShieldAlert`, for human-only topics), `truthful` (neutral grey, mock-integration notices).
9. **StatusPill** — pipeline/transaction/task statuses; dot + label; consistent across kanban, tables, timelines.
10. **DiffView** — payload-bound approval diffs: field name, old value (strikethrough, red-tint), new value (emerald-tint), mono values.
11. **CitationRef** — superscript-like inline token `[p.4 §2]` that opens a mini-popover with the quoted source text and document thumbnail link.
12. **KanbanColumn/Card** — pipeline board primitives; cards carry evidence chips, lead score, task count, avatar.
13. **TimelineItem** — vertical timeline node: icon, actor chip (human/agent/system), timestamp, evidence chip, expandable detail.
14. **DataTable** — dense, sortable, row hover, sticky header, row actions in `…` menu; empty/loading/error states designed (below).
15. **MissingSlot** — dashed-border inline field: "Not yet provided — Request from seller" button.
16. **BlockedAction** — disabled button + lock icon + reason popover ("Requires A4 — broker of record approval", "CASL consent expired 2025-11-02").
17. **AgentRunCard** — shows an agent execution: agent name, model/prompt versions (mono), duration, token/cost, confidence, evidence count, link to audit event.

**States everywhere:** `loading` (skeletons in final layout, no spinners alone), `empty` (illustrated EmptyState with next action), `error` (plain-language + retry), `blocked` (reason always visible), `stale` (freshness warning).

## 6. Motion Design

Functional, quick, springy-but-tight. `prefers-reduced-motion` collapses everything to opacity-only 120ms fades.

- **Page transition:** content fades 0→1 and rises 8px, 200ms `ease-out`, on route change. Sidebar/topbar persist (layout animation only for nav indicator, 240ms spring).
- **List/card entrances:** stagger 40ms per item, `y: 12px → 0`, `opacity 0→1`, 240ms, trigger on mount (not scroll — this is an app).
- **Drawers/modals:** spring `stiffness 380, damping 34`; drawer slides 420px from right with scrim fade 180ms.
- **Hover:** cards lift `y:-1px` + border darkens to `line-strong`, 140ms; buttons darken + scale 0.99 on `:active`.
- **Chips:** appear with `scale 0.9→1, opacity 0→1, 160ms`.
- **Kanban drag:** lift scale 1.02 + shadow-md while dragging; drop animates 200ms; moving a card across a policy boundary triggers the policy-check popover.
- **Confidence bars:** width animates 0→value over 500ms on mount.
- **Toasts:** slide up 16px + fade, 220ms; undo actions where reversible (A2).
- **Micro-moment:** the north-star logo's star twinkles (opacity pulse, 1.6s) only on sign-in and portal — never in dense app screens.

## 7. Bilingual (EN / fr-CA)

- Full parity: every string externalized; toggle in top bar; persisted per user; dates/numbers/currency localized (`1 249 000 $` in fr-CA with non-breaking space, `$1,249,000` EN).
- fr-CA terminology: `registrant → agent immobilier`, `brokerage → maison de courtage`, `broker of record → courtier responsable`, `listing → inscription`, `showing → visite`, `offer → offre d'achat`, `approval → approbation`.
- French strings get +20% layout allowance; table headers may wrap to 2 lines; never truncate French legal/compliance text.

## 8. Accessibility (WCAG 2.1 AA minded)

- Contrast ≥4.5:1 for text (all pairs above verified against paper/surface); chips carry icon+text, not color alone.
- Full keyboard operation: kanban drag has keyboard alternative (move via menu), ⌘K palette, visible focus rings, skip-to-content link.
- `aria-live` for agent-run completions and toasts; drawers trap focus; tables use proper `th` scope.

## 9. Content Realism (seed universe)

One demo tenant: **Harbourline Realty Inc., Brokerage** (Toronto). Recurring cast used across all screens:

- **Maya Chen** — Sales Representative (registrant), primary agent user
- **Daniel Okafor** — Broker of Record
- **Sofia Tremblay** — Transaction Coordinator (bilingual)
- **Amir Haddad** — FINTRAC Compliance Officer
- Sellers: **Nadia & Marc Pelletier** — 48 Wrenwood Ave, Toronto (Davisville), detached, motivation: downsizing after kids left, timing 60–90 days
- **Gurpreet Sandhu** — 212 Millstone Dr, Mississauga (streetsville-adjacent townhouse)
- **Eleanor Vance** — 9 Argyle Cres, Ottawa (Glebe), estate sale
- Buyer lead: **Jonah Whitfield** — high-intent, pre-approved $1.1M, viewing Wrenwood
- Prices in CAD, realistic Ontario ranges ($725K–$2.4M); dates around the demo "today".

Terminology follows TRESA/RECO: registrant, brokerage, broker of record, representation, self-represented party, CASL consent, FINTRAC.

## 10. Page List

| # | File | Route | Purpose |
|---|---|---|---|
| 1 | `sign-in.md` | `/login` | Role-based seeded sign-in, brand moment, truthful demo notice |
| 2 | `command-centre.md` | `/` | Daily cockpit: pipeline snapshot, tasks, approvals, high-intent leads, compliance alerts, AI next actions |
| 3 | `pipeline.md` | `/pipeline` | 10-stage seller kanban with policy-gated moves |
| 4 | `seller-360.md` | `/sellers/:id` | Seller profile: consent evidence, motivation, score explanation, briefing, timeline |
| 5 | `property-dossier.md` | `/properties/:id` | Grounded dossier: comps, valuation range + confidence, assumptions, conflicts, evidence |
| 6 | `approvals.md` | `/approvals` | Payload-bound approval inbox with diffs + policy gate |
| 7 | `listing-launch.md` | `/listings/:id/launch` | Launch workspace: checklists, media QA, copy variants, disclosures, readiness |
| 8 | `conversations.md` | `/conversations` | Omnichannel console, AI drafts with citations, escalation banners, human transfer |
| 9 | `campaigns.md` | `/campaigns` | Bounded campaigns: audiences, budgets, caps, schedules, suppression, A3 indicator |
| 10 | `calendar.md` | `/calendar` | Showings/open houses/consultations; restricted-access exclusion notice |
| 11 | `offer-room.md` | `/offers` | Offer upload, extracted term grid with page citations, licensed-agent questions |
| 12 | `transaction-timeline.md` | `/transactions/:id` | Conditions, deadlines, documents, owners, exceptions, durable-workflow indicator |
| 13 | `compliance.md` | `/compliance` | CASL/DNCL states, FINTRAC restricted queue, policy log, retention, breach status |
| 14 | `audit-explorer.md` | `/audit` | Tamper-evident event log with hashes, policy decisions, model/prompt versions |
| 15 | `settings.md` | `/settings` | Jurisdiction, language, autonomy A0–A4, model routing, truthful integration status |
| 16 | `seller-portal.md` | `/portal` | Seller-facing branded view: warm, plain-language, reassuring |

## 11. Asset Manifest

Implementation team generates these; everything else is icon/type/gradient-driven.

| Filename | Description | Location | Dimensions | Type |
|---|---|---|---|---|
| `logo.svg` | Minimal north-star mark: a four-point star whose top point extends slightly longer, drawn in 2px strokes, deep pine `#12312C` with a small accent `#0E5A50` dot at center. Geometric, flat, no gradients. | Sidebar, top bar (portal), sign-in, favicon | 64×64 viewBox | SVG |
| `login-hero.png` | Quiet aerial photograph at dusk of a Toronto residential street tree canopy with warm porch lights, very low saturation, deep teal-green toning, soft vignette; feels calm and premium, not stocky. | Sign-in left panel | 1600×2000 4:5 | Image |
| `property-wrenwood-exterior.jpg` | Red-brick detached two-storey house in Toronto Davisville Village, late-afternoon soft light, manicured small front garden, overcast-warm sky, realistic real-estate photography, no people. | Property dossier, pipeline card, portal, launch board | 1920×1280 3:2 | Image |
| `property-wrenwood-living.jpg` | Bright staged living room of a Toronto detached home, oak floors, neutral furniture, large windows, realistic listing photography. | Launch board shot list, portal | 1600×1067 3:2 | Image |
| `property-wrenwood-kitchen.jpg` | Renovated kitchen, white oak cabinetry, stone counters, island, realistic listing photography, soft daylight. | Launch board shot list / media QA | 1600×1067 3:2 | Image |
| `property-wrenwood-staged.jpg` | Same living room virtually staged with different furniture — subtle, tasteful; used next to the original to demonstrate virtual-staging disclosure. | Launch board media QA (disclosure pair) | 1600×1067 3:2 | Image |
| `property-millstone.jpg` | Modern freehold townhouse exterior, Mississauga, brick + dark siding, small driveway, overcast daylight, realistic. | Pipeline card, seller 360 (Sandhu) | 1600×1067 3:2 | Image |
| `property-argyle.jpg` | Red-brick century home in Ottawa's Glebe, mature maple tree, autumn leaves on lawn, soft morning light. | Pipeline card (Vance estate sale) | 1600×1067 3:2 | Image |
| `comp-map.png` | Stylized static map of a Toronto midtown neighbourhood (Davisville), muted warm-grey streets, three teal comparable pins + one accent subject pin, no third-party branding, flat cartographic style. | Property dossier comparables | 1600×1000 16:10 | Image |
| `avatar-maya.png` | Professional headshot illustration style (soft, editorial, low-saturation) of an East-Asian woman in her 30s, business casual, neutral warm background. | Sidebar user, timeline actors | 256×256 1:1 | Image |
| `avatar-daniel.png` | Same style: Black man, 40s, suit no tie, calm expression, warm neutral background. | Approvals (broker of record), timelines | 256×256 1:1 | Image |
| `avatar-sofia.png` | Same style: Québécoise woman, 30s, shoulder-length hair, warm smile, neutral background. | Transaction timeline, calendar | 256×256 1:1 | Image |
| `avatar-amir.png` | Same style: Middle-Eastern man, 40s, glasses, neutral background. | Compliance dashboard | 256×256 1:1 | Image |
| `avatar-pelletier.png` | Same style: couple in their late 50s, friendly, neutral background (single combined avatar). | Seller 360, portal greeting | 256×256 1:1 | Image |
| `avatar-jonah.png` | Same style: man in early 30s, casual blazer, neutral background. | Conversations, high-intent lead card | 256×256 1:1 | Image |
| `empty-inbox.svg` | Minimal line illustration: an open document tray with a single four-point star above it, 2px strokes, `line` color with one accent-teal star. | Approvals/audit empty states | 320×240 | SVG |
| `portal-hero-texture.png` | Abstract warm texture: layered soft paper grain with a faint constellation of thin connected lines forming a north star, warm cream + pale teal, extremely subtle. | Seller portal header background | 1920×640 3:1 | Image |

**No video assets.** The app is information-dense; motion comes from the motion system, not media.
