# Northstar SellerOS — Product Research Brief (for design)

## What it is
Northstar SellerOS is a production-grade, bilingual (English / Canadian French), Canada-native autonomous real-estate operating system. It helps licensed Canadian real-estate agents and brokerages win and service residential seller listings, convert buyer inquiries, and coordinate transactions. It is a **multi-tenant SaaS web application** — a working product, not a marketing site. Think "calm premium brokerage operations cockpit": Linear/Stripe-grade restraint and clarity, adapted to a leading Canadian brokerage brand.

## Brand feel
- Name: Northstar SellerOS. North-star motif (guidance, trust, navigation) used sparingly.
- Premium, calm, accessible (WCAG-minded). Low-saturation palette, warm neutrals, ample whitespace, clear hierarchy. No blue-purple gradients, no saturated backgrounds.
- One restrained accent (deep north-star teal/forest) + warm neutral base. Maple-adjacent warmth is welcome but NO flag clichés.
- Typography: crisp modern sans for UI; optional serif for display numerals/headlines in dossier/seller-portal contexts.

## Critical UX signature: evidence & uncertainty visual language
The product's core differentiator is trust. Every data surface must visually distinguish, via a consistent chip/badge/left-border system:
- Verified fact (solid emerald) · Third-party data (slate) · Estimate (amber) · Generated content (violet-grey) · Assumption (dashed outline) · Missing information (muted "missing" chip) · Conflicting evidence (red-orange) · AI recommendation (accent) · Approved action (emerald check) · Blocked action (locked/grey with reason).
Design this legend as a reusable component and show it in a "Why this?" evidence drawer pattern: any material statement can expand to show source, freshness, confidence, and lineage.

## Screens to design (app screens, left sidebar nav, top bar with tenant/language/autonomy controls)
1. **Agent Command Centre** (home `/`) — daily cockpit: pipeline snapshot, tasks, approvals waiting, high-intent leads, compliance alerts, AI-recommended next actions.
2. **Seller Pipeline** (`/pipeline`) — kanban: New lead → Qualified → Consultation booked → Dossier ready → Strategy proposed → Approved → Live listing → Offer review → Under contract → Closed.
3. **Seller 360 Profile** (`/sellers/:id`) — contact, consent evidence per channel, motivation/timing, timeline, lead score with explanation, recommended next action, agent briefing.
4. **Property Dossier** (`/properties/:id`) — normalized profile, timeline, neighbourhood/market context, comparable set with selection reasoning, valuation range + confidence interval, assumptions, missing info, contradictions, evidence links. Labeled clearly as decision support, NOT an appraisal.
5. **Approval Inbox** (`/approvals`) — payload-bound approvals: each item shows exact payload diff, destination, policy checks passed, freshness, approve/reject with reason.
6. **Listing Launch Board** (`/listings/:id/launch`) — prep checklist, shot list, media QA, listing copy, feature sheet, social/email/ad variants, virtual-staging disclosure, open-house plan, campaign calendar, launch-readiness checklist.
7. **Conversation Console** (`/conversations`) — omnichannel inbox; AI draft responses with grounding citations; clear "AI assistant" disclosure; instant "transfer to human"; escalation banners (negotiation, legal, agency questions → human-only).
8. **Campaign Studio** (`/campaigns`) — bounded campaigns: audiences, content families, budgets, frequency caps, schedules, suppression lists; autonomy-level indicator.
9. **Showing Calendar** (`/calendar`) — showings, open houses, consultation bookings; restricted access instructions NEVER shown (lockbox etc. are explicitly excluded with a notice).
10. **Offer Comparison Room** (`/offers`) — upload offers (PDF/image), extracted term grid side-by-side (price, deposit, dates, irrevocability, conditions, inclusions...), every cell cites source page/section, "questions for your licensed agent" panel. Banner: never submit/accept/reject/counter without exact human authorization.
11. **Transaction Timeline** (`/transactions/:id`) — conditions, deadline calendar, document checklist, responsible owners, exception alerts, lawyer handoff tasks, closing checklist; workflow status "survives restarts" indicator.
12. **Compliance Dashboard** (`/compliance`) — CASL consent states, DNCL flags, FINTRAC queue (restricted), policy decisions log, retention jobs, breach-response status.
13. **Audit Explorer** (`/audit`) — tamper-evident event log: actor, action, payload hash, policy decision, model/prompt versions; filters.
14. **Settings** (`/settings`) — jurisdiction, brokerage policy, language (EN/fr-CA), model routing (Canada-hosted toggle), autonomy levels A0–A4 with explanations, integration status (truthful: connected vs mock).
15. **Seller Portal** (`/portal`) — seller-facing branded view: property summary, market evidence, positioning options, prep plan, timeline, communication plan. Warm, reassuring, plain language.

## Users (design should feel right for all)
Solo registrant, team, brokerage admin, broker of record, marketing coordinator, transaction coordinator, privacy admin, FINTRAC compliance officer, seller, buyer lead.

## Autonomy levels (must be legible in UI)
A0 Observe · A1 Draft · A2 Reversible execution · A3 Bounded campaign · A4 Human-only commit. Actions show their required level; blocked actions show why (fail-closed).

## Bilingual
Full EN + fr-CA. Language toggle in top bar. Design must accommodate French string expansion (~20% longer).

## Content realism
Use realistic Canadian data: Ontario cities (Toronto, Ottawa, Mississauga, Hamilton), realistic names, prices in CAD, Canadian address formats, RECO/TRESA-consistent terminology (registrant, brokerage, broker of record), CASL consent language, FINTRAC terminology.
