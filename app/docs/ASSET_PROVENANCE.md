# Asset Provenance — Visual Assets

Release-mandate data decontamination record. Every visual asset shipped with
Northstar SellerOS is listed below with its source and fictional status.

**Assertion:** no real property photography, no real logos, and no real people
appear in any shipped asset. All raster imagery was AI-generated during this
project and depicts fictional scenes; all vector artwork was hand-authored for
the fictional "Harbourline Realty Inc., Brokerage" demo universe.

Note: the repository has no `src/assets/` directory; all visual assets live in
`public/` and are referenced from `src/` pages/components. The mock listing
integration (`api/integrations/mockListingData.ts`) references **no imagery**
(no photo URLs, no data URIs) — listing photos in the UI come exclusively from
the synthetic files below.

| File | Type | Used by | Source | Date | Fictional status |
| --- | --- | --- | --- | --- | --- |
| `public/property-demo-001-exterior.jpg` | Listing photo (exterior) | ListingLaunch, Portal, Conversations, pipelineMeta | AI-generated via Kimi image generation during this project, fictional scene | 2026-08-02 | Fictional — not a real property |
| `public/property-demo-001-living.jpg` | Listing photo (living room) | ListingLaunch | AI-generated via Kimi image generation during this project, fictional scene | 2026-08-02 | Fictional — not a real property |
| `public/property-demo-001-kitchen.jpg` | Listing photo (kitchen) | ListingLaunch | AI-generated via Kimi image generation during this project, fictional scene | 2026-08-02 | Fictional — not a real property |
| `public/property-demo-001-staged.jpg` | Listing photo (virtual staging demo) | ListingLaunch | AI-generated via Kimi image generation during this project, fictional scene | 2026-08-02 | Fictional — synthetic staging render |
| `public/property-demo-002.jpg` | Listing photo (comparable property) | pipelineMeta | AI-generated via Kimi image generation during this project, fictional scene | 2026-08-02 | Fictional — not a real property |
| `public/property-demo-003.jpg` | Listing photo (comparable property) | pipelineMeta | AI-generated via Kimi image generation during this project, fictional scene | 2026-08-02 | Fictional — not a real property |
| `public/avatar-maya.png` | Avatar (Maya Chen, fictional persona) | Layout, conversations UI | AI-generated via Kimi image generation during this project, fictional person | 2026-08-02 | Fictional — not a real person |
| `public/avatar-daniel.png` | Avatar (Daniel Okafor, fictional persona) | Team UI | AI-generated via Kimi image generation during this project, fictional person | 2026-08-02 | Fictional — not a real person |
| `public/avatar-sofia.png` | Avatar (Sofia Tremblay, fictional persona) | Team UI | AI-generated via Kimi image generation during this project, fictional person | 2026-08-02 | Fictional — not a real person |
| `public/avatar-amir.png` | Avatar (Amir Haddad, fictional persona) | Team UI | AI-generated via Kimi image generation during this project, fictional person | 2026-08-02 | Fictional — not a real person |
| `public/avatar-pelletier.png` | Avatar (Pelletier sellers, fictional personas) | Contacts/seller UI | AI-generated via Kimi image generation during this project, fictional people | 2026-08-02 | Fictional — not real people |
| `public/avatar-jonah.png` | Avatar (Jonah Whitfield, fictional persona) | Conversations UI | AI-generated via Kimi image generation during this project, fictional person | 2026-08-02 | Fictional — not a real person |
| `public/comp-map.png` | Comparables map illustration | PropertyDossier / valuations UI | AI-generated via Kimi image generation during this project, fictional map | 2026-08-02 | Fictional — depicts no real geography |
| `public/login-hero.png` | Login page hero illustration | Login page | AI-generated via Kimi image generation during this project, fictional scene | 2026-08-02 | Fictional |
| `public/portal-hero-texture.png` | Portal hero background texture | Portal | AI-generated via Kimi image generation during this project, abstract texture | 2026-08-02 | Fictional |
| `public/logo.svg` | Northstar product logo | Layout, Footer, Portal, Settings | Hand-authored vector artwork created for this project | 2026-08-02 | Fictional — no real brand/logo |
| `public/empty-inbox.svg` | Empty-state illustration | EmptyState component | Hand-authored vector artwork created for this project | 2026-08-02 | Fictional |

## Gradient / placeholder imagery

UI placeholders (skeleton screens, gradient panels) are CSS gradients generated
in code — no image files, no external sources, fully synthetic.

## Compliance notes

- Property photos were renamed during the P0 decontamination pass (previous
  filenames embedded real street names; now `property-demo-00x`) so filenames
  no longer reference real street names; the underlying images are unchanged
  AI-generated fictional scenes.
- Any future asset added to `public/` must be recorded in this table before
  merge, with source and fictional status stated.
