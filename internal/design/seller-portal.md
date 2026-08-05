# Seller Portal — `/portal`

**Audience:** Nadia & Marc Pelletier (signed in as Seller). **Tone shift:** this is the warm, reassuring, plain-language, seller-facing face of Northstar — more editorial, more serif, more whitespace — while keeping the same evidence discipline underneath. Fr-CA is Nadia's default (portal renders French first with EN toggle).

## Layout

Portal chrome replaces app chrome: minimal top bar — `logo.svg` + "Northstar · Espace vendeur" · language toggle FR|EN · "Message Maya" button · Nadia avatar. Soft paper background; `portal-hero-texture.png` behind the header only (very subtle).

### Section 1 — Welcome header (centered, editorial)

- Serif h1 (34px): "Bonjour Nadia et Marc — voici où en est votre vente." / EN: "Here's where your sale stands."
- Plain-language status line: "Votre dossier est prêt. Prochaine étape : la revue de stratégie avec Maya, jeudi 10 h." with a soft accent underline animation.
- **Progress path:** horizontal 6-step journey (Rencontre ✓ · Dossier ✓ · Stratégie — en cours · Préparation · Lancement · Offres & clôture) — 2 emerald checks, current node pulsing gently, future nodes grey dots. Fr labels with EN toggle.

### Section 2 — Your property (card, 7+5)

- `property-wrenwood-exterior.jpg` large rounded image with soft hover zoom.
- Right: serif property summary ("48 Wrenwood Ave — Davisville, Toronto"), 4 spec chips in plain words ("4 chambres · 3 salles de bain · 33 × 122 pi"), and the **estimated value range card**: serif figures "1 180 000 $ – 1 310 000 $" (fr-CA formatting, nbsp) + plain explanation: "Une estimation préparée à partir de 5 ventes comparables — ce n'est **pas** une évaluation ni un prix garanti. Maya en discutera avec vous." + "D'où vient ce chiffre ?" link opening the friendly evidence drawer (simplified lineage: sources in plain words, no hashes — but honest: "registre municipal, 8 juin" etc.).

### Section 3 — Market snapshot (3 cards)

Plain-language stat cards with tiny sparklines: "Prix médian des maisons détachées à Davisville — 1,62 M$" · "Délai moyen de vente — 14 jours" · "Tendance 90 jours — stable ↗". Each with a small "Source" meta line and freshness ("il y a 2 h"). Editorial spacing, serif figures.

### Section 4 — Positioning options (interactive, the consultation teaser)

Three selectable cards (radio): "Prix d'appel stratégique" / "Prix au marché" (pre-selected by Maya, chip "Recommandé par Maya" accent) / "Prix premium". Each card: 2 plain sentences + trade-off line ("Délai probable plus court" / "Risque : moins d'offres multiples"). Selecting one shows a gentle note: "Votre choix sera discuté avec Maya — rien n'est décidé sans vous." (no commit — it's a preference signal; writes to seller record).

### Section 5 — Preparation plan (checklist, warm)

"Ce que nous ferons ensemble" — timeline-style checklist with friendly copy and dates: "Peinture de la porte d'entrée — fait ✓" · "Séance photo — mercredi 11 juin (photographe confirmé)" · "Visite libre — samedi 14 juin, 14 h à 16 h". Items Maya completes tick automatically; seller items ("Rassembler les factures de services publics") have a friendly "J'ai ça !" upload button.

### Section 6 — Timeline & communication plan

- Estimated timeline strip: Photo 11 juin → Lancement 13 juin → Visite libre 14 juin → Revue des offres (si applicable) semaine du 16 juin — all marked "estimations" with a plain disclaimer line.
- Communication plan card: "Vous recevrez un résumé chaque vendredi, en français, par courriel. Questions urgentes : Maya vous répond le jour même." + channel icons with the seller's actual consent states translated into friendly words ("Vous avez accepté les courriels ✓ · Pas de textos pour l'instant — modifier").

### Section 7 — Your team & footer

Team card: Maya (avatar, "Votre représentante"), Sofia ("Coordonnatrice des transactions"), Daniel ("Courtier responsable") with "Envoyer un message" buttons. Footer: brokerage ID line (Harbourline Realty Inc., courtage — RECO), privacy link, plain-language AI note: "Northstar utilise un assistant IA pour préparer des ébauches et des résumés. Les décisions sont toujours prises par des personnes." — honest, warm.

## Animation

- **Load (the one cinematic moment in the product):** hero texture fades in 600ms; serif headline words rise with 60ms stagger (`y: 14→0`, 400ms, ease-out); status line underlines draw 500ms; progress path draws node-by-node (6 × 150ms) with check draw-ins.
- **Scroll:** sections reveal `y: 24→0, opacity 0→1`, 350ms, trigger at 20% viewport (simple, single-shot — no pinning, no parallax: restraint).
- **Positioning cards:** hover lift -2px + border accent; selection springs a 2px accent ring + check pop.
- **Checklist ticks:** when seller uploads ("J'ai ça !"), item flips with check draw-in + warm toast "Merci ! Maya en est informée."
- **Sparklines:** draw-in 600ms on reveal.
- **Reduced motion:** everything collapses to 120ms fades.

## Interactions

- FR/EN toggle re-renders everything instantly (fr-CA first-class, not an afterthought).
- "D'où vient ce chiffre ?" friendly evidence drawer — same lineage truth, translated to human language, still showing freshness and confidence ("niveau de confiance : élevé — 87 %").
- Positioning preference + prep uploads write back to the seller record (Maya sees them in Seller 360 — closes the loop).
- "Message Maya" opens a simple portal message composer (goes to Conversation Console thread).

## States

Pre-dossier state (progress at step 1, sections locked with friendly "Maya prépare votre dossier" placeholders); post-launch state (progress advances, "Votre maison est en ligne" moment); offer-phase state (teaser card "Des offres ont été reçues — Maya vous contactera pour les examiner ensemble", never offer details in portal without the agent).

## Assets

`portal-hero-texture.png`, `property-wrenwood-exterior.jpg`, `avatar-maya.png`, `avatar-sofia.png`, `avatar-daniel.png`, `avatar-pelletier.png`, `logo.svg`.
