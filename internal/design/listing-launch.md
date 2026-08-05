# Listing Launch Board — `/listings/:id/launch`

**Demo record:** 48 Wrenwood Ave — launch workspace created after strategy approval.

**Purpose:** Mission control for taking a listing to market: checklists, media, copy variants, disclosures, campaign calendar, and a readiness gate that cannot be bypassed.

## Layout

- **Breadcrumb:** Pipeline / Pelletier / 48 Wrenwood Ave / Launch.
- **Header:** h1 "Launch — 48 Wrenwood Ave" · StatusPill "Preparing" · target launch date chip "Fri Jun 13, 9:00 am ET" · right: **Launch readiness meter** (circular progress, 78%, accent stroke) + primary button "Request launch approval" (A4, BlockedAction until readiness 100% + broker approval).
- **Board grid:** 2-column masonry of workspace cards (left 7 / right 5).

### Left column

1. **Preparation checklist card:** interactive checklist grouped (Interior / Exterior / Paperwork): "Declutter main floor ✓ (Maya)", "Touch-up paint, front door ✓", "Utility costs to seller — requested, waiting" (MissingSlot, linked), "Seller property information statement — draft ready" (Generated chip → opens doc). Checkboxes toggle with check animation; assignee avatars; progress 9/12 in header.
2. **Photography shot list card:** table of 12 shots (Front elevation / Kitchen island / …) with StatusPills (Captured / Scheduled Jun 11 / Weather hold amber). Photographer booking row (Third-party chip "BrightFrame Studio — confirmed").
3. **Media QA card:** thumbnails of `property-wrenwood-living.jpg`, `property-wrenwood-kitchen.jpg` etc. in a 3-col grid, each with QA chips: "Exposure ✓ · Verticals ✓ · Resolution ✓" (Verified) and one flagged "Bedroom 2: personal photos visible — retouch or retake" (Conflict). **Virtual-staging disclosure pair:** original living room vs `property-wrenwood-staged.jpg` side-by-side with a violet-grey Generated chip on the staged version and a mandatory disclosure text block: "Virtually staged" watermark preview + disclosure copy for MLS remarks (auto-attached, cannot be unchecked — locked row with lock icon and rule `ON-ADV-007`).
4. **Listing copy card:** EN + fr-CA tabs; generated copy block (Generated chip) with inline CitationRefs to dossier facts; "Edit" (creates new version), "Send for approval" → routes to `/approvals` item #1.

### Right column

5. **Feature sheet card:** preview thumbnail (styled one-pager mock built in HTML: serif headline, property photo, key specs) with Download/Edit; Generated chip.
6. **Variants card:** accordion of Social (3 caption variants), Email (announcement + open-house invite, EN/fr), Ads (2 variants with budget caps). Each variant row: preview text, channel chip, status (Draft A1 / Approved emerald / Needs approval amber).
7. **Open-house plan card:** Sat Jun 14, 2–4 pm; host Maya; sign-in sheet (CASL-compliant consent language preview); feedback form; StatusPill Scheduled.
8. **Campaign calendar card:** 14-day mini calendar strip with scheduled touch icons (email, social, ad, open house); frequency-cap indicator "max 2/wk per contact" amber-tint info; clicking a day opens the scheduled items popover.
9. **Inquiry routing rules card:** "New inquiries → Conversation Console, AI draft + Maya notified · High-intent → immediate SMS to Maya" (A2 reversible), edit opens rules dialog.
10. **Restricted-access notice card** (grey, lock icon): "Lockbox codes, alarm codes, and access instructions are never stored in model context or shown here. Access details are handled through the restricted showing-instructions vault." — a deliberate, visible exclusion.

### Launch-readiness checklist (bottom, full width, surface-2 well)

Horizontal stepper of 8 gates: Strategy approved ✓ · Media complete (78%) · Copy approved (pending) · Disclosures attached ✓ · Campaign approved (pending) · Routing rules set ✓ · Broker review (waiting Daniel) · Payload bound & hash locked (pending). Each step: check/clock/lock icon; the final step always shows the eventual payload hash placeholder.

## Animation

- **Mount:** cards stagger 45ms; readiness meter arc draws 0→78% over 900ms (stroke-dashoffset); checklist progress counts.
- **Checkbox toggle:** check draws in (path animation 200ms) + row text subtle strike-fade for done items; progress chip ticks.
- **Media QA thumbs:** hover zoom 1.04 with QA chip overlay fade-in 140ms; flagged photo has red-orange corner ribbon.
- **Staging pair:** hovering either image cross-highlights the other (outline pulse 300ms); disclosure row shakes gently (2px, 2 cycles) if user attempts to uncheck the locked disclosure.
- **Stepper:** completed segments fill accent with 300ms sweep when a gate flips; "Request launch approval" unblocks with a one-time emerald glow pulse.
- **Calendar strip:** today marker pulses slowly; scheduled icons pop in with 20ms stagger on scroll-into-view.

## Interactions

- Checklist items assignable (avatar menu), due dates, and evidence-attached (photo upload slot per item).
- Copy/variants editing is versioned; any edit after approval invalidates approval visibly (StatusPill flips to "Approval stale — re-review", freshness red-orange).
- "Request launch approval" opens the A4 approval sheet (same payload-bound pattern as `/approvals`): full launch payload hash, destinations, PolicyGatePanel.
- Every Generated block has "Why this?" → EvidenceDrawer with the dossier lineage.

## States

Weather-hold shot state (amber banner on shot list); approval-stale state; launch-day state (readiness 100%, header flips to "Ready — awaiting broker commit"); post-launch state (board becomes read-only record with "Live listing" StatusPill).

## Assets

`property-wrenwood-exterior.jpg`, `property-wrenwood-living.jpg`, `property-wrenwood-kitchen.jpg`, `property-wrenwood-staged.jpg`.
