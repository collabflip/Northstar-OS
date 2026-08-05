# Showing Calendar — `/calendar`

**Purpose:** One calendar for showings, open houses, and consultations — with a deliberate, visible boundary around restricted access information.

## Layout

- **Page header:** h1 "Calendar" · timezone chip "America/Toronto" · view toggle (Week | Month | Agenda) · filter chips (Showings / Open houses / Consultations / Deadlines) · CTA "Book appointment".
- **Restricted-access notice (Banner `info`, persistent):** "Access instructions (lockbox, alarm, gate codes) are never displayed or stored here. Showing access is confirmed with the listing brokerage through approved procedures." with lock icon — the *absence* is a designed feature.
- **Week view (default):** 7-column grid, 8 am–8 pm, today column tinted accent-tint at 30%; current-time hairline (red-orange 1px) with tabular time label.

**Seeded events (week of Jun 9–13):**
- **Tue 13:30–14:00 — Showing:** Jonah Whitfield @ 48 Wrenwood Ave (accent block; attendee avatar; intent dot amber "high-intent").
- **Wed 10:00–10:45 — Consultation:** Eleanor Vance estate — 9 Argyle Cres (slate block; notes chip "Probate context").
- **Thu 15:00 — Lawyer call:** Vance file exception review (red-orange left edge; linked to transaction exception).
- **Sat 14:00–16:00 — Open house:** 48 Wrenwood Ave (wide block, `Home` icon; badge "Sign-in sheet ready").
- **Fri 17:00 — Condition deadline:** 15 Bessborough financing (deadline diamond marker, amber).

**Event card anatomy:** type icon, title (body-sm 600), property address (ink-3), attendee chips/avatar, StatusPill (Confirmed / Tentative dashed outline / Needs confirmation amber), consent-safe note for open-house sign-ins.

- **Agenda view:** grouped-by-day list alternative (same data, denser).
- **Right mini-panel (collapsible 300px):** "Upcoming 48 h" list + "Pending confirmations" queue (2 items with Confirm/Reschedule quick actions, A2) + mini month picker.

### Booking dialog (modal, 560px)

"Book appointment": type select (Showing / Consultation / Open house), contact search (consent-checked — selecting a contact shows their consent chips inline; booking over SMS confirmation is Blocked if SMS consent missing, with reason), property select, datetime + duration, channel confirmation preview (bilingual message, template `appt-confirm@v2`), booking button with autonomy note "A2 — reversible, confirmation sent to consented channel only".

### Event detail popover

Anchored popover: full details, linked records (seller/property/conversation), actions: Confirm, Reschedule (A2, sends updated confirmation), Cancel with notice (reason required), "Open related conversation". **Access section deliberately renders:** "Access instructions — restricted. Not stored in this system." (grey locked row).

## Animation

- **Mount:** grid fades in 180ms; events pop with 25ms stagger (`scale 0.95→1`); current-time hairline draws vertically 400ms.
- **View switch (Week/Month/Agenda):** layout cross-fade 200ms; shared events animate position via layoutId where feasible.
- **Event hover:** popover springs in (120ms delay, spring 400/32); event blocks brighten + lift.
- **Drag-to-reschedule:** block scales 1.02 while dragging, target slot shows accent outline; drop → confirmation sheet (same policy-aware pattern; sends updated confirmations); cancelled drops ease back 240ms.
- **Booking modal:** step content slides 200ms; confirmation preview message types itself in (subtle, 300ms fade per line).
- **Deadline diamonds:** gentle 2.4s pulse for deadlines < 48 h away (reduced-motion safe: static).

## Interactions

- All confirmations/reschedules generate A2 messages with payload preview before send; everything writes audit events.
- Consent enforcement inline: picking a no-consent contact shows BlockedAction on the "Send confirmation" toggle with remediation ("Request consent via email first").
- Filters animate events out/in (fade+scale 160ms); timezone chip explains DST-safe storage on hover.
- fr-CA: weekday/month names localized, 24 h format toggle respected.

## States

Empty week ("Nothing scheduled — book a consultation" CTA); tentative events dashed; conflicting booking attempt → inline conflict warning (amber) with suggested slots; past events desaturated 60%.

## Assets

`avatar-jonah.png`, `avatar-sofia.png` (attendees); property thumbnails in popovers reuse dossier images.
