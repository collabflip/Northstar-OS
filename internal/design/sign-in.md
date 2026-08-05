# Sign-In — `/login`

**Purpose:** Brand moment + frictionless seeded-role entry into the demo tenant. Sets the "quiet authority" tone and is immediately truthful about what the demo is.

## Layout

Full-viewport split, no app chrome:
- **Left panel (42%, min 480px):** `login-hero.png` full-bleed with a deep-pine gradient scrim (`linear-gradient(180deg, rgba(18,49,44,0.55), rgba(18,49,44,0.85))`). Bottom-left overlaid: north-star `logo.svg` (warm white stroke), then a Source Serif 4 line: *"Guidance you can audit."* (fr: *« Des décisions traçables, à chaque étape. »*) and a small caption: "Northstar SellerOS · Built for Canadian registrants."
- **Right panel (58%, paper background, centered 400px column):** sign-in card.

## Elements & Content

1. **Wordmark:** `logo.svg` + "Northstar SellerOS" (Inter 18px 600, pine).
2. **Heading:** h1 "Sign in to your workspace" (fr: "Ouvrir une session").
3. **Form:** email + password fields (shadcn Input, 44px tall, pre-filled for demo: `maya.chen@harbourline.ca` / `••••••••••`), "Sign in" primary button (accent, full width, 44px). SSO row: "Continue with brokerage SSO" ghost button (truthful tooltip: "SSO not configured in demo").
4. **Seeded role quick-entry** (the demo-critical element): meta label "Explore as a seeded role" above a 2×3 grid of role cards: Maya Chen — Sales Representative · Daniel Okafor — Broker of Record · Sofia Tremblay — Transaction Coordinator · Amir Haddad — FINTRAC Compliance Officer · Nadia Pelletier — Seller (portal) · Buyer lead view. Each card: avatar, name (body-sm 600), role (meta ink-3). Clicking signs in with that role's permissions.
5. **Truthful demo banner** (Banner `truthful`): "Demonstration environment. Seeded Ontario data; external integrations run as mock providers and are labeled as such." (fr: « Environnement de démonstration… »)
6. **Footer meta:** "English | Français (Canada)" toggle · "Privacy · Terms" text links · version chip `v0.9.2-demo` mono.

## Animation

- **Load:** left panel image scales `1.06→1` over 900ms ease-out (subtle Ken Burns); scrim fades in 400ms. Logo star does its one allowed twinkle (opacity 0.4→1→0.85, 1.6s).
- **Right column:** heading, form, role grid stagger 60ms each, `y: 16px→0, opacity 0→1`, 280ms.
- **Role cards:** hover `y:-2px` + border `line→accent` 140ms; click ripple + scale 0.98 then route transition.
- **Sign-in submit:** button enters loading state (spinner replaces label, width preserved); success → checkmark morph 200ms → page transition into `/`.

## Interactions

- Language toggle switches all strings instantly (no reload).
- Role card selection is the primary path (no real auth failure states needed beyond a gentle inline error if fields emptied: "Enter an email address" ink red-orange below field).
- Keyboard: full tab order; role cards are real buttons with focus rings.

## States

- Default (pre-filled), loading, error (inline), logged-out-expired variant ("Your session expired — sign in again" info banner replacing demo banner).

## Assets

`/login-hero.png`, `/logo.svg`, role avatars (`avatar-maya.png`, `avatar-daniel.png`, `avatar-sofia.png`, `avatar-amir.png`, `avatar-pelletier.png`).
