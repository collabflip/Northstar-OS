# Conversation Console — `/conversations`

**Purpose:** Omnichannel inbox where AI drafts grounded replies, discloses itself, and knows when to stop. Human transfer is always one click away; risky topics escalate automatically.

## Layout

Three-pane (320px list / fluid thread / 360px context rail), classic console.

### Left: Inbox list

Filter tabs: All · Needs review (3) · Escalated (1) · Scheduled. Rows: avatar + name, channel chip (SMS / Email / Web chat / Voice), last message preview (1 line), intent chip (High-intent amber dot / Inquiry / Follow-up), unread dot, SLA timer chip ("2 h" ink-3).

Seeded threads:
1. **Jonah Whitfield** — Web chat · High-intent 88 · "Is the seller flexible on closing date?" · ⚑ Escalated.
2. **Priya Raghunathan** — Email · "What are the annual property taxes?" (grounded answer available).
3. **Leo Martins** — SMS · "Can I see the house Saturday?" (scheduling flow).
4. **Gurpreet Sandhu** — SMS · seller-side follow-up (fr-CA not needed; EN).

### Center: Thread

- **Thread header:** contact name + channel + consent state chips per channel (Verified/Assumption/Missing) + **"Transfer to human" button always visible** (accent outline) + thread menu.
- **AI disclosure strip (persistent top of composer area):** "Northstar AI assistant — drafts for your review. Buyers are told they are interacting with an AI assistant and can reach a human at any time." (fr: « Assistant IA Northstar… ») with Generated chip.
- **Messages:** bubbles — contact left (surface-2), agent/AI right (accent-tint). AI-sent messages carry a small "AI assistant" tag under the bubble (plain-language disclosure in the message itself: "I'm Northstar's AI assistant working with Maya Chen…").
- **Escalation banner** (in Jonah's thread, red-orange, ShieldAlert): "Escalated to human — topic: negotiation (closing flexibility). The AI will not respond in this thread. A4 — licensed registrant only." Composer is replaced by a locked composer (grey, lock icon, reason text). Another escalation example banner in history: legal question auto-escalated.
- **Draft composer (Priya's thread, default view):** AI draft card above the input: violet-grey border, Generated chip, the drafted answer "The 2024 property taxes for 48 Wrenwood Ave are approximately $8,940" with **CitationRef chips inline** `[MPAC-mock record · retrieved Jun 8]` and `[dossier §profile]`; footer: "Grounded in 2 sources · confidence high · autonomy A1 draft — nothing sends without you." Buttons: Send as-is (A2, enabled — consent Verified), Edit, Regenerate, Discard.
- **Ungrounded guardrail example:** draft attempt where the model lacks evidence shows a Blocked draft card: "No approved evidence for 'waterproofing warranty'. Draft refused — ask the seller or mark as unknown." (fail-closed, with reason).
- Composer: multiline input, channel indicator, template picker (approved templates, mono IDs), language toggle per thread (fr-CA contacts auto-French), send button respecting autonomy + consent (BlockedAction popover if consent missing: "SMS consent expired — request re-consent first").

### Right: Context rail

- **Contact card:** avatar, name, intent score + ConfidenceBar, links to Seller 360 / buyer record.
- **Consent card:** per-channel chips with expiry.
- **Property context card:** if thread references a listing — thumbnail + address + price + link to dossier.
- **Grounding panel:** sources available to the AI for this thread (approved docs, dossier facts) as chips; anything used in the current draft highlighted accent-tint.
- **Timeline mini:** last 5 events for this contact.

## Animation

- **Mount:** three panes stagger in (list 0ms, thread 60ms, rail 120ms), `y:10→0 opacity 0→1`, 220ms.
- **Thread switch:** messages fade/slide 160ms; draft card unfolds with height spring 380/34; citations pop with 20ms stagger.
- **New message arrival (demo live-feel):** list row slides to top, thread appends bubble with spring scale 0.96→1; toast "New message — Jonah Whitfield (escalated)".
- **Escalation banner:** slides down from thread top 240ms; locked composer greys with 200ms cross-fade.
- **Send:** bubble animates out-right with check; "AI assistant" tag fades in under it.
- **Typing indicator:** three-dot bounce in surface-2 bubble when simulating contact reply.

## Interactions

- "Transfer to human" instantly flips thread to human mode (banner emerald "You have this thread — AI drafting paused"), writes audit event.
- Editing the draft preserves citation bindings; removing a cited sentence removes its citation (visible link between text and evidence).
- Escalation rules visible via "Why escalated?" → popover with the policy rule (`ESC-NEG-001 negotiation → human-only`, version, source).
- Consent-missing send attempts are BlockedActions with exact remediation.

## States

Empty inbox (`empty-inbox.svg` + "No conversations yet"); no-consent thread (composer locked, "Request consent" CTA); after-hours (voice threads show calling-hours notice amber); fr-CA thread fully French with English toggle.

## Assets

`avatar-jonah.png`, `property-wrenwood-exterior.jpg` (context rail thumbnail), `empty-inbox.svg`.
